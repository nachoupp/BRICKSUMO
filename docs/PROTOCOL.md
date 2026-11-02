# Protocolo de comunicación

Este documento describe el protocolo que implementa BRICKSUMO en su capa de
comunicación. No es una especificación oficial ni sustituye a las fuentes
citadas al final: es un resumen técnico propio, escrito a partir de la
observación del protocolo y de documentación pública.

Convenciones:

- Las direcciones y longitudes son **little-endian** salvo que se indique lo
  contrario.
- `u8`, `u16`, `u32` significan enteros sin signo de 8, 16 y 32 bits.
- Los arrays se escriben como `[campo1][campo2]...`.
- «Perfil» es la versión del protocolo Pybricks que publica el hub en la
  característica de revisión de software del servicio Device Information.

## 1. BLE Pybricks

### 1.1 Servicios y características

| Elemento | UUID | Uso |
| --- | --- | --- |
| Servicio Pybricks | `c5f50001-8280-46da-89f4-6d8051e4aeef` | Servicio principal |
| Control/eventos | `c5f50002-8280-46da-89f4-6d8051e4aeef` | Comandos host → hub y eventos hub → host |
| Capacidades | `c5f50003-8280-46da-89f4-6d8051e4aeef` | Tamaños y funciones soportadas |
| Device Information | `0x180a` | Servicio estándar de información |
| Firmware Revision | `0x2a26` | Versión de firmware |
| Software Revision | `0x2a28` | Versión del perfil Pybricks |
| PnP ID | `0x2a50` | Identificación del hub |
| Device Name | `0x2a00` | Nombre; algunos sistemas lo bloquean |

La conexión típica es:

1. Pedir un dispositivo cuyo anuncio incluya el servicio Pybricks.
2. Conectar GATT y leer `0x2a26`, `0x2a28` y, si existe, `0x2a50`.
3. Si el perfil es `>= 1.2.0`, leer la característica de capacidades.
4. Activar notificaciones en la característica de control/eventos.
5. Si el perfil es `< 1.5.0`, abrir también el servicio Nordic UART (NUS).

Algunos sistemas (por ejemplo, ciertas versiones de Chromium sobre BlueZ)
necesitan `stopNotifications()` antes de `startNotifications()` al reconectar.
El adaptador de BRICKSUMO hace esa parada defensiva.

### 1.2 Versiones de perfil

| Perfil | Cambios relevantes |
| --- | --- |
| `1.0.0` | Descarga por NUS; `StartUserProgram` sin identificador |
| `1.2.0` | Característica de capacidades; `WriteUserProgramMeta`, `WriteUserRam` y `ResetInUpdateMode`; descarga moderna |
| `1.3.0` | `WriteStdin`; stdout por el evento de control |
| `1.4.0` | `StartUserProgram` con identificador; `WriteAppData`; desaparece `StartRepl` |
| `1.5.0` | `numSlots` en capacidades; desaparece NUS; se exige Multi-MPY6 |

BRICKSUMO conoce hasta el perfil `1.5.0`. Una versión de perfil con formato
desconocido se rechaza en lugar de habilitar funciones por suposición.

### 1.3 Comandos host → hub

Todos se escriben en la característica de control/eventos con respuesta GATT
(`writeValueWithResponse`).

| Tipo | Nombre | Carga útil | Desde |
| --- | --- | --- | --- |
| `0x00` | `StopUserProgram` | — | 1.0 |
| `0x01` | `StartUserProgram` | `[id:u8]`; sin `id` antes de 1.4 | 1.0 |
| `0x02` | `StartRepl` | — | 1.2, eliminado en 1.4 |
| `0x03` | `WriteUserProgramMeta` | `[size:u32]` | 1.2 |
| `0x04` | `WriteUserRam` | `[offset:u32][payload]` | 1.2 |
| `0x05` | `ResetInUpdateMode` | — | 1.2 |
| `0x06` | `WriteStdin` | `[payload]` | 1.3 |
| `0x07` | `WriteAppData` | `[offset:u16][payload]` | 1.4 |

Identificadores incorporados para `StartUserProgram`:

| Valor | Programa |
| --- | --- |
| `0x80` | REPL |
| `0x81` | Port View |
| `0x82` | Calibración de IMU |

Los slots de usuario van de `0` a `127`. Los valores `128` a `255` están
reservados para programas incorporados.

### 1.4 Eventos hub → host

| Tipo | Nombre | Carga útil |
| --- | --- | --- |
| `0x00` | `StatusReport` | `[flags:u32][runningProgramId:u8][selectedSlot:u8]` |
| `0x01` | `WriteStdout` | Texto UTF-8 |
| `0x02` | `WriteAppData` | Datos de la aplicación |

