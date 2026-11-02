import {
    PYBRICKS_CAPABILITIES_UUID,
    parseHubCapabilities,
    type HubCapabilities,
} from '../protocol/ble-pybricks.js';
import { ProtocolError, TransportError } from '../protocol/errors.js';
import { getProfileFeatures } from '../protocol/profile.js';
import {
    PYBRICKS_USB_CLASS,
    PYBRICKS_USB_DEVICE_FILTER,
    PYBRICKS_USB_PROTOCOL,
    PYBRICKS_USB_REQUEST_MAX_LENGTH,
    PYBRICKS_USB_SUBCLASS,
    decodeUsbInMessage,
    encodeUsbCommand,
    encodeUsbSubscribe,
    gattReadSetup,
    pybricksReadSetup,
    uuid16,
    type UsbInMessage,
} from '../protocol/usb.js';
import { NotificationQueue } from '../transport/notification-queue.js';
import type {
    HubInfo,
    PybricksTransport,
    Unsubscribe,
} from '../transport/types.js';
import {
    asTransportError,
    dataViewToBytes,
    decodeText,
    delay,
    isErrorNamed,
    requireUsb,
    toArrayBuffer,
} from './browser.js';

const DEVICE_NAME_UUID = 0x2a00;
const FIRMWARE_REVISION_UUID = 0x2a26;
const SOFTWARE_REVISION_UUID = 0x2a28;

/** Opciones de conexión USB. */
export interface ConnectPybricksUsbOptions {
    /** Timeout de respuesta por comando; por defecto 5000 ms. */
    readonly responseTimeoutMs?: number;
    /** Reintentos de `open()` ante `SecurityError`; por defecto 5. */
    readonly openRetries?: number;
    /** Espera entre reintentos de `open()`; por defecto 100 ms. */
    readonly openRetryDelayMs?: number;
}

/** Pide al usuario un hub con firmware Pybricks por USB. */
export async function requestPybricksUsbDevice(): Promise<USBDevice | null> {
    const usb = requireUsb();
    try {
        return await usb.requestDevice({
            filters: [PYBRICKS_USB_DEVICE_FILTER],
        });
    } catch (error) {
        if (isErrorNamed(error, 'NotFoundError')) {
            return null;
        }
        throw asTransportError(error, 'No se pudo seleccionar el hub USB');
    }
}

interface UsbPybricksInit {
    readonly device: USBDevice;
    readonly interfaceNumber: number;
    readonly inEndpoint: USBEndpoint;
    readonly outEndpoint: USBEndpoint;
    readonly info: HubInfo;
    readonly responseTimeoutMs: number;
}

interface Settled<T> {
    readonly ok: boolean;
    readonly value?: T;
    readonly error?: unknown;
}

function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
    return promise.then(
        (value): Settled<T> => ({ ok: true, value }),
        (error: unknown): Settled<T> => ({ ok: false, error }),
    );
}

async function openDeviceWithRetry(
    device: USBDevice,
    attempts: number,
    delayMs: number,
): Promise<void> {
    for (let attempt = 1; ; attempt++) {
        try {
            await device.open();
            return;
        } catch (error) {
            if (isErrorNamed(error, 'SecurityError') && attempt < attempts) {
                await delay(delayMs);
                continue;
            }
            throw asTransportError(error, 'No se pudo abrir el dispositivo USB');
        }
    }
}

async function readGattString(
    device: USBDevice,
    characteristicUuid16: number,
    label: string,
): Promise<string> {
    try {
        const result = await device.controlTransferIn(
            gattReadSetup(characteristicUuid16),
            PYBRICKS_USB_REQUEST_MAX_LENGTH,
        );
        if (result.status !== 'ok' || result.data === undefined) {
            throw new TransportError(
                `No se pudo leer ${label} por USB (${result.status})`,
            );
        }
        return decodeText(result.data);
    } catch (error) {
        throw asTransportError(error, `No se pudo leer ${label} por USB`);
    }
}

async function readCapabilities(device: USBDevice): Promise<HubCapabilities> {
    const result = await device.controlTransferIn(
        pybricksReadSetup(uuid16(PYBRICKS_CAPABILITIES_UUID)),
        PYBRICKS_USB_REQUEST_MAX_LENGTH,
    );
    if (result.status !== 'ok' || result.data === undefined) {
        throw new TransportError(
            `No se pudieron leer las capacidades por USB (${result.status})`,
        );
    }
    return parseHubCapabilities(dataViewToBytes(result.data));
}

