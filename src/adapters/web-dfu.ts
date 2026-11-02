import { WebDFU, WebDFUType } from 'dfu';
import { TransportError } from '../protocol/errors.js';
import { LEGO_USB_VENDOR_ID, LegoUsbProductId } from '../protocol/usb.js';
import { asTransportError, isErrorNamed, requireUsb } from './browser.js';

/** Hubs con bootloader DFU. Robot Inventor sigue siendo experimental. */
export type DfuHub = 'prime' | 'essential' | 'inventor';

/** Dirección de inicio usada por los hubs de Pybricks. */
export const DFU_START_ADDRESS = 0x08008000;

/** Tamaño de transferencia usado por Pybricks Code. */
export const DFU_TRANSFER_SIZE = 1024;

/** `WebDFUType.SDFUse`, normalizado a número para compararlo con `dfu.type`. */
const DFUSE_TYPE: number = WebDFUType.SDFUse;

const DFU_PRODUCT_IDS: Readonly<Record<DfuHub, LegoUsbProductId>> = {
    prime: LegoUsbProductId.SpikePrimeBootloader,
    essential: LegoUsbProductId.SpikeEssentialBootloader,
    inventor: LegoUsbProductId.MindstormsRobotInventorBootloader,
};

/** Fase del flasheo DFU. */
export type DfuPhase = 'erase' | 'write';

/** Progreso del flasheo DFU. */
export interface DfuProgress {
    readonly phase: DfuPhase;
    readonly bytesSent: number;
    readonly expectedSize: number;
}

/** Opciones del flasheo DFU. */
export interface FlashDfuOptions {
    readonly device: USBDevice;
    readonly image: Uint8Array;
    readonly hub: DfuHub;
    readonly onProgress?: (progress: DfuProgress) => void;
    /** Por defecto `true`, como en Pybricks Code. */
    readonly manifestationTolerant?: boolean;
}

/** Resultado del flasheo DFU. */
export interface FlashDfuResult {
    readonly bytesWritten: number;
    readonly hub: DfuHub;
}

/**
 * Pide al usuario un hub en modo bootloader DFU.
 *
 * Devuelve `null` si el usuario cancela el diálogo.
 */
export async function requestDfuDevice(
    hub: DfuHub,
): Promise<USBDevice | null> {
    const usb = requireUsb();
    const productId = DFU_PRODUCT_IDS[hub];

    try {
        return await usb.requestDevice({
            filters: [{ vendorId: LEGO_USB_VENDOR_ID, productId }],
        });
    } catch (error) {
        if (isErrorNamed(error, 'NotFoundError')) {
            return null;
        }
        throw asTransportError(
            error,
            'No se pudo seleccionar el dispositivo DFU',
        );
    }
}

/**
 * Flashea una imagen completa por DFU/DfuSe.
 *
 * Experimental: no se exporta desde la raíz del paquete. El llamador debe
 * seleccionar el dispositivo con un gesto de usuario y validar antes el tipo
 * de hub.
 */
export async function flashFirmwareDfu(
    options: FlashDfuOptions,
): Promise<FlashDfuResult> {
    const { device, image, hub } = options;

    if (image.byteLength === 0) {
        throw new TransportError('La imagen DFU está vacía');
    }

    const expectedProductId: number = DFU_PRODUCT_IDS[hub];
    if (device.productId !== expectedProductId) {
        throw new TransportError(
            `El dispositivo no es el bootloader esperado para ${hub} ` +
                `(PID 0x${device.productId.toString(16)}, esperado ` +
                `0x${expectedProductId.toString(16)})`,
        );
    }

    const dfu = new WebDFU(
        device,
        { forceInterfacesName: true },
        {
            info: () => {},
            warning: () => {},
            progress: () => {},
        },
    );

    let connected = false;

    try {
        await dfu.init();

        const interfaceIndex = dfu.interfaces.findIndex(
            (candidate) => candidate.alternate.alternateSetting === 0,
        );
        if (interfaceIndex < 0) {
            throw new TransportError(
                'El dispositivo no tiene una interfaz DFU con alt=0',
            );
        }

        await dfu.connect(interfaceIndex);
        connected = true;

        if (dfu.type !== DFUSE_TYPE) {
            throw new TransportError(
                'El dispositivo no expone una interfaz DfuSe compatible',
            );
        }

        dfu.dfuseStartAddress = DFU_START_ADDRESS;

        const buffer = new ArrayBuffer(image.byteLength);
        new Uint8Array(buffer).set(image);

        const process = dfu.write(
            DFU_TRANSFER_SIZE,
            buffer,
            options.manifestationTolerant ?? true,
        );

        await new Promise<void>((resolve, reject) => {
            process.events.on(
                'erase/process',
                (bytesSent: number, expectedSize: number) => {
                    options.onProgress?.({
                        phase: 'erase',
                        bytesSent,
                        expectedSize,
                    });
                },
            );
            process.events.on(
                'write/process',
                (bytesSent: number, expectedSize: number) => {
                    options.onProgress?.({
                        phase: 'write',
                        bytesSent,
                        expectedSize,
                    });
                },
            );
            process.events.on('error', (error: unknown) => {
                reject(asTransportError(error, 'Flasheo DFU'));
            });
            process.events.on('end', () => {
                resolve();
            });
        });

        return { bytesWritten: image.byteLength, hub };
    } catch (error) {
        throw asTransportError(error, 'No se pudo flashear por DFU');
    } finally {
        if (connected) {
            try {
                await dfu.close();
            } catch {
                // El hub puede reiniciarse y desaparecer antes de close().
            }
        }
    }
}
