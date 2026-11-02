import { describe, expect, it } from 'vitest';
import {
    encodeMultiMpy6,
    isMpy6,
    parseMultiMpy6,
} from '../../src/protocol/mpy.js';

function bytes(...values: number[]): Uint8Array {
    return new Uint8Array(values);
}

describe('contenedor Multi-MPY6', () => {
    it('codifica longitud, nombre NUL y bytecode', () => {
        const encoded = encodeMultiMpy6([
            { name: '__main__', bytecode: bytes(0x06, 0x01) },
            { name: 'util', bytecode: bytes(0x06, 0x02, 0x03) },
        ]);

        expect(encoded).toEqual(
            bytes(
                0x02, 0x00, 0x00, 0x00,
                0x5f, 0x5f, 0x6d, 0x61, 0x69, 0x6e, 0x5f, 0x5f, 0x00,
                0x06, 0x01,
                0x03, 0x00, 0x00, 0x00,
                0x75, 0x74, 0x69, 0x6c, 0x00,
                0x06, 0x02, 0x03,
            ),
        );
    });

    it('hace round-trip', () => {
        const modules = [
            { name: '__main__', bytecode: bytes(6, 1, 2, 3) },
            { name: 'mod', bytecode: bytes(6, 9) },
        ];
        expect(parseMultiMpy6(encodeMultiMpy6(modules))).toEqual(modules);
    });

    it('detecta el header MPY6', () => {
        expect(isMpy6(bytes(6))).toBe(true);
        expect(isMpy6(bytes(5))).toBe(false);
        expect(isMpy6(bytes())).toBe(false);
    });

    it('rechaza nombres inválidos o duplicados', () => {
        expect(() => encodeMultiMpy6([{ name: '', bytecode: bytes(6) }])).toThrow();
        expect(() =>
            encodeMultiMpy6([
                { name: 'a', bytecode: bytes(6) },
                { name: 'a', bytecode: bytes(6) },
            ]),
        ).toThrow();
        expect(() =>
            encodeMultiMpy6([{ name: 'a\0b', bytecode: bytes(6) }]),
        ).toThrow();
    });

    it('rechaza contenedores truncados', () => {
        expect(() => parseMultiMpy6(bytes(1, 0, 0, 0))).toThrow();
        expect(() => parseMultiMpy6(bytes(1, 0, 0, 0, 0x61))).toThrow();
        expect(() => parseMultiMpy6(bytes(5, 0, 0, 0, 0x61, 0x00, 6))).toThrow();
    });
});
