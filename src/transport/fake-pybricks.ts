/* eslint-disable @typescript-eslint/require-await -- doble de prueba síncrono */
import {
    BuiltinProgramId,
    CommandType,
    EventType,
    HubCapabilityFlag,
    Status,
    type HubCapabilities,
    statusToFlag,
} from '../protocol/ble-pybricks.js';
import { readUint32LE, toDataView } from '../protocol/bytes.js';
import { xor8 } from '../protocol/checksums.js';
import { ProtocolError, TransportError } from '../protocol/errors.js';
import { getProfileFeatures } from '../protocol/profile.js';
import type {
    HubInfo,
    LegacyNusTransport,
    PybricksTransport,
    Unsubscribe,
} from './types.js';

/** Opciones del hub falso. */
export interface FakePybricksOptions {
    readonly name?: string;
    readonly firmwareVersion?: string;
    readonly profileVersion?: string;
    readonly maxWriteSize?: number;
    readonly maxUserProgramSize?: number;
    readonly numSlots?: number;
    readonly flags?: number;
    readonly capabilities?: HubCapabilities | null;
    readonly enableLegacyNus?: boolean;
    readonly legacyChunkSize?: number;
    readonly failNextCommand?: Error;
}

const DEFAULT_FLAGS =
    HubCapabilityFlag.HasRepl |
    HubCapabilityFlag.UserProgramMultiMpy6 |
    HubCapabilityFlag.HasPortView |
    HubCapabilityFlag.HasIMUCalibration;

/**
 * Hub Pybricks simulado.
 *
 * No pretende ser un emulador completo de MicroPython: valida el flujo de
 * comandos, el tamaño de los bloques, los offsets y el estado del programa.
 */
export class FakePybricksTransport implements PybricksTransport {
    readonly info: HubInfo;
    readonly commands: Uint8Array[] = [];
    readonly legacyNus: FakeLegacyNusTransport | null;

    program: Uint8Array | null = null;
    runningProgramId = 0;
    userProgramRunning = false;
    selectedSlot = 0;
    connected = true;
    updateMode = false;

    private readonly eventListeners = new Set<(data: Uint8Array) => void>();
    private readonly maxUserProgramSize: number;
    private readonly numSlots: number;
    private readonly legacyChunkSize: number;
    private failNextCommand: Error | undefined;
    /** Tamaño declarado por el último meta no nulo; 0 = aún desconocido. */
    private declaredProgramSize = 0;
    /** meta(0) o meta(size) abrió una sesión de escritura. */
    private programWriteOpen = false;
    private programBuffer = new Uint8Array(0);
    private programBytesWritten = 0;

    constructor(options: FakePybricksOptions = {}) {
        const profileVersion = options.profileVersion ?? '1.5.0';
        const features = getProfileFeatures(profileVersion);
        const maxWriteSize = options.maxWriteSize ?? 20;
        const maxUserProgramSize = options.maxUserProgramSize ?? 65536;
        const numSlots = options.numSlots ?? (features.hasSlots ? 5 : 0);
        const flags = options.flags ?? DEFAULT_FLAGS;
        const capabilities =
            options.capabilities === undefined
                ? features.hasCapabilities
                    ? {
                          maxWriteSize,
                          flags,
                          maxUserProgramSize,
                          numSlots,
                      }
                    : null
                : options.capabilities;

        this.maxUserProgramSize = maxUserProgramSize;
        this.numSlots = numSlots;
        this.legacyChunkSize = options.legacyChunkSize ?? 100;
        this.failNextCommand = options.failNextCommand;
        this.info = {
            name: options.name ?? 'Pybricks Fake Hub',
            firmwareVersion: options.firmwareVersion ?? '4.0.0b4',
            profileVersion,
            capabilities,
            kind: 'fake',
        };
        this.legacyNus =
            (options.enableLegacyNus ?? features.hasNus)
                ? new FakeLegacyNusTransport(this)
                : null;
    }

