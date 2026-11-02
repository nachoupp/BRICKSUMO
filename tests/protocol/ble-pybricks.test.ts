import { describe, expect, it } from 'vitest';
import {
    BuiltinProgramId,
    CommandType,
    EventType,
    HubCapabilityFlag,
    Status,
    createLegacyStartReplCommand,
    createLegacyStartUserProgramCommand,
    createResetInUpdateModeCommand,
    createStartUserProgramCommand,
    createStopUserProgramCommand,
    createWriteAppDataCommand,
    createWriteStdinCommand,
    createWriteUserProgramMetaCommand,
    createWriteUserRamCommand,
    hasCapability,
    hasStatus,
    parseEvent,
    parseHubCapabilities,
    parseStatusReport,
    statusToFlag,
} from '../../src/protocol/ble-pybricks.js';

function bytes(...values: number[]): Uint8Array {
    return new Uint8Array(values);
}

describe('comandos Pybricks', () => {
    it('codifica StopUserProgram', () => {
        expect(createStopUserProgramCommand()).toEqual(
            bytes(CommandType.StopUserProgram),
        );
    });

    it('codifica StartUserProgram moderno y legacy', () => {
        expect(createStartUserProgramCommand(3)).toEqual(bytes(1, 3));
        expect(createStartUserProgramCommand(BuiltinProgramId.REPL)).toEqual(
            bytes(1, 0x80),
        );
        expect(createLegacyStartUserProgramCommand()).toEqual(bytes(1));
        expect(createLegacyStartReplCommand()).toEqual(bytes(2));
    });

    it('codifica WriteUserProgramMeta little-endian', () => {
        expect(createWriteUserProgramMetaCommand(0x12345678)).toEqual(
            bytes(3, 0x78, 0x56, 0x34, 0x12),
        );
    });

    it('codifica WriteUserRam con offset y payload', () => {
        expect(createWriteUserRamCommand(0x01020304, bytes(0xaa, 0xbb))).toEqual(
            bytes(4, 0x04, 0x03, 0x02, 0x01, 0xaa, 0xbb),
        );
    });

    it('codifica WriteStdin', () => {
        expect(createWriteStdinCommand(bytes(0x61, 0x62))).toEqual(
            bytes(6, 0x61, 0x62),
        );
    });

    it('codifica WriteAppData con offset de 16 bits', () => {
        expect(createWriteAppDataCommand(0x1234, bytes(0xaa))).toEqual(
            bytes(7, 0x34, 0x12, 0xaa),
        );
    });

    it('codifica ResetInUpdateMode', () => {
        expect(createResetInUpdateModeCommand()).toEqual(bytes(5));
    });

    it('rechaza valores fuera de rango', () => {
        expect(() => createStartUserProgramCommand(256)).toThrow();
        expect(() => createWriteUserProgramMetaCommand(-1)).toThrow();
        expect(() => createWriteAppDataCommand(0x10000, bytes())).toThrow();
    });
});

describe('eventos Pybricks', () => {
    it('decodifica un reporte de estado con running y slot', () => {
        const flags = statusToFlag(Status.UserProgramRunning);
        const event = parseStatusReport(
            bytes(
                EventType.StatusReport,
                flags & 0xff,
                (flags >>> 8) & 0xff,
                (flags >>> 16) & 0xff,
                (flags >>> 24) & 0xff,
                2,
                3,
            ),
        );

        expect(event).toEqual({
            type: 'status',
            flags,
            runningProgramId: 2,
            selectedSlot: 3,
        });
        expect(hasStatus(event.flags, Status.UserProgramRunning)).toBe(true);
    });

    it('acepta reportes antiguos sin running ni slot', () => {
        expect(parseStatusReport(bytes(0, 0, 0, 0, 0))).toEqual({
            type: 'status',
            flags: 0,
            runningProgramId: 0,
            selectedSlot: 0,
        });
    });

    it('decodifica stdout y AppData como copias', () => {
        const stdout = parseEvent(bytes(EventType.WriteStdout, 0x68, 0x69));
        expect(stdout).toEqual({ type: 'stdout', data: bytes(0x68, 0x69) });

        const appData = parseEvent(bytes(EventType.WriteAppData, 0x01, 0x02));
        expect(appData).toEqual({ type: 'appData', data: bytes(0x01, 0x02) });
    });

    it('rechaza eventos desconocidos o vacíos', () => {
        expect(() => parseEvent(bytes(0x7f))).toThrow();
        expect(() => parseEvent(bytes())).toThrow();
    });
});

describe('capacidades', () => {
    it('decodifica el layout de 10 bytes', () => {
        const data = bytes(
            0x14,
            0x00,
            0x02,
            0x00,
            0x00,
            0x00,
            0x00,
            0x00,
            0x01,
            0x00,
        );
        const capabilities = parseHubCapabilities(data);
        expect(capabilities).toEqual({
            maxWriteSize: 20,
            flags: 2,
            maxUserProgramSize: 0x00010000,
            numSlots: 0,
        });
        expect(
            hasCapability(capabilities, HubCapabilityFlag.UserProgramMultiMpy6),
        ).toBe(true);
    });

    it('decodifica numSlots en perfil 1.5', () => {
        const capabilities = parseHubCapabilities(
            bytes(0x14, 0, 0x02, 0, 0, 0, 0x00, 0x00, 0x01, 0x00, 0x05),
        );
        expect(capabilities.numSlots).toBe(5);
    });

    it('rechaza capacidades incompletas', () => {
        expect(() => parseHubCapabilities(bytes(0x14, 0))).toThrow();
    });
});
