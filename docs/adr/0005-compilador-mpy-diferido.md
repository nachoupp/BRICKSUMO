# ADR 0005: compilador MPY diferido

- Estado: aceptado
- Fecha: 2026-11-02

## Contexto

Para subir un programa moderno hace falta bytecode Multi-MPY6. La app original
compila Python a `.mpy` en el navegador con `mpy-cross` compilado a WebAssembly.

Se probó `@pybricks/mpy-cross-v6@2.0.0` en Node y falló con:

```text
TypeError: Failed to parse URL from ...mpy-cross-v6.wasm
```

El paquete espera un entorno de navegador y una URL para el `.wasm`.

## Decisión

No se implementa compilación real en esta fase. Se define una interfaz de
compilador y se usa bytecode de prueba en los ejemplos. La compilación se
resolverá con un adaptador de navegador, probablemente con el mismo runtime que
usa Pybricks Code.

## Consecuencias

- La capa de comunicación se puede probar con Multi-MPY6 ya construido.
- No se promete una función que no existe.
- La UI futura necesitará un paso de compilación antes de subir programas.
- El adaptador de compilación deberá cargar el `.wasm` correctamente y manejar
  errores de sintaxis.

## Alternativas descartadas

- Parchear `@pybricks/mpy-cross-v6` en Node: frágil y difícil de mantener.
- Usar un compilador Python externo: añade un servicio y latencia.
- Enviar código fuente por NUS: es otro protocolo y no produce Multi-MPY6.