    /** Hace que el próximo comando falle. */
    failNext(error: Error): void {
        this.failNextCommand = error;
    }

    async writeCommand(command: Uint8Array): Promise<void> {
        if (!this.connected) {
            throw new TransportError('el hub falso está desconectado');
        }
        if (this.failNextCommand !== undefined) {
            const error = this.failNextCommand;
            this.failNextCommand = undefined;
            throw error;
        }

        this.commands.push(command.slice());
        const type = command[0] as CommandType | undefined;
        if (type === undefined) {
            throw new ProtocolError('comando vacío');
        }

        switch (type) {
            case CommandType.StopUserProgram:
                this.requireLength(command, 1, 'StopUserProgram');
                this.runningProgramId = 0;
                this.userProgramRunning = false;
                this.emitStatus();
                return;

            case CommandType.StartUserProgram:
                this.handleStartUserProgram(command);
                return;

            case CommandType.StartRepl:
                this.requireLength(command, 1, 'StartRepl');
                this.runningProgramId = BuiltinProgramId.REPL;
                this.userProgramRunning = true;
                this.emitStatus();
                return;

            case CommandType.WriteUserProgramMeta:
                this.handleWriteMeta(command);
                return;

            case CommandType.WriteUserRam:
                this.handleWriteRam(command);
                return;

            case CommandType.ResetInUpdateMode:
                this.requireLength(command, 1, 'ResetInUpdateMode');
                this.runningProgramId = 0;
                this.userProgramRunning = false;
                this.updateMode = true;
                this.emitStatus();
                return;

            case CommandType.WriteStdin:
                if (!getProfileFeatures(this.info.profileVersion).hasStdin) {
                    throw new ProtocolError('WriteStdin requiere perfil >= 1.3.0');
                }
                return;

            case CommandType.WriteAppData:
                if (!getProfileFeatures(this.info.profileVersion).hasAppData) {
                    throw new ProtocolError('WriteAppData requiere perfil >= 1.4.0');
                }
                // 1 byte de comando + 2 de offset + payload variable.
                if (command.byteLength < 3) {
                    throw new ProtocolError('WriteAppData incompleto', command);
                }
                return;

            default:
                throw new ProtocolError(
                    `comando Pybricks desconocido: ${command[0] ?? '?'}`,
                    command,
                );
        }
    }

    onEvent(listener: (data: Uint8Array) => void): Unsubscribe {
        this.eventListeners.add(listener);
        return () => {
            this.eventListeners.delete(listener);
        };
    }

    /** Inyecta un evento crudo; útil para probar errores de protocolo. */
    emitRawEvent(data: Uint8Array): void {
        for (const listener of this.eventListeners) {
            listener(data.slice());
        }
    }

    async disconnect(): Promise<void> {
        this.connected = false;
        this.eventListeners.clear();
        this.legacyNus?.close();
    }

    private requireLength(command: Uint8Array, expected: number, name: string): void {
        if (command.byteLength !== expected) {
            throw new ProtocolError(
                `${name}: se esperaban ${expected} bytes, hay ${command.byteLength}`,
                command,
            );
        }
    }

    private handleStartUserProgram(command: Uint8Array): void {
        const features = getProfileFeatures(this.info.profileVersion);
        if (features.usesLegacyStart) {
            this.requireLength(command, 1, 'StartUserProgram legacy');
            this.runningProgramId = 0;
            this.userProgramRunning = true;
            this.emitStatus();
            return;
        }

        this.requireLength(command, 2, 'StartUserProgram');
        const programId = command[1] ?? 0;

        if (programId < 0x80) {
            if (this.numSlots > 0 && programId >= this.numSlots) {
                throw new ProtocolError(`slot fuera de rango: ${programId}`);
            }
            if (this.program === null) {
                throw new ProtocolError('no hay un programa completo para iniciar');
            }
            this.selectedSlot = programId;
        }

        this.runningProgramId = programId;
        this.userProgramRunning = true;
        this.emitStatus();
    }