/**
 * Transporte WebUSB para el perfil Pybricks.
 *
 * Experimental: no se exporta desde la raíz del paquete.
 */
export class UsbPybricksTransport implements PybricksTransport {
    readonly info: HubInfo;
    readonly legacyNus = null;

    private readonly device: USBDevice;
    private readonly interfaceNumber: number;
    private readonly inEndpoint: USBEndpoint;
    private readonly outEndpoint: USBEndpoint;
    private readonly responseTimeoutMs: number;
    private readonly queue = new NotificationQueue<UsbInMessage>();
    private readonly eventListeners = new Set<(data: Uint8Array) => void>();
    private operation: Promise<void> = Promise.resolve();
    private connected = true;
    private closed = false;

    private constructor(init: UsbPybricksInit) {
        this.device = init.device;
        this.interfaceNumber = init.interfaceNumber;
        this.inEndpoint = init.inEndpoint;
        this.outEndpoint = init.outEndpoint;
        this.info = init.info;
        this.responseTimeoutMs = init.responseTimeoutMs;
        void this.receiveLoop();
    }

    /** Abre y prepara un dispositivo USB ya seleccionado. */
    static async connect(
        device: USBDevice,
        options: ConnectPybricksUsbOptions = {},
    ): Promise<UsbPybricksTransport> {
        const responseTimeoutMs = options.responseTimeoutMs ?? 5000;
        await openDeviceWithRetry(
            device,
            options.openRetries ?? 5,
            options.openRetryDelayMs ?? 100,
        );

        let transport: UsbPybricksTransport | undefined;
        let interfaceNumber: number | undefined;

        try {
            const configurationValue =
                device.configurations[0]?.configurationValue ?? 1;
            await device.selectConfiguration(configurationValue);

            const configuration = device.configuration;
            if (configuration === null) {
                throw new TransportError(
                    'El dispositivo USB no tiene una configuración activa',
                );
            }

            const usbInterface = configuration.interfaces.find(
                (candidate) =>
                    candidate.alternate.interfaceClass === PYBRICKS_USB_CLASS &&
                    candidate.alternate.interfaceSubclass ===
                        PYBRICKS_USB_SUBCLASS &&
                    candidate.alternate.interfaceProtocol ===
                        PYBRICKS_USB_PROTOCOL,
            );
            if (usbInterface === undefined) {
                throw new TransportError(
                    'El dispositivo USB no tiene una interfaz Pybricks',
                );
            }
            interfaceNumber = usbInterface.interfaceNumber;

            const inEndpoint = usbInterface.alternate.endpoints.find(
                (endpoint) =>
                    endpoint.direction === 'in' && endpoint.type === 'bulk',
            );
            const outEndpoint = usbInterface.alternate.endpoints.find(
                (endpoint) =>
                    endpoint.direction === 'out' && endpoint.type === 'bulk',
            );
            if (inEndpoint === undefined || outEndpoint === undefined) {
                throw new TransportError(
                    'La interfaz Pybricks no tiene endpoints bulk IN/OUT',
                );
            }

            await device.claimInterface(interfaceNumber);

            const firmwareVersion = await readGattString(
                device,
                FIRMWARE_REVISION_UUID,
                'la versión de firmware',
            );
            const profileVersion = await readGattString(
                device,
                SOFTWARE_REVISION_UUID,
                'la versión de perfil',
            );
            const features = getProfileFeatures(profileVersion);

            const name = await readGattString(
                device,
                DEVICE_NAME_UUID,
                'el nombre',
            ).catch(() => device.productName ?? 'Pybricks Hub');

            const capabilities = features.hasCapabilities
                ? await readCapabilities(device)
                : null;

            transport = new UsbPybricksTransport({
                device,
                interfaceNumber,
                inEndpoint,
                outEndpoint,
                responseTimeoutMs,
                info: {
                    name: name.trim() || 'Pybricks Hub',
                    firmwareVersion,
                    profileVersion,
                    capabilities,
                    kind: 'usb',
                },
            });

            await transport.subscribe();
            return transport;
        } catch (error) {
            if (transport !== undefined) {
                await transport.disconnect();
            } else {
                if (interfaceNumber !== undefined) {
                    try {
                        await device.releaseInterface(interfaceNumber);
                    } catch {
                        // La interfaz no llegó a reclamarse.
                    }
                }
                try {
                    await device.close();
                } catch {
                    // El dispositivo ya estaba cerrado.
                }
            }

            if (error instanceof ProtocolError) {
                throw error;
            }
            throw asTransportError(error, 'No se pudo conectar por USB');
        }
    }

