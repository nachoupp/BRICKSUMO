import { toDataView } from './bytes.js';
import { ProtocolError } from './errors.js';

/** Tipos de checksum usados por el bootloader y por los ZIP de firmware. */
export type ChecksumType = 'sum' | 'crc32' | 'none';

// Tabla de nibbles del CRC-32 usado por el bootloader de Pybricks.
// Polinomio 0x04c11db7, init 0xffffffff, sin xor final y sin reflexión.
const CRC32_NIBBLE_TABLE: readonly number[] = [
    0x00000000, 0x04c11db7, 0x09823b6e, 0x0d4326d9, 0x130476dc, 0x17c56b6b, 0x1a864db2,
    0x1e475005, 0x2608edb8, 0x22c9f00f, 0x2f8ad6d6, 0x2b4bcb61, 0x350c9b64, 0x31cd86d3,
    0x3c8ea00a, 0x384fbdbd,
];

/**
 * XOR de 8 bits. El valor inicial permite reutilizar el checksum entre
 * paquetes (el bootloader LWP3 empieza en 0xff).
 */
export function xor8(data: Iterable<number>, initial = 0): number {
    let checksum = initial & 0xff;
    for (const byte of data) {
        checksum ^= byte & 0xff;
    }
    return checksum;
}

/** Suma complemento a dos de palabras de 32 bits, como uint32. */
export function sumComplement32(words: Iterable<number>): number {
    let total = 0;
    for (const word of words) {
        total = (total + (word >>> 0)) >>> 0;
    }
    return (-total) >>> 0;
}

/** CRC-32 de palabras de 32 bits, como uint32. */
export function crc32(words: Iterable<number>): number {
    let crc = 0xffffffff;
    for (const word of words) {
        crc = (crc ^ (word >>> 0)) >>> 0;
        for (let i = 0; i < 8; i++) {
            const tableEntry = CRC32_NIBBLE_TABLE[crc >>> 28] ?? 0;
            crc = ((crc << 4) ^ tableEntry) >>> 0;
        }
    }
    return crc >>> 0;
}

/**
 * Itera el firmware como palabras de 32 bits little-endian y rellena el
 * espacio restante con 0xffffffff, que es el estado de la flash borrada.
 */
function* firmwareWords(
    image: Uint8Array,
    checksumSize: number,
): Generator<number, void, undefined> {
    const view = toDataView(image);
    for (let offset = 0; offset < image.byteLength; offset += 4) {
        yield view.getUint32(offset, true);
    }
    for (let offset = image.byteLength; offset < checksumSize; offset += 4) {
        yield 0xffffffff;
    }
}

/**
 * Calcula el checksum de una imagen de firmware.
 *
 * @param image Imagen completa, incluyendo el hueco de 4 bytes del checksum.
 * @param checksumSize Tamaño de flash sobre el que se calcula (múltiplo de 4).
 * @param type Tipo de checksum.
 */
export function firmwareChecksum(
    image: Uint8Array,
    checksumSize: number,
    type: ChecksumType,
): number | undefined {
    if (type === 'none') {
        return undefined;
    }

    if (checksumSize % 4 !== 0) {
        throw new ProtocolError(
            `checksum-size debe ser múltiplo de 4, es ${checksumSize}`,
            image,
        );
    }

    if (image.byteLength % 4 !== 0) {
        throw new ProtocolError(
            `la imagen debe estar alineada a 4 bytes, mide ${image.byteLength}`,
            image,
        );
    }

    if (image.byteLength > checksumSize) {
        throw new ProtocolError(
            `la imagen (${image.byteLength}) excede checksum-size (${checksumSize})`,
            image,
        );
    }

    return type === 'sum'
        ? sumComplement32(firmwareWords(image, checksumSize))
        : crc32(firmwareWords(image, checksumSize));
}
