# Validación con hardware

Los adaptadores de Web Bluetooth, WebUSB y WebDFU están aislados y marcados
como **experimentales**. Este documento define qué hay que probar antes de
considerarlos parte de la ruta por defecto.

La regla es: si una función toca hardware y no está en la matriz validada, no
se presenta como estable.

## 1. Alcance

Se validan cuatro caminos:

1. BLE Pybricks: conexión, información, capacidades, descarga, arranque, REPL,
   stdin y AppData.
2. BLE bootloader LWP3: borrado, init, programación, checksums y arranque.
3. USB Pybricks: información, comandos y eventos.
4. USB DFU: flasheo de Prime y Essential en modo bootloader.

No se validan en esta fase:

- la interfaz de usuario;
- la compilación Python → `.mpy`;
- la persistencia;
- hubs no soportados por el firmware Pybricks;
- sistemas operativos o navegadores sin Web Bluetooth/WebUSB.

## 2. Matriz mínima

| Hub | BLE Pybricks | BLE bootloader | USB Pybricks | USB DFU |
| --- | --- | --- | --- | --- |
| Move Hub | Obligatorio | Obligatorio | No aplica | No aplica |
| City Hub | Obligatorio | Obligatorio | No aplica | No aplica |
| Technic Hub | Obligatorio | Obligatorio | No aplica | No aplica |
| SPIKE Prime | Obligatorio | No aplica | Obligatorio | Obligatorio |
| SPIKE Essential | Obligatorio | No aplica | Obligatorio | Obligatorio |
| Robot Inventor | Deseable | No aplica | Deseable | Experimental |

Perfiles de referencia:

- `1.2.0`: primeras capacidades y descarga moderna;
- `1.3.0`: stdin y stdout moderno;
- `1.4.0`: identificadores de programa y AppData;
- `1.5.0`: slots, Multi-MPY6 y desaparición de NUS.

No hace falta probar todas las combinaciones de hub y perfil, pero sí al menos
un hub de cada familia y un perfil antiguo frente a uno moderno.

## 3. Preparación

- Batería cargada o alimentación estable. No flashear con batería baja.
- Cable USB de datos, no sólo de carga.
- Navegador de escritorio con Web Bluetooth y WebUSB. Chrome/Edge suelen ser
  la referencia; Firefox y Safari no implementan todas las APIs.
- Cerrar otras aplicaciones que puedan estar usando el hub por BLE o USB.
- Anotar: hub, versión de firmware, versión de perfil, sistema operativo,
  navegador y versión.
- Para flasheo: tener a mano el procedimiento de recuperación DFU del hub.
- No usar un hub principal para las primeras pruebas de borrado.

## 4. Casos de prueba

### BLE-DIS-01 · Información del hub

1. Conectar por BLE.
2. Leer nombre, firmware y perfil.
3. Comprobar que el perfil se interpreta como versión y que una versión
   desconocida se rechaza.

Resultado esperado: `HubInfo` coherente; sin excepciones de parseo.

### BLE-CAP-01 · Capacidades

1. Conectar un hub con perfil `>= 1.2.0`.
2. Leer la característica de capacidades.
3. Verificar `maxWriteSize`, flags, `maxUserProgramSize` y `numSlots`.

Resultado esperado: valores estables entre reconexiones; en `1.5.0`,
`numSlots > 0`; en perfiles anteriores, `numSlots = 0`.

### BLE-UPLOAD-01 · Descarga moderna

1. Compilar un programa Multi-MPY6 de prueba.
2. Subirlo a un slot válido.
3. Comprobar el reporte de estado y la ejecución.
4. Repetir con un programa de tamaño cercano al máximo.
5. Repetir con un slot inválido y comprobar que se rechaza antes de escribir.

Resultado esperado: el programa arranca; el progreso termina en 1; no se
escribe nada si la validación falla.

### BLE-UPLOAD-02 · Programa vacío o demasiado grande

1. Intentar subir un array vacío.
2. Intentar subir un programa mayor que `maxUserProgramSize`.

Resultado esperado: error de operación no soportada, sin comandos de escritura.

### BLE-LEGACY-01 · Descarga NUS

1. Usar un hub con perfil `< 1.2.0`.
2. Subir un `.mpy` ya compilado.
3. Verificar cabecera, bloques de 100 bytes, escrituras de 20 y checksums.
4. Repetir con un checksum manipulado.

Resultado esperado: el programa correcto arranca; el checksum incorrecto
detiene la descarga con `ChecksumMismatchError`.

### BLE-REPL-01 · REPL y stdin

1. Arrancar el REPL en un perfil moderno.
2. Enviar una línea y comprobar la respuesta.
3. Repetir en un perfil antiguo por NUS.

Resultado esperado: la entrada llega al hub; en perfiles antiguos se usa el
comando de cuatro espacios.

### BLE-APP-01 · AppData

1. Con un perfil `>= 1.4.0`, escribir datos en un offset válido.
2. Comprobar que el programa los recibe.
3. Probar un offset fuera de rango.

