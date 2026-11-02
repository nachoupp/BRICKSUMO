import {
    PYBRICKS_CAPABILITIES_UUID,
    PYBRICKS_CONTROL_EVENT_UUID,
    PYBRICKS_SERVICE_UUID,
    parseHubCapabilities,
    type HubCapabilities,
} from '../protocol/ble-pybricks.js';
import { ProtocolError, TransportError } from '../protocol/errors.js';
import {
    NORDIC_UART_RX_UUID,
    NORDIC_UART_SAFE_WRITE_SIZE,
    NORDIC_UART_SERVICE_UUID,
    NORDIC_UART_TX_UUID,
} from '../protocol/nus.js';
import { getProfileFeatures } from '../protocol/profile.js';
import type {
    HubInfo,
    LegacyNusTransport,
    PybricksTransport,
    Unsubscribe,
} from '../transport/types.js';
import {
    asTransportError,
    dataViewToBytes,
    decodeText,
    delay,
    getGattCharacteristic,
    getGattService,
    isErrorNamed,
    readGattValue,
    requireBluetooth,
    toArrayBuffer,
} from './browser.js';

const DEVICE_INFORMATION_SERVICE_UUID = 0x180a;
const FIRMWARE_REVISION_UUID = 0x2a26;
const SOFTWARE_REVISION_UUID = 0x2a28;
const PNP_ID_UUID = 0x2a50;

/** Identificación PnP leída del hub, si la característica existe. */
export interface PybricksPnpId {
    readonly vendorIdSource: number;
    readonly vendorId: number;
    readonly productId: number;
    readonly productVersion: number;
}

/** Opciones de conexión BLE. */
export interface ConnectPybricksBleOptions {
    /**
     * Pausa tras conectar GATT. Algunos sistemas necesitan que el stack
     * Bluetooth se estabilice antes de leer servicios. Por defecto 1000 ms.
     */
    readonly settleDelayMs?: number;
}

/** Decodifica la característica PnP ID. */
export function parsePnpId(data: DataView): PybricksPnpId | null {
    if (data.byteLength < 7) {
        return null;
    }
    return {
        vendorIdSource: data.getUint8(0),
        vendorId: data.getUint16(1, true),
        productId: data.getUint16(3, true),
        productVersion: data.getUint16(5, true),
    };
}

/**
 * Pide al usuario un hub que anuncie el servicio Pybricks.
 *
 * Devuelve `null` si el usuario cancela el diálogo del navegador. Esta función
 * debe llamarse desde un gesto de usuario (clic).
 */
export async function requestPybricksBleDevice(): Promise<BluetoothDevice | null> {
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
            filters: [{ services: [PYBRICKS_SERVICE_UUID] }],
            optionalServices: [
                PYBRICKS_SERVICE_UUID,
                DEVICE_INFORMATION_SERVICE_UUID,
                NORDIC_UART_SERVICE_UUID,
            ],
        });
    } catch (error) {
        if (isErrorNamed(error, 'NotFoundError')) {
            return null;
        }
        throw asTransportError(error, 'No se pudo seleccionar el hub');
    }
}

interface BlePybricksInit {
    readonly device: BluetoothDevice;
    readonly server: BluetoothRemoteGATTServer;
    readonly control: BluetoothRemoteGATTCharacteristic;
    readonly info: HubInfo;
    readonly pnpId: PybricksPnpId | null;
    readonly legacyNus: BleLegacyNusTransport | null;
}

/**
 * Transporte Web Bluetooth para el perfil Pybricks.
 *
 * Es experimental: no se exporta desde la raíz del paquete y no se considera
 * validado hasta pasar la matriz de `docs/HARDWARE-VALIDATION.md`.
 */
export class BlePybricksTransport implements PybricksTransport {
    readonly info: HubInfo;
    readonly legacyNus: BleLegacyNusTransport | null;
    readonly pnpId: PybricksPnpId | null;

    private readonly device: BluetoothDevice;
    private readonly server: BluetoothRemoteGATTServer;
    private readonly control: BluetoothRemoteGATTCharacteristic;
    private readonly eventListeners = new Set<(data: Uint8Array) => void>();
    private disconnected = false;

    private constructor(init: BlePybricksInit) {
        this.device = init.device;
        this.server = init.server;
        this.control = init.control;
        this.info = init.info;
        this.pnpId = init.pnpId;
        this.legacyNus = init.legacyNus;

        this.control.addEventListener(
            'characteristicvaluechanged',
            this.handleControlValue,
        );
        this.device.addEventListener(
            'gattserverdisconnected',
            this.handleDisconnected,
        );
    }

