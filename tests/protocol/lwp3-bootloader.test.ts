import { describe, expect, it } from 'vitest';
import {
    Command,
    ERROR_BYTECODE,
    HubType,
    ProtectionLevel,
    Result,
    createEraseFlashRequest,
    createGetChecksumRequest,
    createGetFlashStateRequest,
    createGetInfoRequest,
    createInitLoaderRequest,
    createProgramFlashRequest,
    createStartAppRequest,
    decodeBootloaderResponse,
    maxProgramFlashSize,
    parseErrorResponse,
    parseGetInfoResponse,
    parseProgramFlashResponse,
    updateXor8,
} from '../../src/protocol/lwp3-bootloader.js';

function bytes(...values: number[]): Uint8Array {
    return new Uint8Array(values);
}

function u32(value: number): number[] {
    return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff];
}

describe('mensajes del bootloader LWP3', () => {
    it('codifica comandos simples', () => {
        expect(createEraseFlashRequest()).toEqual(bytes(0x11));
        expect(createStartAppRequest()).toEqual(bytes(0x33));
        expect(createGetInfoRequest()).toEqual(bytes(0x55));
        expect(createGetChecksumRequest()).toEqual(bytes(0x66));
        expect(createGetFlashStateRequest()).toEqual(bytes(0x77));
    });

    it('codifica ProgramFlash con longitud, dirección y payload', () => {
        expect(
            createProgramFlashRequest(0x08008000, bytes(0x01, 0x02, 0x03)),
        ).toEqual(bytes(0x22, 0x07, 0x00, 0x80, 0x00, 0x08, 0x01, 0x02, 0x03));
    });

    it('codifica InitLoader', () => {
        expect(createInitLoaderRequest(0x12345678)).toEqual(
            bytes(0x44, 0x78, 0x56, 0x34, 0x12),
        );
    });

    it('limita el payload por tipo de hub', () => {
        expect(maxProgramFlashSize(HubType.MoveHub)).toBe(14);
        expect(maxProgramFlashSize(HubType.CityHub)).toBe(32);
        expect(maxProgramFlashSize(HubType.TechnicHub)).toBe(32);
        expect(maxProgramFlashSize(0x99 as HubType)).toBe(14);
    });
});

describe('respuestas del bootloader', () => {
    it('decodifica GetInfo', () => {
        const data = bytes(
            0x55,
            ...u32(1),
            ...u32(0x08008000),
            ...u32(0x08108000),
            0x80,
        );
        expect(parseGetInfoResponse(data)).toEqual({
            version: 1,
            startAddress: 0x08008000,
            endAddress: 0x08108000,
            hubType: HubType.TechnicHub,
        });
    });

    it('decodifica ProgramFlash final', () => {
        expect(
            parseProgramFlashResponse(bytes(0x22, 0xab, ...u32(1234))),
        ).toEqual([0xab, 1234]);
    });

    it('decodifica errores y devuelve el comando culpable', () => {
        const error = bytes(0x05, 0x00, 0x05, 0x22, 0x05);
        expect(parseErrorResponse(error)).toBe(Command.ProgramFlash);
        expect(decodeBootloaderResponse(error)).toEqual({
            type: 'error',
            command: Command.ProgramFlash,
        });
    });

    it('decodifica todas las respuestas conocidas', () => {
        expect(
            decodeBootloaderResponse(bytes(Command.EraseFlash, Result.OK)),
        ).toEqual({ type: 'erase', result: Result.OK });
        expect(
            decodeBootloaderResponse(bytes(Command.InitLoader, Result.Error)),
        ).toEqual({ type: 'init', result: Result.Error });
        expect(decodeBootloaderResponse(bytes(Command.GetChecksum, 0x7f))).toEqual({
            type: 'checksum',
            checksum: 0x7f,
        });
        expect(
            decodeBootloaderResponse(bytes(Command.GetFlashState, ProtectionLevel.Level1)),
        ).toEqual({ type: 'flashState', level: ProtectionLevel.Level1 });
    });

    it('rechaza respuestas desconocidas', () => {
        expect(() => decodeBootloaderResponse(bytes(ERROR_BYTECODE))).toThrow();
        expect(() => decodeBootloaderResponse(bytes(0x99))).toThrow();
    });
});

describe('checksum acumulado', () => {
    it('continúa el XOR desde el valor anterior', () => {
        expect(updateXor8(0xff, bytes(0x00))).toBe(0xff);
        expect(updateXor8(0xff, bytes(0xff, 0xff))).toBe(0xff);
        expect(updateXor8(0xff, bytes(0xc0, 0x0c))).toBe(0x33);
    });
});
