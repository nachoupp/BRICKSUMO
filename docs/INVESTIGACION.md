# Investigación y decisiones de alcance

Este documento explica de dónde sale el conocimiento técnico de BRICKSUMO y
qué se decidió no hacer. No reproduce documentación de terceros: resume
hechos verificados y enlaza las fuentes.

## 1. Punto de partida

El proyecto nace con tres objetivos:

1. comunicar BRICKSUMO con hubs LEGO que ejecutan Pybricks;
2. no depender de la interfaz de usuario para probar la capa de comunicación;
3. no arrastrar documentación, textos ni assets de la app original de
   Pybricks.

La primera fase se limita a BLE, USB, firmware y programas. La UI se construye
después, sobre esta base.

## 2. Método

Se combinaron tres tipos de fuentes:

- **Documentación pública de Pybricks**: perfil BLE, números asignados,
  protocolo UART antiguo y documentación de usuario.
- **Código de referencia con licencia MIT**: Pybricks Code y las herramientas
  de flasheo de Pybricks MicroPython. Se usaron para verificar secuencias,
  UUIDs, límites y casos límite, no para copiar archivos completos.
- **Pruebas propias**: transportes falsos, tests de protocolo y vectores de
  checksum calculados con la implementación Python de referencia.

También se usó un cuaderno de NotebookLM, «SPIKE PY CODE», como índice interno
para organizar fuentes. Ese cuaderno no es una fuente primaria y no se ha
copiado su contenido. Las afirmaciones técnicas se contrastaron con las
fuentes públicas enlazadas al final.

## 3. Referencias de código

### 3.1 Pybricks Code

Se extrajo una copia de Pybricks Code `v2.3.0-beta.1` en `_apps/` para
consultar el comportamiento de:

- conexión BLE y lectura del servicio Device Information;
- característica de capacidades;
- descarga moderna y antigua;
- comandos del bootloader LWP3;
- framing USB;
- flasheo DFU con WebDFU.

Pybricks Code es MIT. No se copiaron archivos, textos de interfaz, traducciones
ni assets. La implementación de BRICKSUMO es propia y está organizada de otra
forma: protocolo puro, transportes y sesión.

### 3.2 Pybricks MicroPython

Se consultaron las herramientas de flasheo y checksums para verificar:

- el CRC-32 del bootloader;
- la suma complemento;
- los comandos LWP3;
- los tamaños de payload;
- la secuencia de borrado y programación.

Los archivos relevantes llevan `SPDX-License-Identifier: MIT`. El repositorio
completo contiene código de terceros con otras licencias; por eso no se copia
ni se presenta como si todo fuera MIT.

### 3.3 SUMO69

Se auditó un proyecto de terceros, SUMO69, que usa NUS para enviar scripts a
un hub. La auditoría encontró:

- una conexión BLE frágil, sin una máquina de estados clara;
- un protocolo de pegado de texto basado en Ctrl+C/Ctrl+E/Ctrl+D, distinto de
  la descarga de programas de Pybricks;
- ausencia de licencia declarada en el ZIP.

No se reutilizó su código. Se tomó como evidencia de que la conexión NUS y la
escritura por trozos necesitan una capa de transporte probada, no lógica
mezclada con la UI.

## 4. Hallazgos técnicos

### 4.1 El perfil manda

La versión del perfil Pybricks, publicada en la revisión de software
(`0x2a28`), determina qué funciones existen. No es seguro asumir que todos los
hubs aceptan los mismos comandos:

- antes de `1.2.0` no hay característica de capacidades y la descarga va por
  NUS;
- antes de `1.3.0` stdout va por NUS;
- antes de `1.4.0` `StartUserProgram` no lleva identificador;
- desde `1.5.0` desaparece NUS y se exige Multi-MPY6.

Por eso `profile.ts` calcula las funciones a partir de la versión y rechaza
versiones con formato desconocido.

### 4.2 El CRC correcto es el de Python

La implementación TypeScript de referencia usa un desplazamiento con signo en
un punto del cálculo. Eso produce resultados distintos del CRC que espera el
bootloader. BRICKSUMO usa la implementación canónica de Python:

- polinomio `0x04c11db7`;
- init `0xffffffff`;
- sin reflexión;
- sin XOR final;
- cálculo sobre palabras de 32 bits little-endian.

