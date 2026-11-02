import { readUint32LE, readUint8, toDataView } from './bytes.js';
import { ProtocolError } from './errors.js';
import { xor8 } from './checksums.js';

/** Servicio LEGO Powered Up Bootloader. */
export const LWP3_BOOTLOADER_SERVICE_UUID = '00001625-1212-efde-1623-785feabcd123';

/** Característica LEGO Powered Up Bootloader. */
export const LWP3_BOOTLOADER_CHARACTERISTIC_UUID =
    '00001626-1212-efde-1623-785feabcd123';

/** Tamaño máximo de mensaje LWP3. */
export const LWP3_MAX_MESSAGE_SIZE = 20;

/** Hubs que usan este bootloader. */
export enum HubType {
    MoveHub = 0x40,
    CityHub = 0x41,
    TechnicHub = 0x80,
}

/** Comandos del bootloader. */
export enum Command {
    EraseFlash = 0x11,
    ProgramFlash = 0x22,
    StartApp = 0x33,
    InitLoader = 0x44,
    GetInfo = 0x55,
    GetChecksum = 0x66,
    GetFlashState = 0x77,
    Disconnect = 0x88,
}

/** Primer byte de un mensaje de error. */
export const ERROR_BYTECODE = 0x05;

/** Código de error "comando no reconocido". */
const ERROR_UNKNOWN_COMMAND = 0x05;

/** Resultado de una operación del bootloader. */
export enum Result {
    OK = 0x00,
    Error = 0xff,
}

/** Nivel de protección de la flash. */
export enum ProtectionLevel {
    None = 0x00,
    Level1 = 0x01,
    Level2 = 0x02,
}

/**
 * Tamaño máximo del payload de ProgramFlash.
 *
 * City y Technic reportan MTU 158 pero se bloquean con más de 32 bytes.
 */
export const MAX_PROGRAM_FLASH_SIZE: ReadonlyMap<HubType, number> = new Map([
    [HubType.MoveHub, 14],
    [HubType.CityHub, 32],
    [HubType.TechnicHub, 32],
]);

/** Devuelve el payload máximo para un hub, con 14 como valor conservador. */
export function maxProgramFlashSize(hubType: HubType): number {
    return MAX_PROGRAM_FLASH_SIZE.get(hubType) ?? 14;
}

/** Información del bootloader. */
export interface BootloaderInfo {
    readonly version: number;
    readonly startAddress: number;
    readonly endAddress: number;
    readonly hubType: HubType;
}

function assertUint32(value: number, name: string): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffffff) {
        throw new ProtocolError(`${name} fuera de rango uint32: ${value}`);
    }
}

/** Crea EraseFlash. */
export function createEraseFlashRequest(): Uint8Array {
    return new Uint8Array([Command.EraseFlash]);
}

/** Crea ProgramFlash con dirección little-endian y payload. */
export function createProgramFlashRequest(
    address: number,
    payload: Uint8Array,
): Uint8Array {
    assertUint32(address, 'address');
    if (payload.byteLength > 0xfb) {
        throw new ProtocolError(
            `payload de ProgramFlash demasiado grande: ${payload.byteLength}`,
            payload,
        );
    }

    const message = new Uint8Array(payload.byteLength + 6);
    const view = toDataView(message);
    view.setUint8(0, Command.ProgramFlash);
    view.setUint8(1, payload.byteLength + 4);
    view.setUint32(2, address, true);
    message.set(payload, 6);
    return message;
}

/** Crea StartApp. */
export function createStartAppRequest(): Uint8Array {
    return new Uint8Array([Command.StartApp]);
}

/** Crea InitLoader con el tamaño total del firmware. */
export function createInitLoaderRequest(firmwareSize: number): Uint8Array {
    assertUint32(firmwareSize, 'firmwareSize');
    const message = new Uint8Array(5);
    const view = toDataView(message);
    view.setUint8(0, Command.InitLoader);
    view.setUint32(1, firmwareSize, true);
    return message;
}

/** Crea GetInfo. */
export function createGetInfoRequest(): Uint8Array {
    return new Uint8Array([Command.GetInfo]);
}

/** Crea GetChecksum. */
export function createGetChecksumRequest(): Uint8Array {
    return new Uint8Array([Command.GetChecksum]);
}

/** Crea GetFlashState. */
export function createGetFlashStateRequest(): Uint8Array {
    return new Uint8Array([Command.GetFlashState]);
}

/** Crea Disconnect. */
export function createDisconnectRequest(): Uint8Array {
    return new Uint8Array([Command.Disconnect]);
}

/** Lee el tipo de mensaje (comando o 0x05 para error). */
export function getMessageType(data: Uint8Array): Command {
    return readUint8(data, 0, 'mensaje del bootloader');
}