    /** Conecta y prepara un hub ya seleccionado. */
    static async connect(
        device: BluetoothDevice,
        options: ConnectPybricksBleOptions = {},
    ): Promise<BlePybricksTransport> {
        if (device.gatt === undefined) {
            throw new TransportError('El dispositivo no expone GATT');
        }

        let server: BluetoothRemoteGATTServer;
        try {
            server = await device.gatt.connect();
        } catch (error) {
            throw asTransportError(error, 'No se pudo conectar por BLE');
        }

        const settleDelayMs = options.settleDelayMs ?? 1000;
        if (settleDelayMs > 0) {
            await delay(settleDelayMs);
        }

        try {
            const deviceInfo = await getGattService(
                server,
                DEVICE_INFORMATION_SERVICE_UUID,
                'Device Information',
            );
            const firmwareVersion = decodeText(
                await readGattValue(
                    await getGattCharacteristic(
                        deviceInfo,
                        FIRMWARE_REVISION_UUID,
                        'firmware',
                    ),
                    'la versión de firmware',
                ),
            );
            const profileVersion = decodeText(
                await readGattValue(
                    await getGattCharacteristic(
                        deviceInfo,
                        SOFTWARE_REVISION_UUID,
                        'perfil',
                    ),
                    'la versión de perfil',
                ),
            );

            // Valida el formato antes de habilitar funciones por versión.
            const features = getProfileFeatures(profileVersion);

            let pnpId: PybricksPnpId | null = null;
            try {
                const pnpCharacteristic = await getGattCharacteristic(
                    deviceInfo,
                    PNP_ID_UUID,
                    'PnP ID',
                );
                pnpId = parsePnpId(
                    await readGattValue(pnpCharacteristic, 'el PnP ID'),
                );
            } catch {
                // La característica no existe en firmware antiguo.
                pnpId = null;
            }

            const pybricksService = await getGattService(
                server,
                PYBRICKS_SERVICE_UUID,
                'Pybricks',
            );
            const control = await getGattCharacteristic(
                pybricksService,
                PYBRICKS_CONTROL_EVENT_UUID,
                'control/eventos',
            );

            let capabilities: HubCapabilities | null = null;
            if (features.hasCapabilities) {
                const capabilitiesCharacteristic = await getGattCharacteristic(
                    pybricksService,
                    PYBRICKS_CAPABILITIES_UUID,
                    'capacidades',
                );
                const value = await readGattValue(
                    capabilitiesCharacteristic,
                    'las capacidades',
                );
                capabilities = parseHubCapabilities(dataViewToBytes(value));
            }

            // Algunos sistemas (Chromium/BlueZ) no reciben notificaciones
            // después de reconectar si no se paran antes de volver a empezar.
            try {
                await control.stopNotifications();
            } catch {
                // No estaba notificando: es el estado esperado al conectar.
            }
            await control.startNotifications();

            const legacyNus = features.hasNus
                ? await BleLegacyNusTransport.connect(server)
                : null;

            const info: HubInfo = {
                name: device.name?.trim() || 'Pybricks Hub',
                firmwareVersion,
                profileVersion,
                capabilities,
                kind: 'ble',
            };

            return new BlePybricksTransport({
                device,
                server,
                control,
                info,
                pnpId,
                legacyNus,
            });
        } catch (error) {
            try {
                server.disconnect();
            } catch {
                // La conexión ya estaba cerrada.
            }
            if (error instanceof ProtocolError) {
                throw error;
            }
            throw asTransportError(error, 'No se pudo preparar el hub BLE');
        }
    }

    async writeCommand(command: Uint8Array): Promise<void> {
        this.assertConnected();
        try {
            await this.control.writeValueWithResponse(toArrayBuffer(command));
        } catch (error) {
            throw asTransportError(error, 'No se pudo escribir el comando BLE');
        }
    }

    onEvent(listener: (data: Uint8Array) => void): Unsubscribe {
        this.eventListeners.add(listener);
        return () => {
            this.eventListeners.delete(listener);
        };
    }

    disconnect(): Promise<void> {
        if (this.disconnected) {
            return Promise.resolve();
        }
        this.disconnected = true;
        this.control.removeEventListener(
            'characteristicvaluechanged',
            this.handleControlValue,
        );
        this.device.removeEventListener(
            'gattserverdisconnected',
            this.handleDisconnected,
        );
        this.eventListeners.clear();
        this.legacyNus?.close();
        try {
            this.server.disconnect();
        } catch {
            // Ya estaba desconectado.
        }
        return Promise.resolve();
    }

