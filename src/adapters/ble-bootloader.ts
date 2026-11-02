import { TransportError } from '../protocol/errors.js';
import {
    LWP3_BOOTLOADER_CHARACTERISTIC_UUID,
    LWP3_BOOTLOADER_SERVICE_UUID,
    createGetInfoRequest,
    getMessageType,
    parseGetInfoResponse,
    type BootloaderInfo,
    Command,
} from '../protocol/lwp3-bootloader.js';
import { NotificationQueue } from '../transport/notification-queue.js';
import type { BootloaderLink } from '../transport/types.js';
import {
    asTransportError,
    dataViewToBytes,
    delay,
    getGattCharacteristic,
    getGattService,
    isErrorNamed,
    requireBluetooth,
    toArrayBuffer,
} from './browser.js';

/** Opciones de conexión al bootloader LWP3 por BLE. */
export interface ConnectLwp3BootloaderOptions {
    /** Pausa tras conectar GATT; por defecto 1000 ms. */
    readonly settleDelayMs?: number;
    /** Timeout de `getInfo`; por defecto 5000 ms. */
    readonly responseTimeoutMs?: number;
}

/** Pide al usuario un hub en modo bootloader LWP3. */
export async function requestLwp3BootloaderDevice(): Promise<BluetoothDevice | null> {
    const bluetooth = requireBluetooth();

    try {
        const available = await bluetooth.getAvailability();
        if (!available) {
            throw new TransportError(
                'Bluetooth no está disponible o está desactivado',
            );
        }
    } catch (error) {
        if (error instanceof TransportError) {
            throw error;
        }
        throw asTransportError(error, 'No se pudo comprobar Bluetooth');
    }

    try {
        return await bluetooth.requestDevice({
            filters: [{ services: [LWP3_BOOTLOADER_SERVICE_UUID] }],
            optionalServices: [LWP3_BOOTLOADER_SERVICE_UUID],
        });
    } catch (error) {
        if (isErrorNamed(error, 'NotFoundError')) {
            return null;
        }
        throw asTransportError(
            error,
            'No se pudo seleccionar el hub en modo bootloader',
        );
    }
}

interface BleBootloaderInit {
    readonly device: BluetoothDevice;
    readonly server: BluetoothRemoteGATTServer;
    readonly characteristic: BluetoothRemoteGATTCharacteristic;
    readonly responseTimeoutMs: number;
}

/**
 * Enlace BLE con el bootloader LWP3.
 *
 * Experimental: no se exporta desde la raíz del paquete.
 */
export class BleBootloaderLink implements BootloaderLink {
    private readonly device: BluetoothDevice;
    private readonly server: BluetoothRemoteGATTServer;
    private readonly characteristic: BluetoothRemoteGATTCharacteristic;
    private readonly responseTimeoutMs: number;
    private readonly queue = new NotificationQueue<Uint8Array>();
    private disconnected = false;

    private constructor(init: BleBootloaderInit) {
        this.device = init.device;
        this.server = init.server;
        this.characteristic = init.characteristic;
        this.responseTimeoutMs = init.responseTimeoutMs;

        this.characteristic.addEventListener(
            'characteristicvaluechanged',
            this.handleValue,
        );
        this.device.addEventListener(
            'gattserverdisconnected',
            this.handleDisconnected,
        );
    }

    /** Conecta con un dispositivo ya seleccionado. */
    static async connect(
        device: BluetoothDevice,
        options: ConnectLwp3BootloaderOptions = {},
    ): Promise<BleBootloaderLink> {
        if (device.gatt === undefined) {
            throw new TransportError('El dispositivo no expone GATT');
        }

        let server: BluetoothRemoteGATTServer;
        try {
            server = await device.gatt.connect();
        } catch (error) {
            throw asTransportError(
                error,
                'No se pudo conectar con el bootloader',
            );
        }

        const settleDelayMs = options.settleDelayMs ?? 1000;
        if (settleDelayMs > 0) {
            await delay(settleDelayMs);
        }

        try {
            const service = await getGattService(
                server,
                LWP3_BOOTLOADER_SERVICE_UUID,
                'LWP3 Bootloader',
            );
            const characteristic = await getGattCharacteristic(
                service,
                LWP3_BOOTLOADER_CHARACTERISTIC_UUID,
                'LWP3 Bootloader',
            );

            try {
                await characteristic.stopNotifications();
            } catch {
                // No estaba notificando.
            }
            await characteristic.startNotifications();

            return new BleBootloaderLink({
                device,
                server,
                characteristic,
                responseTimeoutMs: options.responseTimeoutMs ?? 5000,
            });
        } catch (error) {
            try {
                server.disconnect();
            } catch {
                // La conexión ya estaba cerrada.
            }
            throw asTransportError(
                error,
                'No se pudo preparar el bootloader BLE',
            );
        }
    }

    async getInfo(): Promise<BootloaderInfo> {
        const wait = this.waitForMessage(
            (message) => getMessageType(message) === Command.GetInfo,
            this.responseTimeoutMs,
        );
        await this.send(createGetInfoRequest());
        return parseGetInfoResponse(await wait);
    }

    async send(
        message: Uint8Array,
        options: { readonly withResponse?: boolean } = {},
    ): Promise<void> {
        this.assertConnected();
        try {
            if (
                options.withResponse === true ||
                !this.characteristic.properties.writeWithoutResponse
            ) {
                await this.characteristic.writeValueWithResponse(
                    toArrayBuffer(message),
                );
            } else {
                await this.characteristic.writeValueWithoutResponse(
                    toArrayBuffer(message),
                );
            }
        } catch (error) {
            throw asTransportError(
                error,
                'No se pudo enviar el mensaje al bootloader',
            );
        }
    }

    waitForMessage(
        predicate: (message: Uint8Array) => boolean,
        timeoutMs: number,
    ): Promise<Uint8Array> {
        return this.queue.waitFor(predicate, timeoutMs);
    }

    disconnect(): Promise<void> {
        if (this.disconnected) {
            return Promise.resolve();
        }
        this.disconnected = true;
        this.characteristic.removeEventListener(
            'characteristicvaluechanged',
            this.handleValue,
        );
        this.device.removeEventListener(
            'gattserverdisconnected',
            this.handleDisconnected,
        );
        this.queue.close();
        try {
            this.server.disconnect();
        } catch {
            // Ya estaba desconectado.
        }
        return Promise.resolve();
    }

    private readonly handleValue = (): void => {
        const value = this.characteristic.value;
        if (value === undefined) {
            return;
        }
        this.queue.push(dataViewToBytes(value));
    };

    private readonly handleDisconnected = (): void => {
        if (this.disconnected) {
            return;
        }
        this.disconnected = true;
        this.queue.close(
            new TransportError('El bootloader BLE se desconectó'),
        );
    };

    private assertConnected(): void {
        if (this.disconnected || !this.server.connected) {
            throw new TransportError('El bootloader BLE está desconectado');
        }
    }
}
