import {
    Command,
    HubType,
    Result,
    createEraseFlashRequest,
    createGetChecksumRequest,
    createInitLoaderRequest,
    createProgramFlashRequest,
    createStartAppRequest,
    getMessageType,
    maxProgramFlashSize,
    parseEraseFlashResponse,
    parseGetChecksumResponse,
    parseInitLoaderResponse,
    parseProgramFlashResponse,
    updateXor8,
} from '../protocol/lwp3-bootloader.js';
import {
    ChecksumMismatchError,
    HubTypeMismatchError,
    ProtocolError,
    TimeoutError,
} from '../protocol/errors.js';
import type { BootloaderLink } from '../transport/types.js';

/** Fase del flasheo. */
export type FlashPhase = 'erase' | 'init' | 'flash' | 'start';

/** Progreso del flasheo. */
export interface FlashProgress {
    readonly phase: FlashPhase;
    readonly bytesWritten: number;
    readonly totalBytes: number;
}

/** Opciones del flasheo BLE. */
export interface FlashFirmwareOptions {
    readonly link: BootloaderLink;
    readonly image: Uint8Array;
    readonly expectedHubType?: HubType;
    readonly onProgress?: (progress: FlashProgress) => void;
    readonly eraseTimeoutMs?: number;
    readonly responseTimeoutMs?: number;
    /**
     * Algunos hubs no responden a EraseFlash. Sólo activar tras validar el
     * comportamiento en hardware real.
     */
    readonly continueOnEraseTimeout?: boolean;
    /** Cada cuántos paquetes se pide checksum. Por defecto 8. */
    readonly checksumInterval?: number;
}

/** Resultado del flasheo. */
export interface FlashFirmwareResult {
    readonly bytesWritten: number;
    readonly checksum: number;
    readonly hubType: HubType;
}

function isMessage(type: Command): (message: Uint8Array) => boolean {
    return (message) => getMessageType(message) === type;
}

type Settled<T> = { readonly ok: true; readonly value: T } | {
    readonly ok: false;
    readonly error: unknown;
};

/**
 * Adjunta el manejador de rechazo de inmediato. Sin esto, un timeout que
 * ocurre mientras aún se está escribiendo el comando queda como rechazo no
 * manejado antes de que lleguemos a `await`.
 */
function settle<T>(promise: Promise<T>): Promise<Settled<T>> {
    return promise.then(
        (value): Settled<T> => ({ ok: true, value }),
        (error: unknown): Settled<T> => ({ ok: false, error }),
    );
}

/**
 * Flashea una imagen completa por el bootloader LWP3.
 *
 * Requisitos de seguridad:
 * - valida el tipo de hub antes de borrar;
 * - valida cada checksum periódico y el final;
 * - no tolera timeouts de erase salvo opción explícita;
 * - no inicia la app si el count o el checksum no coinciden.
 */
