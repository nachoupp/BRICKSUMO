# BRICKSUMO · capa de comunicación Pybricks

BRICKSUMO es una aplicación para hubs LEGO que ejecutan Pybricks. Este
repositorio contiene, por ahora, **solo la capa de comunicación**: protocolo,
transportes, sesión de hub y orquestación de firmware. La interfaz de usuario
se construirá encima en una fase posterior.

La implementación es TypeScript, sin almacenamiento local del navegador y con
el núcleo de protocolo separado de cualquier API de hardware.

## Estado

| Área | Estado |
| --- | --- |
| Protocolo BLE Pybricks | Implementado y probado con transporte falso |
| Protocolo NUS antiguo | Implementado y probado con transporte falso |
| Bootloader LWP3 | Implementado y probado con bootloader falso |
| Framing USB Pybricks | Implementado y probado en aislamiento |
| Lectura de ZIP de firmware | Implementado con `@pybricks/firmware` |
| Ensamblado y checksums de firmware | Implementado y probado con ZIP oficial |
| `HubSession` | Implementado y probado con hub falso |
| Adaptadores Web Bluetooth / WebUSB / WebDFU | Experimentales, sin validar en hardware |
| Interfaz de usuario | Fuera de alcance por ahora |

Los adaptadores de hardware viven en `src/adapters/` y **no forman parte de la
ruta por defecto** hasta que exista validación con hubs reales. Consulta
[`docs/HARDWARE-VALIDATION.md`](docs/HARDWARE-VALIDATION.md).

## Requisitos

- Node.js `>=22.12.0`
- npm `>=10`

## Instalación y verificación

```sh
npm ci
npm run verify
```

`npm run verify` ejecuta, en este orden:

1. escaneo que prohíbe `localStorage`, `sessionStorage` e `indexedDB` en `src/`;
2. typecheck estricto;
3. ESLint;
4. tests con Vitest;
5. build de `src/` a `dist/`.

## Uso rápido con un hub falso

El hub falso implementa la secuencia de comandos, los slots y los eventos de
estado. Sirve para probar la capa completa sin hardware.

```ts
import {
    FakePybricksTransport,
    HubSession,
    encodeMultiMpy6,
} from 'bricksumo';

const hub = new FakePybricksTransport({
    profileVersion: '1.5.0',
    maxWriteSize: 20,
    numSlots: 5,
});

const session = new HubSession(hub);

const program = encodeMultiMpy6([
    { name: '__main__', bytecode: new Uint8Array([6, 0, 0, 0]) },
]);

await session.uploadProgram(program, {
    slot: 0,
    onProgress: (progress) => console.log(`${Math.round(progress * 100)} %`),
});
```

El bytecode de ejemplo no ejecuta nada: es solo un contenedor válido para
probar el transporte. La compilación real de Python a `.mpy` queda detrás de
una interfaz y se implementará con un adaptador de navegador.

## Flasheo con bootloader falso

```ts
import {
    FakeBootloaderLink,
    HubType,
    flashFirmwareBle,
} from 'bricksumo';

const link = new FakeBootloaderLink({ hubType: HubType.TechnicHub });
const image = new Uint8Array(1024); // imagen ya ensamblada

await flashFirmwareBle({
    link,
    image,
    expectedHubType: HubType.TechnicHub,
    onProgress: ({ phase, bytesWritten, totalBytes }) => {
        console.log(phase, bytesWritten, totalBytes);
    },
});
```

El orquestador valida el tipo de hub antes de borrar, comprueba checksums
periódicos y no arranca la aplicación si el checksum o el conteo final no
coinciden.

## Leer un ZIP oficial de firmware

```ts
import { readFile } from 'node:fs/promises';
import { prepareFirmwareFromZip } from 'bricksumo';

const zip = await readFile('primehub.zip');
const firmware = await prepareFirmwareFromZip(zip, 'BRICKSUMO');

console.log(firmware.metadata['firmware-version']);
console.log(firmware.deviceId, firmware.image.byteLength, firmware.checksum);
```

Solo se aceptan metadatos de firmware v2.0.0 y v2.1.0. El ensamblado añade el
hueco de checksum, escribe el nombre del hub si corresponde y calcula el
checksum sobre el tamaño de flash declarado.

## CLI de demostración

La CLI usa `tsx` y no necesita compilar. Los comandos `fake-*` trabajan con
transportes simulados y nunca tocan hardware:

```sh
npm run cli -- fake-upload --profile 1.5.0 --slot 0 --size 64
npm run cli -- fake-flash --hub technic
npm run cli -- inspect-firmware ruta/al/firmware.zip --name BRICKSUMO
npm run cli -- help
```

`inspect-firmware` lee un ZIP oficial, valida sus metadatos y muestra el
tamaño, el `device-id` y el checksum de la imagen preparada. No flashea nada.

## Arquitectura en una vista

```text
protocol/      funciones puras: bytes, checksums, comandos, eventos, firmware
transport/     interfaces + transportes falsos (BLE/USB reales en adapters/)
session/       HubSession: descarga, arranque, REPL, stdin, AppData
firmware/      ensamblado de ZIP y orquestación de flasheo LWP3
adapters/      Web Bluetooth / WebUSB / WebDFU (experimentales)
```

La regla principal es que `protocol/` no importa nada de `transport/` ni de
`session/`, y que `session/` no conoce Web Bluetooth ni WebUSB. Esto permite
probar la lógica completa con dobles y sustituir el transporte sin reescribir
el protocolo.

Más detalles en [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Sin almacenamiento local

BRICKSUMO no usa `localStorage`, `sessionStorage` ni `indexedDB`. Todo el
estado vive en memoria. La prohibición se aplica de tres formas:

- reglas de ESLint (`no-restricted-globals` y `no-restricted-properties`);
- escaneo de `src/` en `scripts/check-no-storage.mjs`;
- revisión en CI con `npm run verify`.

Si en el futuro hace falta persistencia, será una decisión explícita, aislada
y documentada en un ADR; no se introducirá como efecto colateral.

## Documentación

- [`docs/PROTOCOL.md`](docs/PROTOCOL.md): protocolo BLE, NUS, LWP3, USB,
  firmware y Multi-MPY6.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): capas, interfaces y flujos.
- [`docs/HARDWARE-VALIDATION.md`](docs/HARDWARE-VALIDATION.md): plan de
  validación con hardware real.
- [`docs/INVESTIGACION.md`](docs/INVESTIGACION.md): fuentes consultadas y
  decisiones de alcance.
- [`docs/adr/`](docs/adr/): decisiones de arquitectura.
- [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md): atribuciones y licencias.

## Créditos

La implementación y la documentación se desarrollaron con asistencia de
OpenCode (modelo DeepSeek V4.1 Flash Free). La dirección del proyecto, las
decisiones de alcance y la licencia corresponden a los contribuidores de
BRICKSUMO.

## Licencia y marcas

El código de BRICKSUMO se publica bajo licencia MIT. Consulta
[`LICENSE`](LICENSE) y [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

BRICKSUMO no está afiliado, patrocinado ni respaldado por LEGO Group ni por el
proyecto Pybricks. LEGO, SPIKE, MINDSTORMS y Powered Up son marcas de sus
respectivos titulares.