    private readonly handleControlValue = (): void => {
        const value = this.control.value;
        if (value === undefined) {
            return;
        }
        const bytes = dataViewToBytes(value);
        for (const listener of this.eventListeners) {
            listener(bytes.slice());
        }
    };

    private readonly handleDisconnected = (): void => {
        if (this.disconnected) {
            return;
        }
        this.disconnected = true;
        this.eventListeners.clear();
        this.legacyNus?.close();
    };

    private assertConnected(): void {
        if (this.disconnected || !this.server.connected) {
            throw new TransportError('El hub BLE está desconectado');
        }
    }
}

/**
 * Canal NUS del perfil antiguo.
 *
 * Las notificaciones de un byte se entregan como checksum; todas las
 * notificaciones se entregan además por `onData` para stdout legacy.
 */
export class BleLegacyNusTransport implements LegacyNusTransport {
    private readonly rx: BluetoothRemoteGATTCharacteristic;
    private readonly tx: BluetoothRemoteGATTCharacteristic;
    private readonly checksumListeners = new Set<(checksum: number) => void>();
    private readonly dataListeners = new Set<(data: Uint8Array) => void>();
    private closed = false;

    private constructor(
        rx: BluetoothRemoteGATTCharacteristic,
        tx: BluetoothRemoteGATTCharacteristic,
    ) {
        this.rx = rx;
        this.tx = tx;
        this.tx.addEventListener('characteristicvaluechanged', this.handleValue);
    }

    static async connect(
        server: BluetoothRemoteGATTServer,
    ): Promise<BleLegacyNusTransport> {
        const service = await getGattService(
            server,
            NORDIC_UART_SERVICE_UUID,
            'Nordic UART',
        );
        const rx = await getGattCharacteristic(
            service,
            NORDIC_UART_RX_UUID,
            'NUS RX',
        );
        const tx = await getGattCharacteristic(
            service,
            NORDIC_UART_TX_UUID,
            'NUS TX',
        );
        const transport = new BleLegacyNusTransport(rx, tx);

        try {
            try {
                await tx.stopNotifications();
            } catch {
                // No estaba notificando.
            }
            await tx.startNotifications();
        } catch (error) {
            transport.close();
            throw asTransportError(
                error,
                'No se pudieron activar las notificaciones NUS',
            );
        }

        return transport;
    }

    async writeChunk(data: Uint8Array): Promise<void> {
        await this.writeSlices(data);
    }

    async writeRaw(data: Uint8Array): Promise<void> {
        await this.writeSlices(data);
    }

    onChecksum(listener: (checksum: number) => void): Unsubscribe {
        this.checksumListeners.add(listener);
        return () => {
            this.checksumListeners.delete(listener);
        };
    }

    onData(listener: (data: Uint8Array) => void): Unsubscribe {
        this.dataListeners.add(listener);
        return () => {
            this.dataListeners.delete(listener);
        };
    }

    /** Cierra el canal y deja de escuchar notificaciones. */
    close(): void {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.tx.removeEventListener(
            'characteristicvaluechanged',
            this.handleValue,
        );
        this.checksumListeners.clear();
        this.dataListeners.clear();
    }

    private async writeSlices(data: Uint8Array): Promise<void> {
        if (this.closed) {
            throw new TransportError('El canal NUS está cerrado');
        }
        try {
            for (
                let offset = 0;
                offset < data.byteLength;
                offset += NORDIC_UART_SAFE_WRITE_SIZE
            ) {
                const chunk = data.subarray(
                    offset,
                    offset + NORDIC_UART_SAFE_WRITE_SIZE,
                );
                await this.rx.writeValueWithoutResponse(toArrayBuffer(chunk));
            }
        } catch (error) {
            throw asTransportError(error, 'No se pudo escribir en NUS');
        }
    }

    private readonly handleValue = (): void => {
        const value = this.tx.value;
        if (value === undefined) {
            return;
        }
        const bytes = dataViewToBytes(value);
        if (bytes.byteLength === 0) {
            return;
        }

        for (const listener of this.dataListeners) {
            listener(bytes.slice());
        }

        if (bytes.byteLength === 1) {
            const checksum = bytes[0] ?? 0;
            for (const listener of this.checksumListeners) {
                listener(checksum);
            }
        }
    };
}
