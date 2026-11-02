import { copyBytes, readUint32LE, readUint8, toDataView } from './bytes.js';
import { ProtocolError } from './errors.js';

/** Servicio Pybricks. */
export const PYBRICKS_SERVICE_UUID = 'c5f50001-8280-46da-89f4-6d8051e4aeef';

/** Característica de control/eventos Pybricks. */
export const PYBRICKS_CONTROL_EVENT_UUID = 'c5f50002-8280-46da-89f4-6d8051e4aeef';

/** Característica de capacidades del hub. */
export const PYBRICKS_CAPABILITIES_UUID = 'c5f50003-8280-46da-89f4-6d8051e4aeef';

/** Comandos host → hub. */
export enum CommandType {
    StopUserProgram = 0,
    StartUserProgram = 1,
    StartRepl = 2,
    WriteUserProgramMeta = 3,
    WriteUserRam = 4,
    ResetInUpdateMode = 5,
    WriteStdin = 6,
    WriteAppData = 7,
}

/** Programas incorporados que se pueden iniciar con StartUserProgram. */
export enum BuiltinProgramId {
    REPL = 0x80,
    PortView = 0x81,
    IMUCalibration = 0x82,
}

/** Eventos hub → host. */
export enum EventType {
    StatusReport = 0,
    WriteStdout = 1,
    WriteAppData = 2,
}

/** Bits del reporte de estado. */
export enum Status {
    BatteryLowVoltageWarning = 0,
    BatteryLowVoltageShutdown = 1,
    BatteryHighCurrent = 2,
    BLEAdvertising = 3,
    BLELowSignal = 4,
    PowerButtonPressed = 5,
    UserProgramRunning = 6,
    Shutdown = 7,
}

/** Formatos de programa de usuario. */
export enum FileFormat {
    Mpy5 = 0,
    Mpy6 = 1,
    MultiMpy6 = 2,
}

/** Convierte un estado a su bit dentro del reporte. */
export function statusToFlag(status: Status): number {
    return (1 << status) >>> 0;
}

/** Indica si un reporte contiene un estado concreto. */
export function hasStatus(flags: number, status: Status): boolean {
    return (flags & statusToFlag(status)) !== 0;
}

/** Convierte un valor de capacidad a su bit. */
export function capabilityFlag(flag: HubCapabilityFlag): number {
    return flag >>> 0;
}

/** Indica si el hub declara una capacidad. */
export function hasCapability(
    capabilities: HubCapabilities,
    flag: HubCapabilityFlag,
): boolean {
    return (capabilities.flags & capabilityFlag(flag)) !== 0;
}

/** Capacidades publicadas por la característica c5f50003. */
export interface HubCapabilities {
    /** Máximo tamaño de una escritura GATT sin long-write. */
    readonly maxWriteSize: number;
    /** Bits de HubCapabilityFlag. */
    readonly flags: number;
    /** Tamaño máximo del programa de usuario. */
    readonly maxUserProgramSize: number;
    /** Número de slots; 0 si el perfil es anterior a 1.5.0. */
    readonly numSlots: number;
}

/** Capacidades del hub. */
export enum HubCapabilityFlag {
    HasRepl = 1 << 0,
    UserProgramMultiMpy6 = 1 << 1,
    UserProgramMultiMpy6Native6p1 = 1 << 2,
    HasPortView = 1 << 3,
    HasIMUCalibration = 1 << 4,
}

/** Reporte de estado decodificado. */
export interface StatusReportEvent {
    readonly type: 'status';
    readonly flags: number;
    readonly runningProgramId: number;
    readonly selectedSlot: number;
}

/** Salida estándar del programa de usuario. */
export interface StdoutEvent {
    readonly type: 'stdout';
    readonly data: Uint8Array;
}

/** Datos de la aplicación del usuario. */
export interface AppDataEvent {
    readonly type: 'appData';
    readonly data: Uint8Array;
}

export type PybricksEvent = StatusReportEvent | StdoutEvent | AppDataEvent;

function assertUint8(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xff) {
        throw new ProtocolError(`${name} debe ser un entero entre 0 y 255: ${value}`);
    }
}

function assertUint32(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new ProtocolError(
            `${name} debe ser un entero entre 0 y 4294967295: ${value}`,
        );
    }
}

/** Crea StopUserProgram. */
export function createStopUserProgramCommand(): Uint8Array {
    return new Uint8Array([CommandType.StopUserProgram]);
}

/** Crea StartUserProgram con un slot o un programa incorporado. */
export function createStartUserProgramCommand(
    programId: number | BuiltinProgramId,
): Uint8Array {
    assertUint8(programId, 'programId');
    return new Uint8Array([CommandType.StartUserProgram, programId]);
}