export async function flashFirmwareBle(
    options: FlashFirmwareOptions,
): Promise<FlashFirmwareResult> {
    const { link, image } = options;

    if (image.byteLength === 0) {
        throw new ProtocolError('la imagen de firmware está vacía');
    }

    const responseTimeoutMs = options.responseTimeoutMs ?? 5000;
    const eraseTimeoutMs = options.eraseTimeoutMs ?? 5000;
    const checksumInterval = options.checksumInterval ?? 8;
    if (!Number.isInteger(checksumInterval) || checksumInterval <= 0) {
        throw new ProtocolError(`checksumInterval inválido: ${checksumInterval}`);
    }

    const info = await link.getInfo();
    if (
        options.expectedHubType !== undefined &&
        info.hubType !== options.expectedHubType
    ) {
        throw new HubTypeMismatchError(options.expectedHubType, info.hubType);
    }

    const capacity = info.endAddress - info.startAddress;
    if (image.byteLength > capacity) {
        throw new ProtocolError(
            `la imagen (${image.byteLength}) no cabe en la flash del hub (${capacity})`,
            image,
        );
    }

    options.onProgress?.({ phase: 'erase', bytesWritten: 0, totalBytes: image.byteLength });

    const eraseWait = settle(
        link.waitForMessage(isMessage(Command.EraseFlash), eraseTimeoutMs),
    );
    await link.send(createEraseFlashRequest(), {
        withResponse: info.hubType === HubType.CityHub,
    });

    const eraseSettled = await eraseWait;
    if (!eraseSettled.ok) {
        if (
            !(eraseSettled.error instanceof TimeoutError) ||
            !options.continueOnEraseTimeout
        ) {
            throw eraseSettled.error;
        }
        // Sólo se tolera el timeout si el llamador lo pidió explícitamente.
    } else {
        const result = parseEraseFlashResponse(eraseSettled.value);
        if (result !== Result.OK) {
            throw new ProtocolError('el hub rechazó EraseFlash', eraseSettled.value);
        }
    }

    options.onProgress?.({ phase: 'init', bytesWritten: 0, totalBytes: image.byteLength });

    const initWait = settle(
        link.waitForMessage(isMessage(Command.InitLoader), responseTimeoutMs),
    );
    await link.send(createInitLoaderRequest(image.byteLength));
    const initSettled = await initWait;
    if (!initSettled.ok) {
        throw initSettled.error;
    }
    const initResult = parseInitLoaderResponse(initSettled.value);
    if (initResult !== Result.OK) {
        throw new ProtocolError('el hub rechazó InitLoader');
    }

    const maxPayload = maxProgramFlashSize(info.hubType);
    let offset = 0;
    let packetCount = 0;
    let runningChecksum = 0xff;

    while (offset < image.byteLength) {
        packetCount++;
        const payload = image.subarray(offset, offset + maxPayload);
        const isLast = offset + payload.byteLength >= image.byteLength;
        runningChecksum = updateXor8(runningChecksum, payload);

        // La respuesta final puede llegar antes de que termine send(), así que
        // la espera se registra antes de escribir el último paquete.
        const finalWait = isLast
            ? settle(
                  link.waitForMessage(
                      isMessage(Command.ProgramFlash),
                      responseTimeoutMs,
                  ),
              )
            : undefined;

        await link.send(
            createProgramFlashRequest(info.startAddress + offset, payload),
            { withResponse: false },
        );
        offset += payload.byteLength;

        options.onProgress?.({
            phase: 'flash',
            bytesWritten: offset,
            totalBytes: image.byteLength,
        });

        if (!isLast && packetCount % checksumInterval === 0) {
            const checksumWait = settle(
                link.waitForMessage(
                    isMessage(Command.GetChecksum),
                    responseTimeoutMs,
                ),
            );
            await link.send(createGetChecksumRequest());
            const checksumSettled = await checksumWait;
            if (!checksumSettled.ok) {
                throw checksumSettled.error;
            }
            const actual = parseGetChecksumResponse(checksumSettled.value);
            if (actual !== runningChecksum) {
                throw new ChecksumMismatchError(runningChecksum, actual);
            }
        }

        if (finalWait !== undefined) {
            const finalSettled = await finalWait;
            if (!finalSettled.ok) {
                throw finalSettled.error;
            }
            const [actualChecksum, actualCount] = parseProgramFlashResponse(
                finalSettled.value,
            );
            if (actualCount !== image.byteLength) {
                throw new ProtocolError(
                    `el hub escribió ${actualCount} bytes, se esperaban ${image.byteLength}`,
                );
            }
            if (actualChecksum !== runningChecksum) {
                throw new ChecksumMismatchError(runningChecksum, actualChecksum);
            }
        }
    }

    options.onProgress?.({
        phase: 'start',
        bytesWritten: image.byteLength,
        totalBytes: image.byteLength,
    });
    await link.send(createStartAppRequest(), { withResponse: false });

    return {
        bytesWritten: image.byteLength,
        checksum: runningChecksum,
        hubType: info.hubType,
    };
}
