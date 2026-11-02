# ADR 0001: núcleo de protocolo sin dependencias

- Estado: aceptado
- Fecha: 2026-11-02

## Contexto

La capa de protocolo necesita leer y escribir bytes, comparar versiones,
calcular checksums y construir mensajes. Es la parte más crítica: un error
aquí puede corromper un programa o un firmware.

Las opciones eran:

1. usar librerías generales (`semver`, `buffer`, utilidades de bytes);
2. escribir un núcleo pequeño y sin dependencias;
3. mezclar protocolo y transporte en una sola capa.

## Decisión

El núcleo de `src/protocol/` no importa paquetes externos ni módulos de
transporte, sesión o firmware. Sólo usa APIs estándar de JavaScript y
TypeScript.

Se implementaron localmente:

- lectura/escritura little-endian;
- parser y comparador de versiones;
- XOR, suma complemento y CRC-32;
- comandos, eventos y capacidades;
- framing USB y Multi-MPY6.

## Consecuencias

- Los tests del protocolo son rápidos y deterministas.
- El núcleo se puede ejecutar en Node y en el navegador sin polyfills.
- Hay que mantener código propio para versiones y checksums.
- Cualquier dependencia nueva en el núcleo requiere justificar el riesgo.

## Alternativas descartadas

- `semver`: añade peso y semántica que no coincide exactamente con las
  versiones de Pybricks.
- `buffer`: no es necesario en el navegador y complica el empaquetado.
- Mezclar protocolo y Web Bluetooth: impide probar la lógica sin hardware.
