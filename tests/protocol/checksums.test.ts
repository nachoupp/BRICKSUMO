import { describe, expect, it } from 'vitest';
import {
    crc32,
    firmwareChecksum,
    sumComplement32,
    xor8,
} from '../../src/protocol/checksums.js';

describe('xor8', () => {
    it('empieza en 0x00 por defecto', () => {
        expect(xor8([0x00])).toBe(0x00);
        expect(xor8([0xc0, 0x0c])).toBe(0xcc);
    });

    it('permite inicializar en 0xff, como LWP3', () => {
        expect(xor8([0x00], 0xff)).toBe(0xff);
        expect(xor8([0xff, 0xff, 0xff], 0xff)).toBe(0x00);
        expect(xor8([0xc0, 0x0c], 0xff)).toBe(0x33);
    });
});

describe('sumComplement32', () => {
    it('devuelve el complemento a dos como uint32', () => {
        expect(sumComplement32([1, 2, 3, 4, 5])).toBe(0xfffffff1);
    });

    it('maneja el desbordamiento de 32 bits', () => {
        expect(sumComplement32([0xffffffff, 0xffffffff])).toBe(0x00000002);
    });
});

describe('crc32', () => {
    it('coincide con la implementación Python de Pybricks (STM32)', () => {
        // Vectores calculados con tools/flash/checksum.py de pybricks-micropython.
        expect(crc32([0])).toBe(3338984827);
        expect(crc32([0xffffffff])).toBe(0);
        expect(crc32([1, 2, 3, 4, 5])).toBe(2844647194);
    });
});

describe('firmwareChecksum', () => {
    it('calcula sum sobre palabras y rellena con 0xffffffff', () => {
        const image = new Uint8Array([1, 0, 0, 0, 2, 0, 0, 0]);
        const expected = sumComplement32([1, 2, 0xffffffff, 0xffffffff]);
        expect(firmwareChecksum(image, 16, 'sum')).toBe(expected);
    });

    it('calcula crc32 sobre palabras y relleno', () => {
        const image = new Uint8Array([1, 0, 0, 0, 2, 0, 0, 0]);
        const expected = crc32([1, 2, 0xffffffff, 0xffffffff]);
        expect(firmwareChecksum(image, 16, 'crc32')).toBe(expected);
    });

    it('devuelve undefined para none', () => {
        expect(firmwareChecksum(new Uint8Array(4), 16, 'none')).toBeUndefined();
    });

    it('rechaza tamaños no alineados', () => {
        expect(() => firmwareChecksum(new Uint8Array(3), 16, 'sum')).toThrow();
        expect(() => firmwareChecksum(new Uint8Array(4), 17, 'sum')).toThrow();
        expect(() => firmwareChecksum(new Uint8Array(8), 4, 'sum')).toThrow();
    });
});
