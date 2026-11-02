# Arquitectura

BRICKSUMO separa el conocimiento del protocolo de las APIs de hardware. La
regla principal es sencilla: el núcleo no sabe si los bytes viajan por Web
Bluetooth, WebUSB o un transporte falso.

## 1. Objetivos

- Implementar la comunicación con hubs Pybricks sin depender de la interfaz de
  usuario.
- Poder probar la lógica completa sin hardware.
- Aislar los adaptadores de navegador para que un fallo de hardware no
  contamine el núcleo.
- No usar almacenamiento local del navegador.
- Mantener el protocolo en TypeScript estricto y con dependencias mínimas.

## 2. Fuera de alcance por ahora

- La interfaz de usuario de BRICKSUMO.
- La compilación real de Python a `.mpy`.
- Persistencia de proyectos o preferencias.
- Un catálogo completo de firmware.
- Garantizar que los adaptadores funcionan en todos los navegadores y sistemas.

## 3. Capas

```text
┌──────────────────────────────────────────────┐
│ UI / CLI / futuras integraciones             │
├──────────────────────────────────────────────┤
│ HubSession · flashFirmwareBle · ZIP          │
├──────────────────────────────────────────────┤
│ PybricksTransport · BootloaderLink           │
├──────────────────────────────────────────────┤
│ Fake · Web Bluetooth · WebUSB · WebDFU       │
└──────────────────────────────────────────────┘
```

La dependencia siempre apunta hacia abajo. `protocol/` no importa
`transport/`, `session/` ni `firmware/`. `session/` no conoce Web Bluetooth ni
WebUSB: sólo usa las interfaces de transporte.

## 4. Módulos

| Ruta | Responsabilidad |
| --- | --- |
| `src/protocol/bytes.ts` | Lectura/escritura little-endian y copias |
| `src/protocol/checksums.ts` | XOR, suma complemento y CRC-32 |
| `src/protocol/version.ts` | Parser y comparador de versiones |
| `src/protocol/ble-pybricks.ts` | UUIDs, comandos, eventos, capacidades, formatos |
| `src/protocol/profile.ts` | Funciones disponibles según el perfil |
| `src/protocol/nus.ts` | UUIDs, cabecera, bloques y checksum NUS |
| `src/protocol/lwp3-bootloader.ts` | Comandos y respuestas del bootloader |
| `src/protocol/usb.ts` | VID/PIDs, control requests y framing USB |
| `src/protocol/mpy.ts` | Contenedor Multi-MPY6 |
| `src/protocol/firmware.ts` | Metadatos v2, nombre de hub e imagen |
| `src/transport/types.ts` | Interfaces de transporte |
| `src/transport/notification-queue.ts` | Cola de mensajes con esperas |
| `src/transport/fake-pybricks.ts` | Hub falso con comandos, slots y NUS |
| `src/transport/fake-bootloader.ts` | Bootloader falso con flash y checksums |
| `src/session/hub-session.ts` | Descarga, arranque, REPL, stdin y AppData |
| `src/session/legacy-upload.ts` | Descarga NUS con espera de checksums |
| `src/firmware/firmware-zip.ts` | Lectura de ZIP oficiales |
| `src/firmware/flash-ble.ts` | Orquestación segura del flasheo LWP3 |
| `src/adapters/*` | Web Bluetooth, WebUSB y WebDFU experimentales |
| `src/cli/main.ts` | Comandos de demostración e inspección |

## 5. Interfaces

### 5.1 `PybricksTransport`

```ts
interface PybricksTransport {
    readonly info: HubInfo;
    writeCommand(command: Uint8Array): Promise<void>;
    onEvent(listener: (data: Uint8Array) => void): Unsubscribe;
    readonly legacyNus: LegacyNusTransport | null;
    disconnect(): Promise<void>;
}
```

`HubInfo` contiene nombre, versión de firmware, versión de perfil, capacidades
y tipo de transporte. El transporte entrega eventos crudos; la decodificación
es responsabilidad de `HubSession`.

### 5.2 `LegacyNusTransport`

```ts
interface LegacyNusTransport {
    writeChunk(data: Uint8Array): Promise<void>;
    writeRaw(data: Uint8Array): Promise<void>;
    onChecksum(listener: (checksum: number) => void): Unsubscribe;
    onData?(listener: (data: Uint8Array) => void): Unsubscribe;
}
```

`writeChunk` divide el bloque lógico en escrituras de 20 bytes. `writeRaw` se
usa para el comando de REPL y para stdin antiguo. `onData` es opcional y
entrega todas las notificaciones NUS; en perfiles anteriores a `1.3.0` stdout
viaja por ese canal. `HubSession` ignora esos bytes mientras dura una descarga
para no confundir checksums con texto.

### 5.3 `BootloaderLink`

```ts
interface BootloaderLink {
    getInfo(): Promise<BootloaderInfo>;
    send(
        message: Uint8Array,
        options?: { readonly withResponse?: boolean },
    ): Promise<void>;
    waitForMessage(
        predicate: (message: Uint8Array) => boolean,
        timeoutMs: number,
    ): Promise<Uint8Array>;
    disconnect(): Promise<void>;
}
```

