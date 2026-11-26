// Compilar y subir un programa Python a un hub Pybricks (lo usan el banco y el combate).
// No guarda nada en el navegador.

import { compile } from '@pybricks/mpy-cross-v6';
import wasmUrl from '@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm?url';
import { encodeMultiMpy6 } from '../src/protocol/mpy.ts';

export async function compilar(codigo) {
    const resultado = await compile('main.py', codigo, undefined, wasmUrl);
    if (resultado.status !== 0 || !resultado.mpy) {
        const mensaje = Array.isArray(resultado.err) ? resultado.err.join('\n') : String(resultado.err ?? '');
        throw new Error(`El programa tiene errores:\n${mensaje}`);
    }
    return resultado.mpy;
}

/**
 * Compila `codigo`, para el programa en marcha (si lo hay), lo sube y lo arranca.
 * Opciones: enMarcha (bool), alProgreso(0..1), alEstado(texto).
 */
export async function subirPrograma(session, codigo, { enMarcha = false, alProgreso, alEstado } = {}) {
    alEstado?.('Compilando…');
    const mpy = await compilar(codigo);
    // Pybricks espera el programa principal como módulo "__main__".
    const paquete = encodeMultiMpy6([{ name: '__main__', bytecode: mpy }]);
    if (enMarcha) {
        await session.stopProgram();
    }
    alEstado?.('Enviando…');
    return session.uploadProgram(paquete, { onProgress: alProgreso });
}

/** Cambia el valor de un ajuste de la consola (línea `NOMBRE = número`) sin tocar el resto. */
export function fijarAjuste(codigo, nombre, valor) {
    const patron = new RegExp(`^(${nombre}\\s*=\\s*)-?\\d+`, 'm');
    return patron.test(codigo) ? codigo.replace(patron, `$1${valor}`) : codigo;
}
