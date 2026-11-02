import { TransportError } from '../protocol/errors.js';

/** Devuelve Web Bluetooth o lanza un error claro. */
export function requireBluetooth(): Bluetooth {
    if (typeof navigator === 'undefined' || navigator.bluetooth === undefined) {
        throw new TransportError(
            'Web Bluetooth no está disponible en este navegador',
        );
    }
    return navigator.bluetooth;
}

/** Devuelve WebUSB o lanza un error claro. */
export function requireUsb(): USB {
    if (typeof navigator === 'undefined' || navigator.usb === undefined) {
        throw new TransportError('WebUSB no está disponible en este navegador');
    }
    return navigator.usb;
}

/** Indica si un error tiene un nombre concreto (por ejemplo `NotFoundError`). */
export function isErrorNamed(error: unknown, name: string): boolean {
    return error instanceof Error && error.name === name;
}

/** Extrae un mensaje legible de un error desconocido. */
export function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/** Normaliza un error de navegador a `TransportError`. */
export function asTransportError(error: unknown, context: string): TransportError {
    if (error instanceof TransportError) {
        return error;
    }
    return new TransportError(`${context}: ${errorMessage(error)}`, { cause: error });
}

/** Copia el contenido de un `DataView` sin compartir memoria. */
export function dataViewToBytes(value: DataView): Uint8Array {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength).slice();
}

/**
 * Copia a un `ArrayBuffer` propio.
 *
 * Web Bluetooth y WebUSB tipan sus entradas como `BufferSource` sobre
 * `ArrayBuffer`; un `Uint8Array` genérico puede estar respaldado por
 * `SharedArrayBuffer`, así que se copia antes de entregarlo.
 */
export function toArrayBuffer(data: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(data.byteLength);
    new Uint8Array(buffer).set(data);
    return buffer;
}

/** Decodifica texto UTF-8 y elimina terminadores NUL y espacios exteriores. */
export function decodeText(value: DataView): string {
    return new TextDecoder().decode(dataViewToBytes(value)).replace(/\0+$/u, '').trim();
}

/** Espera asíncrona para los workarounds de conexión. */
export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

/** Obtiene un servicio GATT con un error de contexto. */
export async function getGattService(
    server: BluetoothRemoteGATTServer,
    uuid: BluetoothServiceUUID,
    label: string,
): Promise<BluetoothRemoteGATTService> {
    try {
        return await server.getPrimaryService(uuid);
    } catch (error) {
        throw asTransportError(error, `No se encontró el servicio ${label}`);
    }
}

/** Obtiene una característica GATT con un error de contexto. */
export async function getGattCharacteristic(
    service: BluetoothRemoteGATTService,
    uuid: BluetoothCharacteristicUUID,
    label: string,
): Promise<BluetoothRemoteGATTCharacteristic> {
    try {
        return await service.getCharacteristic(uuid);
    } catch (error) {
        throw asTransportError(error, `No se encontró la característica ${label}`);
    }
}

/** Lee una característica GATT con un error de contexto. */
export async function readGattValue(
    characteristic: BluetoothRemoteGATTCharacteristic,
    label: string,
): Promise<DataView> {
    try {
        return await characteristic.readValue();
    } catch (error) {
        throw asTransportError(error, `No se pudo leer ${label}`);
    }
}
