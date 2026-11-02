import { describe, expect, it } from 'vitest';
import {
    BuiltinProgramId,
    CommandType,
    FileFormat,
    HubCapabilityFlag,
    Status,
    createWriteUserProgramMetaCommand,
    createWriteUserRamCommand,
    statusToFlag,
} from '../../src/protocol/ble-pybricks.js';
import { readUint32LE } from '../../src/protocol/bytes.js';
import { HubSession } from '../../src/session/hub-session.js';
import { FakePybricksTransport } from '../../src/transport/fake-pybricks.js';

function makeProgram(length = 250): Uint8Array {
    const program = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        program[i] = i & 0xff;
    }
    return program;
}

function commandTypes(fake: FakePybricksTransport): number[] {
    return fake.commands.map((command) => command[0] ?? -1);
}

describe('HubSession · descarga moderna', () => {
    it('escribe meta, bloques y meta final, luego inicia el slot', async () => {
        const fake = new FakePybricksTransport({
            profileVersion: '1.5.0',
            maxWriteSize: 20,
            maxUserProgramSize: 1024,
            numSlots: 5,
        });
        const session = new HubSession(fake);
        const program = makeProgram();
        const progress: number[] = [];

        const result = await session.uploadProgram(program, {
            slot: 2,
            onProgress: (value) => progress.push(value),
        });

        expect(result).toEqual({ mode: 'modern', bytes: 250, slot: 2 });
        expect(fake.program).toEqual(program);
        expect(fake.runningProgramId).toBe(2);
        expect(fake.selectedSlot).toBe(2);

        const types = commandTypes(fake);
        expect(types[0]).toBe(CommandType.WriteUserProgramMeta);
        expect(types.at(-2)).toBe(CommandType.WriteUserProgramMeta);
        expect(types.at(-1)).toBe(CommandType.StartUserProgram);

        expect(fake.commands[0]).toEqual(createWriteUserProgramMetaCommand(0));
        expect(fake.commands.at(-2)).toEqual(
            createWriteUserProgramMetaCommand(program.byteLength),
        );
        expect(fake.commands.at(-1)).toEqual(
            new Uint8Array([CommandType.StartUserProgram, 2]),
        );

        const chunks = fake.commands.slice(1, -2);
        expect(chunks).toHaveLength(Math.ceil(program.byteLength / 15));
        for (const [index, command] of chunks.entries()) {
            const offset = index * 15;
            expect(command).toEqual(
                createWriteUserRamCommand(
                    offset,
                    program.subarray(offset, offset + 15),
                ),
            );
            expect(readUint32LE(command, 1, 'WriteUserRam')).toBe(offset);
        }

        expect(progress[0]).toBe(0);
        expect(progress.at(-1)).toBe(1);
        expect(session.state.runningProgramId).toBe(2);
        expect(
            session.state.statusFlags & statusToFlag(Status.UserProgramRunning),
        ).not.toBe(0);
    });

    it('usa StartUserProgram legacy en perfil 1.3', async () => {
        const fake = new FakePybricksTransport({
            profileVersion: '1.3.0',
            maxWriteSize: 20,
            maxUserProgramSize: 1024,
            flags:
                HubCapabilityFlag.HasRepl |
                HubCapabilityFlag.UserProgramMultiMpy6,
        });
        const session = new HubSession(fake);

        const result = await session.uploadProgram(makeProgram(40));

        expect(result.mode).toBe('modern');
        expect(fake.program).toEqual(makeProgram(40));
        expect(fake.commands.at(-1)).toEqual(
            new Uint8Array([CommandType.StartUserProgram]),
        );
    });

    it('rechaza programas demasiado grandes', async () => {
        const fake = new FakePybricksTransport({
            maxUserProgramSize: 100,
            maxWriteSize: 20,
        });
        const session = new HubSession(fake);
        await expect(session.uploadProgram(makeProgram(101))).rejects.toThrow(
            /excede el máximo/,
        );
    });

    it('rechaza slots fuera de rango', async () => {
        const fake = new FakePybricksTransport({ numSlots: 2 });
        const session = new HubSession(fake);
        await expect(
            session.uploadProgram(makeProgram(10), { slot: 2 }),
        ).rejects.toThrow(/fuera de rango/);
    });

    it('rechaza formatos sin MultiMpy6', async () => {
        const fake = new FakePybricksTransport({ flags: 0 });
        const session = new HubSession(fake);
        expect(session.fileFormat).toBeNull();
        await expect(session.uploadProgram(makeProgram(10))).rejects.toThrow(
            /formato/,
        );
    });

    it('detecta que MultiMpy6 está disponible', () => {
        const fake = new FakePybricksTransport();
        const session = new HubSession(fake);
        expect(session.fileFormat).toBe(FileFormat.MultiMpy6);
    });
});

