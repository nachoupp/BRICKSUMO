import { ProtocolError } from './errors.js';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/** Crea una vista DataView respetando byteOffset y byteLength. */
export function toDataView(data: Uint8Array): DataView {
    return new DataView(data.buffer, data.byteOffset, data.byteLength);
}

/** Lanza ProtocolError si el buffer no tiene al menos `minimum` bytes. */
export function ensureLength(
    data: Uint8Array,
    minimum: number,
    context: string,
): void {
    if (data.byteLength < minimum) {
        throw new ProtocolError(
            `${context}: se esperaban al menos ${minimum} bytes, hay ${data.byteLength}`,
            data,
        );
    }
}

/** Lee un uint8 con comprobación de longitud. */
export function readUint8(data: Uint8Array, offset: number, context: string): number {
    ensureLength(data, offset + 1, context);
    return toDataView(data).getUint8(offset);
}

/** Lee un uint16 little-endian con comprobación de longitud. */
export function readUint16LE(
    data: Uint8Array,
    offset: number,
    context: string,
): number {
    ensureLength(data, offset + 2, context);
    return toDataView(data).getUint16(offset, true);
}

/** Lee un uint32 little-endian con comprobación de longitud. */
export function readUint32LE(
    data: Uint8Array,
    offset: number,
    context: string,
): number {
    ensureLength(data, offset + 4, context);
    return toDataView(data).getUint32(offset, true);
}

/** Codifica un uint16 little-endian. */
export function writeUint16LE(value: number): Uint8Array {
    const bytes = new Uint8Array(2);
    toDataView(bytes).setUint16(0, value & 0xffff, true);
    return bytes;
}

/** Codifica un uint32 little-endian. */
export function writeUint32LE(value: number): Uint8Array {
    const bytes = new Uint8Array(4);
    toDataView(bytes).setUint32(0, value >>> 0, true);
    return bytes;
}

/** Concatena buffers sin compartir memoria con las partes. */
export function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
    const length = parts.reduce((total, part) => total + part.byteLength, 0);
    const result = new Uint8Array(length);
    let offset = 0;
    for (const part of parts) {
        result.set(part, offset);
        offset += part.byteLength;
    }
    return result;
}

/** Copia un Uint8Array para aislarlo de mutaciones externas. */
export function copyBytes(data: Uint8Array): Uint8Array {
    return data.slice();
}

/** Devuelve los bytes en hexadecimal continuo, en minúsculas. */
export function toHex(data: Uint8Array): string {
    return Array.from(data, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Compara dos buffers byte a byte. */
export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) {
        return false;
    }
    for (let i = 0; i < a.byteLength; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

/** Codifica texto como UTF-8. */
export function utf8Encode(text: string): Uint8Array {
    return textEncoder.encode(text);
}

/** Decodifica UTF-8. */
export function utf8Decode(data: Uint8Array): string {
    return textDecoder.decode(data);
}
