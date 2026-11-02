# ADR 0006: adaptadores experimentales aislados

- Estado: aceptado
- Fecha: 2026-11-02

## Contexto

Web Bluetooth, WebUSB y WebDFU dependen del navegador, del sistema operativo,
del adaptador Bluetooth, de los permisos y del firmware del hub. Una
implementación que «parece funcionar» en un equipo puede fallar en otro.

## Decisión

Los adaptadores viven en `src/adapters/` y no se exportan desde la raíz del
paquete. Se importan explícitamente y se marcan como experimentales hasta que
pasen la matriz de [`HARDWARE-VALIDATION.md`](../HARDWARE-VALIDATION.md).

La ruta por defecto usa transportes falsos y pruebas. Ningún ejemplo de la
documentación presenta BLE/USB/DFU como validado en hardware.

## Consecuencias

- Un fallo de hardware no contamina el núcleo.
- La app puede elegir cuándo habilitar cada adaptador.
- Hay que mantener una importación explícita y documentar los requisitos.
- La promoción a estable requiere evidencia, no sólo que compile.

## Alternativas descartadas

- Exportar todo desde la raíz: invita a usar hardware sin validar.
- Ocultar los adaptadores: impide probarlos y mejorarlos.
- Simular hardware en tests y llamarlo validación: da falsa confianza.