Resultado esperado: los datos llegan; el offset inválido se rechaza.

### BLE-FLASH-01 · Flasheo LWP3

1. Entrar en modo bootloader.
2. Leer `GetInfo` y comprobar tipo, direcciones y capacidad.
3. Borrar, inicializar, programar y arrancar.
4. Verificar el checksum final y el número de bytes.
5. Repetir con una imagen de tipo de hub incorrecto.

Resultado esperado: el hub arranca con el firmware nuevo; una imagen
incorrecta se rechaza antes de borrar.

### BLE-FLASH-02 · Timeout de borrado

1. Repetir el flasheo en un hub que no responda a `EraseFlash`.
2. Comprobar que, por defecto, el proceso se detiene.
3. Repetir con `continueOnEraseTimeout` sólo si hay evidencia de que el hub
   completa el borrado.

Resultado esperado: sin la opción, error; con la opción, el resto de la
secuencia se valida igualmente.

### USB-CONN-01 · Conexión USB Pybricks

1. Conectar un hub con firmware por USB.
2. Abrir el dispositivo, seleccionar configuración y reclamar la interfaz.
3. Leer nombre, firmware, perfil y capacidades.
4. Comprobar que los endpoints bulk IN/OUT son correctos.

Resultado esperado: `HubInfo` coherente y eventos disponibles tras
suscribirse.

### USB-CMD-01 · Comandos y eventos

1. Enviar un comando y esperar la respuesta.
2. Comprobar que un estado distinto de cero se convierte en error.
3. Provocar un evento y verificar que llega al suscriptor.
4. Enviar dos comandos seguidos y comprobar la serialización.

Resultado esperado: una respuesta por comando, sin respuestas cruzadas.

### USB-DFU-01 · Flasheo DFU

1. Poner Prime o Essential en modo bootloader.
2. Verificar el PID de bootloader.
3. Flashear una imagen oficial con WebDFU.
4. Comprobar el reinicio y la versión instalada.
5. Repetir con un cable desconectado a mitad para verificar el error.

Resultado esperado: el hub arranca; un error de conexión se reporta sin dejar
la aplicación colgada.

### DISCONNECT-01 · Desconexión

1. Desconectar el hub durante una descarga.
2. Desconectar durante una espera de checksum.
3. Desconectar durante el flasheo.

Resultado esperado: las esperas pendientes se rechazan, no quedan promesas sin
manejar y la sesión queda inutilizable hasta reconectar.

### RECOVERY-01 · Recuperación

1. Provocar un fallo controlado de flasheo.
2. Entrar en modo bootloader/DFU.
3. Restaurar el firmware oficial.
4. Documentar el procedimiento exacto por hub y sistema.

Resultado esperado: el hub vuelve a un estado funcional.

## 5. Evidencia

Para cada caso, guardar:

- hub, firmware y perfil;
- sistema operativo, navegador y versión;
- fecha;
- resultado: pasa, falla o bloqueado;
- log o captura del error;
- checksums y tamaños si hubo flasheo;
- diferencias observadas respecto a la documentación.

No basta con «funciona en mi hub». La validación debe poder repetirse.

## 6. Riesgos conocidos

| Riesgo | Estado |
| --- | --- |
| City Hub y la respuesta a `EraseFlash` varía por plataforma | Abierto |
| Chromium/BlueZ no recibe notificaciones tras reconectar | Mitigado con stop/start |
| NUS necesita esperar el checksum antes de escribir | Mitigado en la sesión |
| MTU real distinto de `maxWriteSize` | Se usa el valor publicado |
| WebUSB requiere gesto de usuario y permisos | Documentado |
| DFU en Windows requiere driver | Documentado |
| El hub puede desconectarse a mitad de flasheo | Se reporta; recuperación DFU |
| La compilación MPY no está implementada | Fuera de alcance |

## 7. Criterio para dejar de ser experimental

Un adaptador puede pasar a la ruta por defecto cuando:

1. todos los casos obligatorios de su familia pasan en al menos dos hubs;
2. se ha probado en al menos dos sistemas operativos o navegadores;
3. los errores de desconexión no dejan promesas sin manejar;
4. el procedimiento de recuperación está documentado;
5. no se han observado corrupciones de firmware ni programas;
6. la documentación refleja las diferencias reales.

Hasta entonces, el adaptador se importa explícitamente y no se exporta desde
la raíz del paquete.

## 8. Plantilla de informe

```text
Caso:
Hub:
Firmware:
Perfil:
Sistema:
Navegador:
Fecha:
Resultado:
Pasos:
Evidencia:
Notas:
```

## 9. Referencias

- [Protocolo](PROTOCOL.md)
- [Arquitectura](ARCHITECTURE.md)
- [Investigación](INVESTIGACION.md)
- Web Bluetooth: <https://webbluetoothcg.github.io/web-bluetooth/>
- WebUSB: <https://wicg.github.io/webusb/>
- DFU 1.1: <https://www.usb.org/sites/default/files/DFU_1.1.pdf>
- Pybricks technical info:
  <https://github.com/pybricks/technical-info>