/** Crea la variante antigua de StartUserProgram (sin id), perfil <1.4. */
export function createLegacyStartUserProgramCommand(): Uint8Array {
    return new Uint8Array([CommandType.StartUserProgram]);
}

/** Crea la variante antigua StartRepl, perfil <1.4. */
export function createLegacyStartReplCommand(): Uint8Array {
    return new Uint8Array([CommandType.StartRepl]);
}

/** Crea WriteUserProgramMeta con el tamaño del programa. */
export function createWriteUserProgramMetaCommand(size: number): Uint8Array {
    assertUint32(size, 'size');
    const message = new Uint8Array(5);
    const view = toDataView(message);
    view.setUint8(0, CommandType.WriteUserProgramMeta);
    view.setUint32(1, size, true);
    return message;
}

/** Crea WriteUserRam con offset absoluto dentro de la RAM de usuario. */
export function createWriteUserRamCommand(
    offset: number,
    payload: Uint8Array,
): Uint8Array {
    assertUint32(offset, 'offset');
    const message = new Uint8Array(5 + payload.byteLength);
    const view = toDataView(message);
    view.setUint8(0, CommandType.WriteUserRam);
    view.setUint32(1, offset, true);
    message.set(payload, 5);
    return message;
}

/** Crea WriteStdin. */
export function createWriteStdinCommand(payload: Uint8Array): Uint8Array {
    const message = new Uint8Array(1 + payload.byteLength);
    message[0] = CommandType.WriteStdin;
    message.set(payload, 1);
    return message;
}

/** Crea WriteAppData con offset de 16 bits. */
export function createWriteAppDataCommand(
    offset: number,
    payload: Uint8Array,
): Uint8Array {
    if (!Number.isInteger(offset) || offset < 0 || offset > 0xffff) {
        throw new ProtocolError(`offset de AppData fuera de rango: ${offset}`);
    }
    const message = new Uint8Array(3 + payload.byteLength);
    const view = toDataView(message);
    view.setUint8(0, CommandType.WriteAppData);
    view.setUint16(1, offset, true);
    message.set(payload, 3);
    return message;
}

/** Crea ResetInUpdateMode. */
export function createResetInUpdateModeCommand(): Uint8Array {
    return new Uint8Array([CommandType.ResetInUpdateMode]);
}

/** Lee el tipo de evento. */
export function getEventType(data: Uint8Array): EventType {
    return readUint8(data, 0, 'evento Pybricks');
}

/** Decodifica un reporte de estado. */
export function parseStatusReport(data: Uint8Array): StatusReportEvent {
    if (getEventType(data) !== EventType.StatusReport) {
        throw new ProtocolError('se esperaba un reporte de estado', data);
    }
    return {
        type: 'status',
        flags: readUint32LE(data, 1, 'reporte de estado'),
        runningProgramId: data.byteLength > 5 ? (data[5] ?? 0) : 0,
        selectedSlot: data.byteLength > 6 ? (data[6] ?? 0) : 0,
    };
}

/** Decodifica stdout. */
export function parseWriteStdout(data: Uint8Array): StdoutEvent {
    if (getEventType(data) !== EventType.WriteStdout) {
        throw new ProtocolError('se esperaba un evento de stdout', data);
    }
    return { type: 'stdout', data: copyBytes(data.subarray(1)) };
}

/** Decodifica AppData. */
export function parseWriteAppData(data: Uint8Array): AppDataEvent {
    if (getEventType(data) !== EventType.WriteAppData) {
        throw new ProtocolError('se esperaba un evento de AppData', data);
    }
    return { type: 'appData', data: copyBytes(data.subarray(1)) };
}

/** Decodifica cualquier evento conocido. */
export function parseEvent(data: Uint8Array): PybricksEvent {
    switch (getEventType(data)) {
        case EventType.StatusReport:
            return parseStatusReport(data);
        case EventType.WriteStdout:
            return parseWriteStdout(data);
        case EventType.WriteAppData:
            return parseWriteAppData(data);
        default:
            throw new ProtocolError(
                `tipo de evento Pybricks desconocido: ${getEventType(data)}`,
                data,
            );
    }
}

/**
 * Decodifica la característica de capacidades.
 *
 * Perfil 1.2/1.3/1.4: 10 bytes. Perfil 1.5: 11 bytes, con numSlots al final.
 */
export function parseHubCapabilities(data: Uint8Array): HubCapabilities {
    if (data.byteLength < 10) {
        throw new ProtocolError(
            `capacidades incompletas: ${data.byteLength} bytes, se esperaban 10`,
            data,
        );
    }
    const view = toDataView(data);
    return {
        maxWriteSize: view.getUint16(0, true),
        flags: view.getUint32(2, true),
        maxUserProgramSize: view.getUint32(6, true),
        numSlots: data.byteLength >= 11 ? view.getUint8(10) : 0,
    };
}
