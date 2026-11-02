import { copyBytes, readUint32LE, toDataView } from './bytes.js';
import { ProtocolError } from './errors.js';

/** Vendor ID oficial de LEGO. */
export const LEGO_USB_VENDOR_ID = 0x0694;

/** Product IDs USB de LEGO relevantes. */
export enum LegoUsbProductId {
    RcxIrTower = 0x0001,
    Nxt = 0x0002,
    WedoUsb = 0x0003,
    Ev3 = 0x0005,
    Ev3Bootloader = 0x0006,
    SpikePrimeBootloader = 0x0008,
    SpikePrime = 0x0009,
    SpikeEssentialBootloader = 0x000c,
    SpikeEssential = 0x000d,
    MindstormsRobotInventor = 0x0010,
    MindstormsRobotInventorBootloader = 0x0011,
}

/** Clase USB de un hub con firmware Pybricks. */
export const PYBRICKS_USB_CLASS = 0xff;

/** Subclase USB de un hub con firmware Pybricks. */
export const PYBRICKS_USB_SUBCLASS = 0xc5;

/** Protocolo USB de un hub con firmware Pybricks. */
export const PYBRICKS_USB_PROTOCOL = 0xf5;

/** Longitud máxima de una transferencia de control Pybricks. */
export const PYBRICKS_USB_REQUEST_MAX_LENGTH = 20;

/** bRequest de las transferencias de control Pybricks. */
export enum PybricksUsbInterfaceRequest {
    /** Análogo a leer un atributo GATT. */
    Gatt = 0x01,
    /** Análogo a leer una característica Pybricks. */
    Pybricks = 0x02,
}

/** Mensajes hub → host por el endpoint IN. */
export enum PybricksUsbInEndpointMessageType {
    Response = 1,
    Event = 2,
}

/** Mensajes host → hub por el endpoint OUT. */
export enum PybricksUsbOutEndpointMessageType {
    Subscribe = 1,
    Command = 2,
}

/** Respuesta a un comando USB. */
export interface UsbResponseMessage {
    readonly type: 'response';
    readonly statusCode: number;
}

/** Evento Pybricks recibido por USB. */
export interface UsbEventMessage {
    readonly type: 'event';
    readonly data: Uint8Array;
}

/** Mensaje USB no reconocido. */
export interface UsbUnknownMessage {
    readonly type: 'unknown';
    readonly raw: Uint8Array;
}

export type UsbInMessage = UsbResponseMessage | UsbEventMessage | UsbUnknownMessage;

/** Extrae el alias de 16 bits usado por Pybricks en transferencias de control. */
export function uuid16(uuid: string): number {
    if (!/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(uuid)) {
        throw new ProtocolError(`UUID de 128 bits no válido: ${uuid}`);
    }
    return parseInt(uuid.slice(4, 8), 16);
}

/** Codifica una escritura de comando Pybricks para el endpoint OUT. */
export function encodeUsbCommand(command: Uint8Array): Uint8Array {
    const message = new Uint8Array(command.byteLength + 1);
    message[0] = PybricksUsbOutEndpointMessageType.Command;
    message.set(command, 1);
    return message;
}

/** Codifica la suscripción/desuscripción de eventos. */
export function encodeUsbSubscribe(enabled: boolean): Uint8Array {
    return new Uint8Array([
        PybricksUsbOutEndpointMessageType.Subscribe,
        enabled ? 0x01 : 0x00,
    ]);
}

/** Decodifica un mensaje del endpoint IN. */
export function decodeUsbInMessage(data: Uint8Array): UsbInMessage {
    if (data.byteLength === 0) {
        return { type: 'unknown', raw: new Uint8Array() };
    }

    const view = toDataView(data);
    const messageType: PybricksUsbInEndpointMessageType = view.getUint8(0);
    switch (messageType) {
        case PybricksUsbInEndpointMessageType.Response:
            if (data.byteLength < 5) {
                throw new ProtocolError(
                    `respuesta USB incompleta: ${data.byteLength} bytes`,
                    data,
                );
            }
            return { type: 'response', statusCode: readUint32LE(data, 1, 'respuesta USB') };
        case PybricksUsbInEndpointMessageType.Event:
            return { type: 'event', data: copyBytes(data.subarray(1)) };
        default:
            return { type: 'unknown', raw: copyBytes(data) };
    }
}

/** Configuración de una transferencia de control de lectura. */
export interface UsbControlReadSetup {
    readonly requestType: 'class';
    readonly recipient: 'interface';
    readonly request: PybricksUsbInterfaceRequest;
    readonly value: number;
    readonly index: number;
}

/** Configuración para leer una característica GATT emulada. */
export function gattReadSetup(characteristicUuid16: number): UsbControlReadSetup {
    return {
        requestType: 'class',
        recipient: 'interface',
        request: PybricksUsbInterfaceRequest.Gatt,
        value: characteristicUuid16,
        index: 0,
    };
}

/** Configuración para leer una característica Pybricks emulada. */
export function pybricksReadSetup(characteristicUuid16: number): UsbControlReadSetup {
    return {
        requestType: 'class',
        recipient: 'interface',
        request: PybricksUsbInterfaceRequest.Pybricks,
        value: characteristicUuid16,
        index: 0,
    };
}

/** Filtro WebUSB para localizar hubs con firmware Pybricks. */
export const PYBRICKS_USB_DEVICE_FILTER = {
    classCode: PYBRICKS_USB_CLASS,
    subclassCode: PYBRICKS_USB_SUBCLASS,
    protocolCode: PYBRICKS_USB_PROTOCOL,
} as const;