La interfaz no impone BLE: un enlace USB o un doble de prueba pueden
implementarla. `withResponse` sólo tiene efecto en BLE.

## 6. Flujos

### 6.1 Conexión

1. El adaptador pide el dispositivo y conecta el transporte.
2. Lee la información del hub y construye `HubInfo`.
3. `HubSession` calcula `ProfileFeatures` y el formato de programa.
4. `HubSession` se suscribe a los eventos crudos y los decodifica.

Si el perfil es anterior a `1.2.0`, no hay característica de capacidades y la
descarga usa NUS. Si es anterior a `1.4.0`, `StartUserProgram` no lleva
identificador. Si es anterior a `1.3.0`, stdout viaja por NUS.

### 6.2 Descarga moderna

```text
validar tamaño y slot
  → WriteUserProgramMeta(0)
  → WriteUserRam(offset, bloque) × N
  → WriteUserProgramMeta(size)
  → StartUserProgram(slot)
```

El tamaño de bloque se deriva de `maxWriteSize - 5`. La sesión no inventa un
MTU ni un tamaño de escritura: si el hub no publica capacidades, la descarga
moderna no se intenta.

### 6.3 Descarga antigua

```text
cabecera de tamaño
  → esperar checksum
  → bloque de 100 bytes en escrituras de 20
  → esperar checksum
  → repetir
```

La espera del checksum se registra **antes** de escribir el bloque. Así se
evita la carrera clásica en la que la respuesta llega antes de que el host
empiece a esperarla.

### 6.4 Flasheo

```text
ZIP → metadata + base → imagen + checksum
  → GetInfo → validar tipo
  → EraseFlash → InitLoader
  → ProgramFlash × N + GetChecksum periódico
  → validar count/checksum → StartApp
```

El orquestador no tolera un timeout de borrado salvo que el llamador active
`continueOnEraseTimeout`. Esa opción existe porque algunos hubs no responden a
`EraseFlash`, pero no se usa por defecto.

### 6.5 Cola de notificaciones

`NotificationQueue` resuelve dos problemas:

- una respuesta puede llegar antes de que el código empiece a esperarla;
- varias esperas pueden competir por mensajes del mismo canal.

Los mensajes se encolan y cada espera consume el primero que cumpla su
predicado. Al cerrar la cola se rechazan todas las esperas pendientes.

## 7. Errores

| Error | Significado |
| --- | --- |
| `ProtocolError` | Los bytes no cumplen el formato esperado |
| `TransportError` | El enlace falló o se cerró |
| `TimeoutError` | Se agotó una espera |
| `ChecksumMismatchError` | El checksum del hub no coincide |
| `HubTypeMismatchError` | El firmware no corresponde al hub |
| `UnsupportedOperationError` | La operación no existe para ese perfil o transporte |

Después de un `ProtocolError` no se debe continuar una escritura ni un
flasheo. La capa de sesión registra el último error y lo notifica sin romper a
los demás suscriptores.

## 8. Pruebas

La estrategia es «falso primero»:

- `FakePybricksTransport` implementa comandos, slots, eventos y NUS.
- `FakeBootloaderLink` implementa erase, init, program, checksums y arranque.
- Los tests cubren protocolo, sesión, descarga antigua y flasheo.

Los adaptadores de hardware no se prueban con mocks que fingen ser un hub
real: se validan con hardware y se documentan en
[`HARDWARE-VALIDATION.md`](HARDWARE-VALIDATION.md). Mientras tanto, no forman
parte de la ruta por defecto.

## 9. Sin almacenamiento local

La prohibición se aplica en tres capas:

1. `no-restricted-globals` y `no-restricted-properties` en ESLint;
2. `scripts/check-no-storage.mjs`, que recorre `src/`;
3. `npm run verify` en CI.

No hay una capa de persistencia «por si acaso». Si en el futuro hace falta,
será una decisión explícita con su propio ADR.

## 10. Empaquetado

- Módulos ESM con `NodeNext`.
- Imports relativos con extensión `.js`.
- TypeScript estricto, incluidos `noUncheckedIndexedAccess` y
  `exactOptionalPropertyTypes`.
- `dist/` se genera con `tsc`.
- El paquete expone `.` y `./protocol`; los adaptadores no se exportan desde
  la raíz.

## 11. Decisiones relacionadas

- [ADR 0001: núcleo sin dependencias](adr/0001-nucleo-de-protocolo-sin-dependencias.md)
- [ADR 0002: transportes falsos antes que hardware](adr/0002-transportes-falsos-antes-que-hardware.md)
- [ADR 0003: sin almacenamiento local](adr/0003-sin-almacenamiento-local.md)
- [ADR 0004: firmware v2 y checksums](adr/0004-firmware-v2-y-checksums.md)
- [ADR 0005: compilador MPY diferido](adr/0005-compilador-mpy-diferido.md)
- [ADR 0006: adaptadores experimentales aislados](adr/0006-adaptadores-experimentales-aislados.md)