/** Decodifica un error y devuelve el comando que lo provocó. */
export function parseErrorResponse(data: Uint8Array): Command {
    if (data.byteLength < 5) {
        throw new ProtocolError(
            `respuesta de error incompleta: ${data.byteLength} bytes`,
            data,
        );
    }
    if (data[0] !== ERROR_BYTECODE || data[2] !== ERROR_BYTECODE) {
        throw new ProtocolError('se esperaba un mensaje de error 0x05', data);
    }
    if (data[4] !== ERROR_UNKNOWN_COMMAND) {
        throw new ProtocolError(
            `código de error desconocido: 0x${(data[4] ?? 0).toString(16)}`,
            data,
        );
    }
    return data[3] ?? 0;
}

/** Decodifica EraseFlash. */
export function parseEraseFlashResponse(data: Uint8Array): Result {
    if (getMessageType(data) !== Command.EraseFlash) {
        throw new ProtocolError('se esperaba EraseFlash', data);
    }
    return readUint8(data, 1, 'EraseFlash');
}

/** Decodifica ProgramFlash: [checksum, bytesEscritos]. */
export function parseProgramFlashResponse(data: Uint8Array): [number, number] {
    if (getMessageType(data) !== Command.ProgramFlash) {
        throw new ProtocolError('se esperaba ProgramFlash', data);
    }
    return [readUint8(data, 1, 'ProgramFlash'), readUint32LE(data, 2, 'ProgramFlash')];
}

/** Decodifica InitLoader. */
export function parseInitLoaderResponse(data: Uint8Array): Result {
    if (getMessageType(data) !== Command.InitLoader) {
        throw new ProtocolError('se esperaba InitLoader', data);
    }
    return readUint8(data, 1, 'InitLoader');
}

/** Decodifica GetInfo. */
export function parseGetInfoResponse(data: Uint8Array): BootloaderInfo {
    if (getMessageType(data) !== Command.GetInfo) {
        throw new ProtocolError('se esperaba GetInfo', data);
    }
    return {
        version: readUint32LE(data, 1, 'GetInfo'),
        startAddress: readUint32LE(data, 5, 'GetInfo'),
        endAddress: readUint32LE(data, 9, 'GetInfo'),
        hubType: readUint8(data, 13, 'GetInfo'),
    };
}

/** Decodifica GetChecksum. */
export function parseGetChecksumResponse(data: Uint8Array): number {
    if (getMessageType(data) !== Command.GetChecksum) {
        throw new ProtocolError('se esperaba GetChecksum', data);
    }
    return readUint8(data, 1, 'GetChecksum');
}

/** Decodifica GetFlashState. */
export function parseGetFlashStateResponse(data: Uint8Array): ProtectionLevel {
    if (getMessageType(data) !== Command.GetFlashState) {
        throw new ProtocolError('se esperaba GetFlashState', data);
    }
    return readUint8(data, 1, 'GetFlashState');
}

/** Actualiza el checksum acumulado del flasheo. */
export function updateXor8(checksum: number, payload: Uint8Array): number {
    return xor8(payload, checksum);
}

/** Respuesta decodificada del bootloader. */
export type BootloaderResponse =
    | { readonly type: 'erase'; readonly result: Result }
    | { readonly type: 'program'; readonly checksum: number; readonly count: number }
    | { readonly type: 'init'; readonly result: Result }
    | { readonly type: 'info'; readonly info: BootloaderInfo }
    | { readonly type: 'checksum'; readonly checksum: number }
    | { readonly type: 'flashState'; readonly level: ProtectionLevel }
    | { readonly type: 'error'; readonly command: Command };

/** Decodifica cualquier respuesta conocida. */
export function decodeBootloaderResponse(data: Uint8Array): BootloaderResponse {
    // 0x05 no es un comando: es el bytecode de error del bootloader.
    if (data[0] === ERROR_BYTECODE) {
        return { type: 'error', command: parseErrorResponse(data) };
    }

    const type = getMessageType(data);
    switch (type) {
        case Command.EraseFlash:
            return { type: 'erase', result: parseEraseFlashResponse(data) };
        case Command.ProgramFlash: {
            const [checksum, count] = parseProgramFlashResponse(data);
            return { type: 'program', checksum, count };
        }
        case Command.InitLoader:
            return { type: 'init', result: parseInitLoaderResponse(data) };
        case Command.GetInfo:
            return { type: 'info', info: parseGetInfoResponse(data) };
        case Command.GetChecksum:
            return { type: 'checksum', checksum: parseGetChecksumResponse(data) };
        case Command.GetFlashState:
            return { type: 'flashState', level: parseGetFlashStateResponse(data) };
        default:
            throw new ProtocolError(
                `respuesta de bootloader desconocida: 0x${type.toString(16)}`,
                data,
            );
    }
}