    private handleWriteMeta(command: Uint8Array): void {
        this.requireLength(command, 5, 'WriteUserProgramMeta');
        const size = readUint32LE(command, 1, 'WriteUserProgramMeta');

        if (size === 0) {
            // Invalida el programa anterior y abre la escritura por bloques.
            this.declaredProgramSize = 0;
            this.programWriteOpen = true;
            this.programBuffer = new Uint8Array(0);
            this.programBytesWritten = 0;
            this.program = null;
            return;
        }

        if (size > this.maxUserProgramSize) {
            throw new ProtocolError(
                `programa de ${size} bytes excede el máximo ${this.maxUserProgramSize}`,
                command,
            );
        }

        if (this.programBytesWritten === 0) {
            // Variante meta(size) antes de los bloques.
            this.declaredProgramSize = size;
            this.programWriteOpen = true;
            this.programBuffer = new Uint8Array(size);
            this.program = null;
            return;
        }

        // Protocolo moderno: meta(0), bloques y meta(size) de confirmación.
        if (this.programBytesWritten !== size) {
            throw new ProtocolError(
                `WriteUserProgramMeta declara ${size} bytes, se escribieron ` +
                    `${this.programBytesWritten}`,
                command,
            );
        }

        this.declaredProgramSize = size;
        this.programWriteOpen = false;
        this.program = this.programBuffer.slice(0, size);
    }

    private handleWriteRam(command: Uint8Array): void {
        if (command.byteLength < 5) {
            throw new ProtocolError('WriteUserRam incompleto', command);
        }
        if (!this.programWriteOpen) {
            throw new ProtocolError(
                'WriteUserRam sin WriteUserProgramMeta previo',
                command,
            );
        }

        const offset = readUint32LE(command, 1, 'WriteUserRam');
        const payload = command.subarray(5);
        const end = offset + payload.byteLength;

        if (end > this.maxUserProgramSize) {
            throw new ProtocolError(
                `WriteUserRam excede el máximo de programa: ${end} > ` +
                    `${this.maxUserProgramSize}`,
                command,
            );
        }
        if (this.declaredProgramSize > 0 && end > this.declaredProgramSize) {
            throw new ProtocolError(
                `WriteUserRam fuera de rango: offset ${offset} + ${payload.byteLength} > ` +
                    `${this.declaredProgramSize}`,
                command,
            );
        }
        if (offset !== this.programBytesWritten) {
            throw new ProtocolError(
                `WriteUserRam no secuencial: esperado ${this.programBytesWritten}, ` +
                    `recibido ${offset}`,
                command,
            );
        }

        if (end > this.programBuffer.byteLength) {
            const grown = new Uint8Array(end);
            grown.set(this.programBuffer);
            this.programBuffer = grown;
        }

        this.programBuffer.set(payload, offset);
        this.programBytesWritten = end;

        if (this.declaredProgramSize > 0 && this.programBytesWritten === this.declaredProgramSize) {
            this.program = this.programBuffer.slice(0, this.programBytesWritten);
        }
    }

    private emitStatus(): void {
        let flags = 0;
        if (this.userProgramRunning) {
            flags |= statusToFlag(Status.UserProgramRunning);
        }

        const event = new Uint8Array(7);
        const view = toDataView(event);
        view.setUint8(0, EventType.StatusReport);
        view.setUint32(1, flags >>> 0, true);
        view.setUint8(5, this.runningProgramId);
        view.setUint8(6, this.selectedSlot);

        for (const listener of this.eventListeners) {
            listener(event.slice());
        }
    }

    /** Usado por el canal NUS falso al completar un programa. */
    setLegacyProgram(program: Uint8Array): void {
        if (program.byteLength > this.maxUserProgramSize) {
            throw new ProtocolError(
                `programa NUS de ${program.byteLength} bytes excede el máximo ` +
                    `${this.maxUserProgramSize}`,
            );
        }
        this.program = program;
        this.declaredProgramSize = program.byteLength;
        this.programWriteOpen = false;
        this.programBytesWritten = program.byteLength;
        this.programBuffer = program.slice();
    }

