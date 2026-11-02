import { describe, expect, it } from 'vitest';
import {
    LEGACY_NUS_CHUNK_SIZE,
    createLegacySizeHeader,
    legacyNusChecksum,
    planLegacyUpload,
} from '../../src/protocol/nus.js';

describe('protocolo NUS antiguo', () => {
    it('codifica el tamaño en 4 bytes little-endian', () => {
        expect(createLegacySizeHeader(0x12345678)).toEqual(
            new Uint8Array([0x78, 0x56, 0x34, 0x12]),
        );
    });

    it('calcula XOR empezando en 0x00', () => {
        expect(legacyNusChecksum([0x00])).toBe(0x00);
        expect(legacyNusChecksum([0xff, 0xff])).toBe(0x00);
        expect(legacyNusChecksum([0x01, 0x02, 0x03])).toBe(0x00);
    });

    it('planifica cabecera y bloques de 100 bytes', () => {
        const program = new Uint8Array(250).fill(0xaa);
        const plan = planLegacyUpload(program);

        expect(plan).toHaveLength(4);
        expect(plan[0]).toMatchObject({ phase: 'size', offset: 0 });
        expect(plan[0]?.data).toEqual(new Uint8Array([250, 0, 0, 0]));
        expect(plan[1]).toMatchObject({ phase: 'payload', offset: 0 });
        expect(plan[1]?.data).toHaveLength(LEGACY_NUS_CHUNK_SIZE);
        expect(plan[2]).toMatchObject({ phase: 'payload', offset: 100 });
        expect(plan[3]).toMatchObject({ phase: 'payload', offset: 200 });
        expect(plan[3]?.data).toHaveLength(50);

        // 250 = 0xfa; los bloques de 0xaa pares dan XOR 0.
        expect(plan[0]?.expectedChecksum).toBe(0xfa);
        expect(plan[1]?.expectedChecksum).toBe(0x00);
        expect(plan[2]?.expectedChecksum).toBe(0x00);
        expect(plan[3]?.expectedChecksum).toBe(0x00);
    });

    it('sólo envía cabecera si el programa está vacío', () => {
        const plan = planLegacyUpload(new Uint8Array());
        expect(plan).toHaveLength(1);
        expect(plan[0]?.phase).toBe('size');
    });

    it('rechaza tamaños de bloque inválidos', () => {
        expect(() => planLegacyUpload(new Uint8Array(1), 0)).toThrow();
    });
});