    writeCommand(command: Uint8Array): Promise<void> {
        const next = this.operation.then(
            () => this.writeCommandNow(command),
            () => this.writeCommandNow(command),
        );
        this.operation = next.then(
            () => undefined,
            () => undefined,
        );
        return next;
    }

    onEvent(listener: (data: Uint8Array) => void): Unsubscribe {
        this.eventListeners.add(listener);
        return () => {
            this.eventListeners.delete(listener);
        };
    }

    async disconnect(): Promise<void> {
        if (this.closed) {
            return;
        }
        this.closed = true;
        this.connected = false;
        this.queue.close();

        if (!this.device.opened) {
            return;
        }

        try {
            await this.device.transferOut(
                this.outEndpoint.endpointNumber,
                toArrayBuffer(encodeUsbSubscribe(false)),
            );
        } catch {
            // El dispositivo pudo desconectarse antes de desuscribirse.
        }

        try {
            await this.device.releaseInterface(this.interfaceNumber);
        } catch {
            // La interfaz ya estaba liberada.
        }
        try {
            await this.device.close();
        } catch {
            // El dispositivo ya estaba cerrado.
        }
    }

    private async subscribe(): Promise<void> {
        const result = await this.device.transferOut(
            this.outEndpoint.endpointNumber,
            toArrayBuffer(encodeUsbSubscribe(true)),
        );
        if (result.status !== 'ok') {
            throw new TransportError(
                `No se pudo suscribir a los eventos USB (${result.status})`,
            );
        }
    }

    private async writeCommandNow(command: Uint8Array): Promise<void> {
        this.assertConnected();

        const wait = settle(
            this.queue.waitFor(
                (message) => message.type === 'response',
                this.responseTimeoutMs,
            ),
        );

        try {
            const result = await this.device.transferOut(
                this.outEndpoint.endpointNumber,
                toArrayBuffer(encodeUsbCommand(command)),
            );
            if (result.status !== 'ok') {
                throw new TransportError(
                    `No se pudo escribir el comando USB (${result.status})`,
                );
            }

            const response = await wait;
            if (!response.ok) {
                throw response.error;
            }
            if (response.value === undefined) {
                throw new TransportError(
                    'El hub USB no devolvió una respuesta',
                );
            }
            if (response.value.type !== 'response') {
                throw new ProtocolError(
                    'Se esperaba una respuesta USB y llegó otro mensaje',
                );
            }
            if (response.value.statusCode !== 0) {
                throw new TransportError(
                    `El hub rechazó el comando USB con estado ` +
                        `${response.value.statusCode}`,
                );
            }
        } catch (error) {
            // La espera puede seguir pendiente si transferOut falló. Adjuntar
            // un manejador evita un rechazo no manejado cuando expire.
            void wait;
            throw asTransportError(error, 'No se pudo enviar el comando USB');
        }
    }

    private async receiveLoop(): Promise<void> {
        while (this.connected) {
            let result: USBInTransferResult;
            try {
                result = await this.device.transferIn(
                    this.inEndpoint.endpointNumber,
                    this.inEndpoint.packetSize,
                );
            } catch (error) {
                if (this.connected) {
                    this.fail(
                        asTransportError(error, 'Se perdió la conexión USB'),
                    );
                }
                return;
            }

            if (!this.connected) {
                return;
            }

            if (result.status === 'stall') {
                try {
                    await this.device.clearHalt(
                        'in',
                        this.inEndpoint.endpointNumber,
                    );
                } catch {
                    // Si no se puede limpiar el halt, el bucle terminará en
                    // la siguiente transferencia.
                }
                continue;
            }

            if (result.status !== 'ok' || result.data === undefined) {
                continue;
            }
            if (result.data.byteLength === 0) {
                continue;
            }

            let message: UsbInMessage;
            try {
                message = decodeUsbInMessage(dataViewToBytes(result.data));
            } catch (error) {
                this.fail(asTransportError(error, 'Mensaje USB inválido'));
                return;
            }

            if (message.type === 'event') {
                for (const listener of this.eventListeners) {
                    listener(message.data.slice());
                }
            } else if (message.type === 'response') {
                this.queue.push(message);
            }
        }
    }

    private fail(error: Error): void {
        this.connected = false;
        this.queue.close(error);
        this.eventListeners.clear();
    }

    private assertConnected(): void {
        if (!this.connected) {
            throw new TransportError('El hub USB está desconectado');
        }
    }
}