describe('HubSession · descarga NUS antigua', () => {
    it('usa NUS y no envía comandos de control en perfil 1.1', async () => {
        const fake = new FakePybricksTransport({
            profileVersion: '1.1.0',
            maxUserProgramSize: 1024,
        });
        const session = new HubSession(fake);
        const program = makeProgram(250);

        const result = await session.uploadProgram(program);

        expect(result).toEqual({ mode: 'legacy', bytes: 250, slot: 0 });
        expect(fake.program).toEqual(program);
        expect(fake.commands).toHaveLength(0);
        expect(fake.legacyNus?.sentChunks).toHaveLength(4);
        expect(fake.legacyNus?.sentChunks[0]).toEqual(
            new Uint8Array([250, 0, 0, 0]),
        );
    });

    it('falla si el transporte no ofrece NUS', async () => {
        const fake = new FakePybricksTransport({
            profileVersion: '1.1.0',
            enableLegacyNus: false,
        });
        const session = new HubSession(fake);
        await expect(session.uploadProgram(makeProgram(10))).rejects.toThrow(
            /NUS/,
        );
    });
});

describe('HubSession · REPL, stdin y AppData', () => {
    it('inicia REPL moderno en 1.5', async () => {
        const fake = new FakePybricksTransport({ profileVersion: '1.5.0' });
        const session = new HubSession(fake);
        await session.startRepl();
        expect(fake.commands.at(-1)).toEqual(
            new Uint8Array([CommandType.StartUserProgram, BuiltinProgramId.REPL]),
        );
    });

    it('inicia REPL legacy en 1.3', async () => {
        const fake = new FakePybricksTransport({ profileVersion: '1.3.0' });
        const session = new HubSession(fake);
        await session.startRepl();
        expect(fake.commands.at(-1)).toEqual(
            new Uint8Array([CommandType.StartRepl]),
        );
    });

    it('inicia REPL por NUS en 1.1', async () => {
        const fake = new FakePybricksTransport({ profileVersion: '1.1.0' });
        const session = new HubSession(fake);
        await session.startRepl();
        expect(fake.legacyNus?.sentRawWrites[0]).toEqual(
            new Uint8Array([0x20, 0x20, 0x20, 0x20]),
        );
    });

    it('envía stdin por control en 1.3 y por NUS en 1.2', async () => {
        const modern = new FakePybricksTransport({ profileVersion: '1.3.0' });
        const modernSession = new HubSession(modern);
        await modernSession.writeStdin(new Uint8Array([0x61]));
        expect(modern.commands.at(-1)).toEqual(
            new Uint8Array([CommandType.WriteStdin, 0x61]),
        );

        const legacy = new FakePybricksTransport({ profileVersion: '1.2.0' });
        const legacySession = new HubSession(legacy);
        await legacySession.writeStdin(new Uint8Array([0x62]));
        expect(legacy.legacyNus?.sentRawWrites[0]).toEqual(
            new Uint8Array([0x62]),
        );
    });

    it('envía AppData sólo desde 1.4', async () => {
        const old = new FakePybricksTransport({ profileVersion: '1.3.0' });
        await expect(
            new HubSession(old).writeAppData(0, new Uint8Array([1])),
        ).rejects.toThrow(/AppData/);

        const modern = new FakePybricksTransport({ profileVersion: '1.4.0' });
        await new HubSession(modern).writeAppData(0x1234, new Uint8Array([0xaa]));
        expect(modern.commands.at(-1)).toEqual(
            new Uint8Array([CommandType.WriteAppData, 0x34, 0x12, 0xaa]),
        );
    });
});

describe('HubSession · estado y errores', () => {
    it('actualiza el estado y emite eventos', async () => {
        const fake = new FakePybricksTransport();
        const session = new HubSession(fake);
        const events: string[] = [];
        session.onEvent((event) => events.push(event.type));

        await session.uploadProgram(makeProgram(10), { slot: 1 });
        await session.stopProgram();

        expect(events).toContain('status');
        expect(session.state.runningProgramId).toBe(0);
        expect(
            session.state.statusFlags & statusToFlag(Status.UserProgramRunning),
        ).toBe(0);
    });

    it('reporta errores de protocolo sin romper la sesión', () => {
        const fake = new FakePybricksTransport();
        const errors: Error[] = [];
        const session = new HubSession(fake, {
            onProtocolError: (error) => errors.push(error),
        });

        fake.emitRawEvent(new Uint8Array([0x7f]));

        expect(errors).toHaveLength(1);
        expect(session.lastError).toBe(errors[0]);
    });

    it('desconecta el transporte', async () => {
        const fake = new FakePybricksTransport();
        const session = new HubSession(fake);
        await session.disconnect();
        expect(fake.connected).toBe(false);
    });
});