Los bytes adicionales de un reporte de estado se ignoran para tolerar
extensiones futuras. Los flags actuales son:

| Bit | Estado |
| --- | --- |
| 0 | Aviso de batería baja |
| 1 | Apagado por batería baja |
| 2 | Corriente alta |
| 3 | Anuncio BLE activo |
| 4 | Señal BLE baja |
| 5 | Botón de encendido pulsado |
| 6 | Programa de usuario en ejecución |
| 7 | Apagado en curso |

### 1.5 Capacidades

La característica de capacidades tiene dos variantes:

- perfil `1.2` a `1.4`: 10 bytes;
- perfil `1.5` o posterior: 11 bytes.

| Offset | Campo |
| --- | --- |
| 0 | `maxWriteSize:u16` |
| 2 | `flags:u32` |
| 6 | `maxUserProgramSize:u32` |
| 10 | `numSlots:u8` (sólo 1.5+) |

Flags conocidos:

| Bit | Capacidad |
| --- | --- |
| 0 | REPL |
| 1 | Programa Multi-MPY6 |
| 2 | Multi-MPY6 nativo 6.1 |
| 3 | Port View |
| 4 | Calibración de IMU |

### 1.6 Formatos de programa

| Valor | Formato |
| --- | --- |
| `0` | MPY5 |
| `1` | MPY6 |
| `2` | Multi-MPY6 |

La selección implementada es:

- con capacidades: Multi-MPY6 sólo si el hub declara el flag correspondiente;
- sin capacidades y con versión de firmware: MPY5 hasta `3.2.0b2` y MPY6
  después;
- sin más datos: MPY6.

La descarga moderna de BRICKSUMO sólo acepta Multi-MPY6. La ruta antigua NUS
recibe un `.mpy` ya compilado y no lo genera.

### 1.7 Descarga moderna

Secuencia implementada por `HubSession`:

1. Validar que el programa no esté vacío y que quepa en
   `maxUserProgramSize`.
2. Calcular el tamaño de bloque como `maxWriteSize - 5` (los 5 bytes de
   cabecera de `WriteUserRam`).
3. Enviar `WriteUserProgramMeta(0)` para invalidar el programa anterior.
4. Enviar bloques `WriteUserRam` con offsets absolutos crecientes.
5. Enviar `WriteUserProgramMeta(size)` para confirmar el tamaño.
6. Enviar `StartUserProgram(slot)`.

El hub falso reproduce esta máquina de estados, incluida la variante que envía
`meta(size)` antes de los bloques.

### 1.8 Descarga antigua por NUS

Servicio y características:

| Elemento | UUID |
| --- | --- |
| Servicio NUS | `6e400001-b5a3-f393-e0a9-e50e24dcca9e` |
| RX host → hub | `6e400002-b5a3-f393-e0a9-e50e24dcca9e` |
| TX hub → host | `6e400003-b5a3-f393-e0a9-e50e24dcca9e` |

Formato:

1. Cabecera de 4 bytes con el tamaño total del programa, little-endian.
2. El hub responde con un checksum de un byte.
3. Bloques lógicos de 100 bytes.
4. Cada bloque se divide en escrituras BLE de 20 bytes sin respuesta.
5. Tras cada bloque, el hub responde con otro checksum de un byte.

El checksum es el XOR de todos los bytes del bloque, empezando en `0x00`. Es
equivalente a `0xff ^ xor8(bloque)` cuando `xor8` empieza en `0xff`, que es la
forma que usa la implementación de referencia.

El comando de REPL antiguo son cuatro espacios (`0x20 0x20 0x20 0x20`). Antes
de `1.3.0`, stdout también viaja por NUS; desde `1.3.0` viaja por el evento de
control.

### 1.9 Bootloader LWP3

| Elemento | UUID |
| --- | --- |
| Servicio | `00001625-1212-efde-1623-785feabcd123` |
| Característica | `00001626-1212-efde-1623-785feabcd123` |

Comandos:

| Tipo | Nombre | Petición | Respuesta |
| --- | --- | --- | --- |
| `0x11` | `EraseFlash` | `[0x11]` | `[0x11][resultado]` |
| `0x22` | `ProgramFlash` | `[0x22][longitud][dirección:u32][payload]` | `[0x22][checksum][bytes:u32]` |
| `0x33` | `StartApp` | `[0x33]` | — |
| `0x44` | `InitLoader` | `[0x44][tamaño:u32]` | `[0x44][resultado]` |
| `0x55` | `GetInfo` | `[0x55]` | `[0x55][versión:u32][inicio:u32][fin:u32][hub:u8]` |
| `0x66` | `GetChecksum` | `[0x66]` | `[0x66][checksum]` |
| `0x77` | `GetFlashState` | `[0x77]` | `[0x77][nivel]` |
| `0x88` | `Disconnect` | `[0x88]` | — |