    /** Chunk size esperado por el hub falso (para validaciones de test). */
    get legacyChunkSizeExpected(): number {
        return this.legacyChunkSize;
    }
}

/** Canal NUS falso. */
export class FakeLegacyNusTransport implements LegacyNusTransport {
    private readonly listeners = new Set<(checksum: number) => void>();
    private readonly dataListeners = new Set<(data: Uint8Array) => void>();
    private readonly chunks: Uint8Array[] = [];
    private readonly rawWrites: Uint8Array[] = [];
    private phase: 'size' | 'payload' = 'size';
    private expectedSize = 0;
    private received = new Uint8Array(0);
    private closed = false;

    constructor(private readonly hub: FakePybricksTransport) {}

    async writeChunk(data: Uint8Array): Promise<void> {
        if (this.closed) {
            throw new TransportError('NUS falso cerrado');
        }
        this.chunks.push(data.slice());

        if (this.phase === 'size') {
            if (data.byteLength !== 4) {
                throw new ProtocolError(
                    `cabecera NUS de tamaño inválida: ${data.byteLength} bytes`,
                    data,
                );
            }
            if (data.byteLength > this.hub.legacyChunkSizeExpected) {
                throw new ProtocolError('cabecera NUS mayor que el bloque permitido', data);
            }
            this.expectedSize = readUint32LE(data, 0, 'cabecera NUS');
            this.received = new Uint8Array(0);
            this.phase = 'payload';
            this.emitChecksum(xor8(data, 0));
            if (this.expectedSize === 0) {
                this.hub.setLegacyProgram(new Uint8Array(0));
            }
            return;
        }

        if (data.byteLength > this.hub.legacyChunkSizeExpected) {
            throw new ProtocolError(
                `bloque NUS de ${data.byteLength} bytes excede ` +
                    `${this.hub.legacyChunkSizeExpected}`,
                data,
            );
        }
        if (this.received.byteLength + data.byteLength > this.expectedSize) {
            throw new ProtocolError('NUS falso: más datos que el tamaño declarado', data);
        }
        const combined = new Uint8Array(this.received.byteLength + data.byteLength);
        combined.set(this.received);
        combined.set(data, this.received.byteLength);
        this.received = combined;

        this.emitChecksum(xor8(data, 0));

        if (this.received.byteLength === this.expectedSize) {
            this.hub.setLegacyProgram(this.received.slice());
        }
    }

    async writeRaw(data: Uint8Array): Promise<void> {
        this.rawWrites.push(data.slice());
    }

    onChecksum(listener: (checksum: number) => void): Unsubscribe {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    onData(listener: (data: Uint8Array) => void): Unsubscribe {
        this.dataListeners.add(listener);
        return () => {
            this.dataListeners.delete(listener);
        };
    }

    emitChecksum(checksum: number): void {
        for (const listener of this.listeners) {
            listener(checksum);
        }
        // El canal real entrega todas las notificaciones; el checksum también
        // es un byte de datos. La sesión lo ignora mientras dura la descarga.
        this.emitData(new Uint8Array([checksum]));
    }

    /** Simula stdout legacy por NUS. */
    emitData(data: Uint8Array): void {
        for (const listener of this.dataListeners) {
            listener(data.slice());
        }
    }

    close(): void {
        this.closed = true;
        this.listeners.clear();
        this.dataListeners.clear();
    }

    /** Bloques lógicos enviados, para aserciones. */
    get sentChunks(): readonly Uint8Array[] {
        return this.chunks;
    }

    /** Escrituras crudas (por ejemplo, el comando REPL), para aserciones. */
    get sentRawWrites(): readonly Uint8Array[] {
        return this.rawWrites;
    }
}
