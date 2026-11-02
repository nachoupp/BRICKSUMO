# ADR 0003: sin almacenamiento local

- Estado: aceptado
- Fecha: 2026-11-02

## Contexto

BRICKSUMO se plantea como una app que no debe dejar datos en el navegador.
`localStorage`, `sessionStorage` e `indexedDB` pueden parecer cómodos para
guardar preferencias o el último hub, pero introducen estado oculto, problemas
de privacidad y diferencias entre sesiones.

## Decisión

No se usa almacenamiento local del navegador. Todo el estado vive en memoria.

La prohibición se aplica con:

- `no-restricted-globals` y `no-restricted-properties` en ESLint;
- `scripts/check-no-storage.mjs`, que recorre `src/`;
- `npm run verify` en CI.

## Consecuencias

- Al recargar se pierde el estado; la UI tendrá que asumirlo.
- No hay migraciones ni claves que limpiar.
- Si en el futuro hace falta persistencia, se decidirá explícitamente y se
  aislará; no se añadirá como efecto colateral.

## Alternativas descartadas

- Guardar el último hub en `localStorage`: contradice el requisito.
- Usar `indexedDB` para proyectos: fuera de alcance en esta fase.
- Persistir en el servidor: introduce backend y privacidad; no es necesario
  para la capa de comunicación.