`resultado` es `0x00` para OK y `0xff` para error. El mensaje de error tiene
la forma `[0x05][?][0x05][comando][0x05]`.

Tamaño máximo de payload de `ProgramFlash`:

| Hub | Bytes |
| --- | --- |
| Move Hub | 14 |
| City Hub | 32 |
| Technic Hub | 32 |
| Desconocido | 14 (conservador) |

El mensaje completo no debe superar 20 bytes. La respuesta final de
`ProgramFlash` incluye el checksum acumulado y el número de bytes escritos; el
orquestador no inicia la aplicación si alguno no coincide.

`ProgramFlash` y `StartApp` se escriben sin respuesta GATT. `EraseFlash` se
escribe con respuesta en City Hub; el comportamiento puede variar según la
plataforma y debe validarse en hardware.

Secuencia de flasheo:

1. `GetInfo` y validación del tipo de hub esperado.
2. Comprobar que la imagen cabe entre `startAddress` y `endAddress`.
3. `EraseFlash`.
4. `InitLoader(size)`.
5. Enviar `ProgramFlash` en bloques; cada 8 paquetes, `GetChecksum`.
6. Validar la respuesta final: `count == size` y checksum acumulado.
7. `StartApp`.

## 2. USB Pybricks

### 2.1 Identificación

| Campo | Valor |
| --- | --- |
| Vendor ID | `0x0694` (LEGO) |
| Clase | `0xff` |
| Subclase | `0xc5` |
| Protocolo | `0xf5` |

Product IDs relevantes:

| PID | Dispositivo |
| --- | --- |
| `0x0008` | SPIKE Prime en modo bootloader DFU |
| `0x0009` | SPIKE Prime con firmware |
| `0x000c` | SPIKE Essential en modo bootloader DFU |
| `0x000d` | SPIKE Essential con firmware |
| `0x0010` | MINDSTORMS Robot Inventor |
| `0x0011` | MINDSTORMS Robot Inventor en modo bootloader DFU |

### 2.2 Transferencias de control

| `bRequest` | Uso |
| --- | --- |
| `0x01` | Leer un atributo GATT emulado |
| `0x02` | Leer una característica Pybricks |

La transferencia es de clase, destinatario interfaz, `index = 0`, `value` es
el alias de 16 bits del UUID y la longitud máxima es 20 bytes.

El alias se obtiene de los cuatro dígitos centrales del UUID de 128 bits. Por
ejemplo, `c5f50003-8280-46da-89f4-6d8051e4aeef` produce `0x0003`. Es una
convención del firmware Pybricks, no el UUID base de Bluetooth.

### 2.3 Endpoints

Mensajes host → hub (OUT):

| Tipo | Nombre | Carga útil |
| --- | --- | --- |
| `0x01` | `Subscribe` | `[0x01][0/1]` |
| `0x02` | `Command` | `[0x02][comando Pybricks]` |

Mensajes hub → host (IN):

| Tipo | Nombre | Carga útil |
| --- | --- | --- |
| `0x01` | `Response` | `[0x01][estado:u32]` |
| `0x02` | `Event` | `[0x02][evento Pybricks]` |

El estado `0` de una respuesta indica éxito. Los comandos se serializan: se
espera la respuesta de uno antes de enviar el siguiente. Los eventos se
entregan a los suscriptores. USB no ofrece NUS; la descarga antigua no está
disponible por esta vía.

## 3. DFU

DFU es un protocolo distinto del USB Pybricks. Se usa cuando el hub está en
modo bootloader y no ejecuta el firmware normal.

| Hub | PID de bootloader |
| --- | --- |
| SPIKE Prime | `0x0008` |
| SPIKE Essential | `0x000c` |
| Robot Inventor | `0x0011` |

La implementación experimental usa WebDFU con:

- dirección de inicio `0x08008000`;
- transferencias de 1024 bytes;
- manifestación tolerante;
- interfaz DFU con `alternateSetting = 0`.

El adaptador sólo se plantea para Prime y Essential. Robot Inventor queda
fuera hasta validarlo. En Windows puede hacer falta un driver DFU específico;
en Linux, reglas udev o permisos para el dispositivo.

## 4. Firmware

### 4.1 ZIP oficial

El ZIP de firmware contiene, como mínimo:

- `firmware-base.bin`: imagen base;
- `firmware.metadata.json`: metadatos;
- un ReadMe de licencias.

BRICKSUMO acepta metadatos `2.0.0` y `2.1.0`. Campos usados:

| Campo | Tipo | Uso |
| --- | --- | --- |
| `metadata-version` | string | `2.0.0` o `2.1.0` |
| `firmware-version` | string | Versión legible |
| `device-id` | u32 | Tipo de hub |
| `checksum-type` | string | `sum`, `crc32` o `none` |
| `checksum-size` | u32 | Tamaño de flash sobre el que se calcula |
| `hub-name-offset` | u32 | Offset del nombre dentro de la imagen |
| `hub-name-size` | u32 | Tamaño del campo de nombre |

`2.0.0` no admite `checksum-type: none`. `checksum-size` debe ser múltiplo de
4.

### 4.2 Ensamblado de la imagen

1. Copiar `firmware-base.bin`.
2. Reservar 4 bytes para el checksum si el tipo no es `none`.
3. Escribir el nombre del hub, si se proporciona, en `hub-name-offset`.
4. Calcular el checksum sobre `checksum-size` bytes, rellenando el espacio
   restante con `0xffffffff` (estado de la flash borrada).
5. Escribir el checksum en los 4 bytes reservados.

El nombre se codifica en UTF-8, se rellena con NUL y se trunca sin romper el
terminador si no cabe.

### 4.3 Checksums

| Tipo | Cálculo |
| --- | --- |
| `sum` | Complemento a dos de la suma de palabras u32 little-endian |
| `crc32` | CRC-32 con polinomio `0x04c11db7`, init `0xffffffff`, sin reflexión ni XOR final |
| `none` | Sin checksum; la imagen no reserva los 4 bytes |

El CRC se calcula palabra a palabra, no byte a byte. Los vectores de
regresión usados por BRICKSUMO son:

| Entrada | CRC |
| --- | --- |
| `[0x00000000]` | `3338984827` |
| `[0xffffffff]` | `0` |
| `[0x00000001, 0x00000002, 0x00000003, 0x00000004, 0x00000005]` | `2844647194` |

Estos vectores vienen de la implementación Python de referencia. No se usa el
desplazamiento con signo que aparece en algunas versiones TypeScript, porque
produce resultados distintos.

## 5. Multi-MPY6

Un contenedor Multi-MPY6 es una secuencia de módulos:

```text
[u32 longitud del bytecode][nombre UTF-8][0x00][bytecode]
```

No hay cabecera global ni contador de módulos. El nombre `__main__` identifica
el módulo principal. Los nombres no pueden estar vacíos, contener NUL ni
repetirse. El bytecode debe ser MPY ABI v6; el primer byte vale `6`.

BRICKSUMO sabe construir y parsear el contenedor, pero **no compila Python a
`.mpy`** en esta fase. La interfaz de compilación queda para un adaptador de
navegador.

## 6. Versiones

El parser propio acepta formas como:

- `1.5.0`
- `4.0.0b4`
- `1.0.0-rc.2`

No acepta sufijos arbitrarios. Las pre-releases se ordenan por rango
(`alpha` < `beta` < `rc` < final) y después por número. Una versión
desconocida debe fallar de forma explícita: es preferible rechazar una función
a habilitarla por accidente.

## 7. Referencias

Fuentes públicas consultadas para verificar hechos de protocolo:

- Perfil BLE de Pybricks:
  <https://github.com/pybricks/technical-info/blob/master/pybricks-ble-profile.md>
- Números asignados (hubs, USB, UUID):
  <https://github.com/pybricks/technical-info/blob/master/assigned-numbers.md>
- Protocolo UART antiguo:
  <https://github.com/pybricks/technical-info/blob/master/uart-protocol.md>
- Documentación de Pybricks:
  <https://docs.pybricks.com/>
- Pybricks Code (MIT), usado sólo como referencia de comportamiento:
  <https://github.com/pybricks/pybricks-code>
- Herramientas de flasheo y checksums de Pybricks MicroPython:
  <https://github.com/pybricks/pybricks-micropython/tree/master/tools/flash>
- Especificación Web Bluetooth:
  <https://webbluetoothcg.github.io/web-bluetooth/>
- Especificación WebUSB:
  <https://wicg.github.io/webusb/>
- Especificación DFU 1.1:
  <https://www.usb.org/sites/default/files/DFU_1.1.pdf>
- Protocolo LEGO Wireless:
  <https://lego.github.io/lego-ble-wireless-protocol-docs/>
- Nordic UART Service:
  <https://infocenter.nordicsemi.com/topic/sdk_nrf5_v16.0.0/ble_sdk_app_nus_eval.html>
- Números asignados de Bluetooth:
  <https://www.bluetooth.com/specifications/assigned-numbers/>

Las marcas LEGO, SPIKE, MINDSTORMS y Powered Up pertenecen a sus titulares.
BRICKSUMO no está afiliado a LEGO Group ni al proyecto Pybricks.
