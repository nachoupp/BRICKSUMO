# ADR 0004: firmware v2 y checksums canónicos

- Estado: aceptado
- Fecha: 2026-11-02

## Contexto

El flasheo es la operación más peligrosa de la capa de comunicación. Un
checksum incorrecto o una imagen mal ensamblada puede dejar el hub sin
arrancar.

Los ZIP actuales de Pybricks usan metadatos `2.0.0` y `2.1.0`. Los formatos
anteriores no son compatibles con esta implementación.

## Decisión

- Aceptar sólo metadatos `2.0.0` y `2.1.0`.
- Validar `checksum-size`, alineación y tipo de checksum antes de escribir.
- Usar el CRC-32 canónico de Python: polinomio `0x04c11db7`, init
  `0xffffffff`, sin reflexión ni XOR final, sobre palabras u32 little-endian.
- Usar suma complemento para `sum` y no reservar checksum para `none`.
- Rellenar el espacio de flash restante con `0xffffffff`.
- Validar el tipo de hub antes de borrar.
- No iniciar la aplicación si el count o el checksum final no coinciden.

## Consecuencias

- El flasheo es más lento por las validaciones, pero más seguro.
- Los ZIP v1.x se rechazan con un error claro.
- Los vectores de CRC están cubiertos por tests.
- Cualquier cambio en el ensamblado debe pasar los tests y la validación física.

## Alternativas descartadas

- Copiar el CRC de la implementación TypeScript de referencia: produce
  resultados distintos.
- Aceptar cualquier `metadata-version`: habilita imágenes no verificadas.
- Omitir la comprobación de tipo de hub: riesgo de flashear el firmware
  equivocado.