Los vectores de regresión están en `tests/protocol/checksums.test.ts` y en
[`PROTOCOL.md`](PROTOCOL.md#43-checksums).

### 4.3 El checksum NUS no es el mismo que el del bootloader

El protocolo NUS antiguo usa XOR de bytes. El bootloader LWP3 usa XOR
acumulado empezando en `0xff`. El firmware usa suma complemento o CRC-32 según
los metadatos. Son tres checksums distintos y mezclarlos produce errores
difíciles de diagnosticar.

### 4.4 La compilación MPY en Node no es viable todavía

Se probó `@pybricks/mpy-cross-v6@2.0.0`. Falla en Node con:

```text
TypeError: Failed to parse URL from ...mpy-cross-v6.wasm
```

El paquete está pensado para el navegador y carga un `.wasm` por URL. Se
decidió no forzarlo con parches frágiles. La interfaz de compilación queda
definida y el adaptador real se implementará en el navegador, donde el runtime
de Pybricks Code ya resuelve la carga del compilador.

### 4.5 Los paquetes oficiales reducen riesgo

Se adoptaron dos dependencias MIT:

- `@pybricks/firmware@7.27.0`: lectura de ZIP, metadatos y ReadMe de licencias.
- `dfu@0.1.5` (WebDFU): implementación de DFU/DfuSe para WebUSB.

El resto del núcleo no depende de librerías externas. El parser de versiones
es propio para no introducir `semver` en una capa que debe ser pequeña y
estable.

### 4.6 La validación de hardware sigue pendiente

Los transportes falsos demuestran que la lógica es coherente, no que un hub
real responda como esperamos. Los adaptadores de navegador quedan aislados y
sin exportar desde la raíz hasta que pasen la matriz de
[`HARDWARE-VALIDATION.md`](HARDWARE-VALIDATION.md).

## 5. Decisiones

| Decisión | Motivo | ADR |
| --- | --- | --- |
| Núcleo de protocolo sin dependencias | Estabilidad y pruebas puras | [0001](adr/0001-nucleo-de-protocolo-sin-dependencias.md) |
| Transportes falsos antes que hardware | Probar la lógica sin hubs | [0002](adr/0002-transportes-falsos-antes-que-hardware.md) |
| Sin almacenamiento local | Requisito del proyecto | [0003](adr/0003-sin-almacenamiento-local.md) |
| Firmware v2 y checksums canónicos | Evitar corrupción de flash | [0004](adr/0004-firmware-v2-y-checksums.md) |
| Compilador MPY diferido | El paquete no funciona en Node | [0005](adr/0005-compilador-mpy-diferido.md) |
| Adaptadores experimentales aislados | No enviar hardware sin validar | [0006](adr/0006-adaptadores-experimentales-aislados.md) |

## 6. Lo que no se hizo

- No se copiaron README, textos de interfaz, traducciones ni assets de
  Pybricks Code.
- No se copió documentación de NotebookLM.
- No se usó SUMO69 como base de código.
- No se implementó persistencia.
- No se implementó la UI.
- No se afirmó que BLE/USB/DFU funcionan en hardware real.
- No se añadió `semver` ni un framework de UI.

## 7. Preguntas abiertas

- ¿Qué hubs y versiones de firmware responden a `EraseFlash` con y sin
  respuesta GATT en cada sistema?
- ¿Cómo varía el MTU real entre sistemas y adaptadores Bluetooth?
- ¿Qué diferencias hay entre Prime, Essential e Inventor en DFU?
- ¿Qué compilador MPY conviene para el navegador y cómo se integra con Vite?
- ¿La app necesitará persistencia? Si sí, ¿dónde y con qué garantías?
- ¿Cómo se gestionarán varios hubs y reconexiones desde la UI?

## 8. Fuentes

Consultadas el 2 de noviembre de 2026:

- Pybricks technical info:
  <https://github.com/pybricks/technical-info>
- Perfil BLE:
  <https://github.com/pybricks/technical-info/blob/master/pybricks-ble-profile.md>
- Números asignados:
  <https://github.com/pybricks/technical-info/blob/master/assigned-numbers.md>
- Protocolo UART:
  <https://github.com/pybricks/technical-info/blob/master/uart-protocol.md>
- Documentación de Pybricks:
  <https://docs.pybricks.com/>
- Pybricks Code:
  <https://github.com/pybricks/pybricks-code>
- Pybricks MicroPython:
  <https://github.com/pybricks/pybricks-micropython>
- Herramientas de flasheo:
  <https://github.com/pybricks/pybricks-micropython/tree/master/tools/flash>
- `@pybricks/firmware`:
  <https://www.npmjs.com/package/@pybricks/firmware>
- WebDFU:
  <https://github.com/Flipper-Zero/webdfu>
- Web Bluetooth:
  <https://webbluetoothcg.github.io/web-bluetooth/>
- WebUSB:
  <https://wicg.github.io/webusb/>
- DFU 1.1:
  <https://www.usb.org/sites/default/files/DFU_1.1.pdf>
- LEGO Wireless Protocol:
  <https://lego.github.io/lego-ble-wireless-protocol-docs/>
- Nordic UART Service:
  <https://infocenter.nordicsemi.com/topic/sdk_nrf5_v16.0.0/ble_sdk_app_nus_eval.html>

## 9. Nota de atribución

Las marcas y nombres citados pertenecen a sus titulares. BRICKSUMO es un
proyecto independiente y no está afiliado, patrocinado ni respaldado por LEGO
Group ni por el proyecto Pybricks. Las licencias de las dependencias y de las
referencias consultadas están en
[`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md).
