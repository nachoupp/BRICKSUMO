import {
    concatBytes,
    copyBytes,
    readUint32LE,
    utf8Decode,
    utf8Encode,
    writeUint32LE,
} from './bytes.js';
import { ProtocolError } from './errors.js';

/** Primer byte de un archivo .mpy con ABI v6. */
export const MPY6_HEADER_BYTE = 6;

/** Módulo dentro del contenedor Multi-MPY6. */
export interface MpyModule {
    /** Nombre del módulo, por ejemplo `__main__`. */
    readonly name: string;
    /** Bytecode .mpy completo. */
    readonly bytecode: Uint8Array;
}

/**
 * Construye el contenedor Multi-MPY6 de Pybricks.
 *
 * Formato por módulo: uint32 LE longitud, nombre UTF-8 terminado en NUL,
 * bytecode .mpy.
 */
export function encodeMultiMpy6(modules: readonly MpyModule[]): Uint8Array {
    const parts: Uint8Array[] = [];
    const seen = new Set<string>();

    for (const module of modules) {
        if (module.name.length === 0) {
            throw new ProtocolError('el nombre de un módulo no puede estar vacío');
        }
        if (module.name.includes('\0')) {
            throw new ProtocolError(
                `el nombre de módulo contiene NUL: ${JSON.stringify(module.name)}`,
            );
        }
        if (seen.has(module.name)) {
            throw new ProtocolError(`módulo duplicado: ${module.name}`);
        }
        seen.add(module.name);

        parts.push(writeUint32LE(module.bytecode.byteLength));
        parts.push(utf8Encode(module.name));
        parts.push(new Uint8Array([0]));
        parts.push(module.bytecode);
    }

    return concatBytes(parts);
}

/** Indica si el bytecode parece ser MPY ABI v6. */
export function isMpy6(bytecode: Uint8Array): boolean {
    return bytecode.byteLength > 0 && bytecode[0] === MPY6_HEADER_BYTE;
}

/** Decodifica y valida un contenedor Multi-MPY6. */
export function parseMultiMpy6(data: Uint8Array): MpyModule[] {
    const modules: MpyModule[] = [];
    const seen = new Set<string>();
    let offset = 0;

    while (offset < data.byteLength) {
        const length = readUint32LE(data, offset, 'Multi-MPY6');
        offset += 4;

        const nameStart = offset;
        while (offset < data.byteLength && data[offset] !== 0) {
            offset++;
        }
        if (offset >= data.byteLength) {
            throw new ProtocolError('Multi-MPY6: nombre de módulo sin terminador NUL', data);
        }

        const name = utf8Decode(data.subarray(nameStart, offset));
        offset++; // NUL

        if (name.length === 0) {
            throw new ProtocolError('Multi-MPY6: nombre de módulo vacío', data);
        }
        if (seen.has(name)) {
            throw new ProtocolError(`Multi-MPY6: módulo duplicado ${name}`, data);
        }
        seen.add(name);

        if (offset + length > data.byteLength) {
            throw new ProtocolError(
                `Multi-MPY6: el módulo ${name} declara ${length} bytes y solo quedan ` +
                    `${data.byteLength - offset}`,
                data,
            );
        }

        modules.push({ name, bytecode: copyBytes(data.subarray(offset, offset + length)) });
        offset += length;
    }

    return modules;
}
