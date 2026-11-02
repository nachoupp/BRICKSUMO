# ADR 0002: transportes falsos antes que hardware

- Estado: aceptado
- Fecha: 2026-11-02

## Contexto

Probar BLE y USB reales requiere hubs, cables, permisos del navegador y tiempo.
Si la lógica de descarga y flasheo sólo se prueba con hardware, cada cambio es
lento y difícil de reproducir.

## Decisión

La lógica de alto nivel se prueba con dos dobles:

- `FakePybricksTransport`: comandos, slots, eventos, estado y NUS.
- `FakeBootloaderLink`: erase, init, program, checksums, count y arranque.

Los dobles implementan la máquina de estados, no sólo respuestas fijas. Por
ejemplo, el hub falso rechaza un `WriteUserRam` no secuencial y el bootloader
falso calcula el checksum acumulado.

## Consecuencias

- Los flujos completos se prueban sin hardware.
- Los tests documentan el comportamiento esperado.
- Un doble puede ocultar una diferencia real; por eso la validación física es
  obligatoria antes de considerar estable un adaptador.
- Los dobles no se presentan como sustitutos de la validación.

## Alternativas descartadas

- Mocks de Web Bluetooth/WebUSB: simulan APIs, no el protocolo del hub.
- Probar sólo con hardware: lento, frágil y difícil de automatizar.
- No probar hasta tener hardware: deja la lógica sin verificar.
