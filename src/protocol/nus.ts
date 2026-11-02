import { writeUint32LE } from './bytes.js';
import { xor8 } from './checksums.js';

/** Servicio Nordic UART (NUS). */
export const NORDIC_UART_SERVICE_UUID = '6e400001-b5a3-f393-e0a9-e50e24dcca9e';

/** Característica RX de NUS (host → hub). */
export const NORDIC_UART_RX_UUID = '6e400002-b5a3-f393-e0a9-e50e24dcca9e';

/** Característica TX de NUS (hub → host). */
export const NORDIC_UART_TX_UUID = '6e400003-b5a3-f393-e0a9-e50e24dcca9e';

/** Tamaño seguro de escritura NUS cuando no se conoce el MTU. */
export const NORDIC_UART_SAFE_WRITE_SIZE = 20;

/** Tamaño de bloque del protocolo de descarga antiguo. */
export const LEGACY_NUS_CHUNK_SIZE = 100;

/** Comando de cuatro espacios que inicia el REPL en firmware antiguo. */
export const LEGACY_NUS_REPL_COMMAND: Uint8Array = new Uint8Array([
    0x20, 0x20, 0x20, 0x20,
]);

/** Checksum del protocolo NUS: XOR de todos los bytes, empezando en 0x00. */
export function legacyNusChecksum(data: Iterable<number>): number {
    return xor8(data, 0x00);
}

/** Cabecera de 4 bytes con el tamaño del programa, little-endian. */
export function createLegacySizeHeader(size: number): Uint8Array {
    if (!Number.isInteger(size) || size < 0 || size > 0xffffffff) {
        throw new RangeError(`tamaño de programa fuera de rango: ${size}`);
    }
    return writeUint32LE(size);
}

/** Bloque lógico del protocolo NUS antiguo. */
export interface LegacyUploadChunk {
    readonly phase: 'size' | 'payload';
    /** Offset dentro del programa; 0 para la cabecera. */
    readonly offset: number;
    /** Bytes del bloque. El transporte los divide en escrituras de 20 bytes. */
    readonly data: Uint8Array;
    /** Checksum que debe devolver el hub tras recibir el bloque. */
    readonly expectedChecksum: number;
}

/**
 * Planifica la descarga NUS antigua:
 * cabecera de tamaño → checksum → bloques de 100 bytes → checksum por bloque.
 */
export function planLegacyUpload(
    program: Uint8Array,
    chunkSize = LEGACY_NUS_CHUNK_SIZE,
): LegacyUploadChunk[] {
    if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
        throw new RangeError(`chunkSize inválido: ${chunkSize}`);
    }

    const header = createLegacySizeHeader(program.byteLength);
    const chunks: LegacyUploadChunk[] = [
        {
            phase: 'size',
            offset: 0,
            data: header,
            expectedChecksum: legacyNusChecksum(header),
        },
    ];

    for (let offset = 0; offset < program.byteLength; offset += chunkSize) {
        const data = program.slice(offset, offset + chunkSize);
        chunks.push({
            phase: 'payload',
            offset,
            data,
            expectedChecksum: legacyNusChecksum(data),
        });
    }

    return chunks;
}
