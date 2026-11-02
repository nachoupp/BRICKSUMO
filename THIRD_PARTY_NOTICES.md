# Atribuciones y licencias de terceros

BRICKSUMO se distribuye bajo licencia MIT. Este archivo resume las
dependencias y referencias de terceros. No se ha copiado documentación,
interfaz ni assets de la app original de Pybricks.

## 1. Dependencias de ejecución

### 1.1 `@pybricks/firmware` 7.27.0

- Uso: lectura de ZIP de firmware, metadatos y ReadMe de licencias.
- Licencia: MIT.
- Autor: The Pybricks Authors.
- Repositorio:
  <https://github.com/pybricks/pybricks-micropython/tree/master/npm/firmware>
- Paquete: <https://www.npmjs.com/package/@pybricks/firmware>

```text
MIT License

Copyright (c) 2018-2023 The Pybricks Authors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### 1.2 `dfu` 0.1.5 (WebDFU)

- Uso: flasheo DFU/DfuSe por WebUSB en el adaptador experimental.
- Licencia: MIT.
- Copyright: 2021 Flipper Devices Inc.
- Repositorio: <https://github.com/Flipper-Zero/webdfu>
- Paquete: <https://www.npmjs.com/package/dfu>

```text
The MIT License (MIT)

Copyright 2021 Flipper Devices Inc. <legal@flipperdevices.com>

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
```

## 2. Herramientas de desarrollo

Estas herramientas no forman parte del código que se ejecuta en el navegador
del usuario, pero se usan para construir y verificar el proyecto.

| Paquete | Versión | Licencia |
| --- | --- | --- |
| TypeScript | 6.0.3 | Apache-2.0 |
| ESLint | 10.14.0 | MIT |
| `@eslint/js` | 10.0.1 | MIT |
| `typescript-eslint` | 8.72.1 | MIT |
| Vitest | 5.0.5 | MIT |
| Vite | 8.3.5 | MIT |
| `tsx` | 4.23.15 | MIT |
| `globals` | 17.14.0 | MIT |
| `@types/node` | 26.6.6 | MIT |
| `@types/web-bluetooth` | 0.0.22 | MIT |
| `@types/w3c-web-usb` | 1.0.14 | MIT |

Las licencias completas están en `node_modules/<paquete>/LICENSE` o en el
paquete publicado.

## 3. Referencias consultadas

Estos proyectos se consultaron para verificar hechos de protocolo. No se
incluyen sus archivos, textos ni assets en BRICKSUMO.

| Proyecto | Licencia | Uso |
| --- | --- | --- |
| [Pybricks Code](https://github.com/pybricks/pybricks-code) | MIT | Referencia de flujos BLE, USB, bootloader y DFU |
| [Pybricks technical-info](https://github.com/pybricks/technical-info) | MIT | Perfil BLE, números asignados y protocolo UART |
| [Pybricks MicroPython](https://github.com/pybricks/pybricks-micropython) | Código de terceros; los archivos de `tools/flash` consultados llevan SPDX MIT | Checksums, LWP3 y herramientas de flasheo |
| SUMO69 (ZIP auditado) | Sin licencia declarada en el ZIP | Auditoría de un cliente NUS; no se reutilizó código |

La mención de un proyecto no implica que respalde BRICKSUMO.

## 4. Marcas

LEGO, SPIKE, MINDSTORMS, Powered Up y Boost son marcas de LEGO Group. Pybricks
es un proyecto independiente. BRICKSUMO no está afiliado, patrocinado ni
respaldado por LEGO Group ni por el proyecto Pybricks.

## 5. Nota sobre el contenido original

La documentación de `docs/` es original y está escrita en español a partir de
la observación del protocolo y de fuentes públicas. No reproduce textos,
traducciones, imágenes ni archivos de la app original de Pybricks ni de
NotebookLM. Las citas son enlaces a las fuentes, no copias.
