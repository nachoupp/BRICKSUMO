import { ChecksumMismatchError, TimeoutError } from '../protocol/errors.js';
import { planLegacyUpload } from '../protocol/nus.js';
import type { LegacyNusTransport, Unsubscribe } from '../transport/types.js';

/** Opciones de la descarga NUS antigua. */
export interface LegacyUploadOptions {
    readonly chunkSize?: number;
    readonly checksumTimeoutMs?: number;
    readonly onProgress?: (progress: number) => void;
}

interface ChecksumWaiter {
    readonly promise: Promise<number>;
    readonly cancel: () => void;
}

function createChecksumWaiter(
    transport: LegacyNusTransport,
    timeoutMs: number,
): ChecksumWaiter {
    let unsubscribe: Unsubscribe = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;

    const cleanup = (): void => {
        if (timer !== undefined) {
            clearTimeout(timer);
            timer = undefined;
        }
        unsubscribe();
    };

    const promise = new Promise<number>((resolve, reject) => {
        timer = setTimeout(() => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            reject(new TimeoutError(`timeout esperando checksum NUS (${timeoutMs} ms)`));
        }, timeoutMs);

        unsubscribe = transport.onChecksum((checksum) => {
            if (settled) {
                return;
            }
            settled = true;
            cleanup();
            resolve(checksum);
        });
    });

    return {
        promise,
        cancel: () => {
            if (!settled) {
                settled = true;
                cleanup();
            }
        },
    };
}

/**
 * Descarga un programa por el protocolo NUS antiguo.
 *
 * Envía cabecera de tamaño, espera checksum, envía bloques de 100 bytes y
 * valida el checksum de cada bloque. El transporte divide cada bloque en
 * escrituras BLE de 20 bytes.
 */
export async function uploadLegacyProgram(
    transport: LegacyNusTransport,
    program: Uint8Array,
    options: LegacyUploadOptions = {},
): Promise<void> {
    const chunks = planLegacyUpload(program, options.chunkSize);
    const timeoutMs = options.checksumTimeoutMs ?? 1000;
    let sent = 0;

    options.onProgress?.(0);

    for (const chunk of chunks) {
        const waiter = createChecksumWaiter(transport, timeoutMs);

        try {
            await transport.writeChunk(chunk.data);
            const actual = await waiter.promise;
            if (actual !== chunk.expectedChecksum) {
                throw new ChecksumMismatchError(chunk.expectedChecksum, actual);
            }
        } catch (error) {
            waiter.cancel();
            throw error;
        }

        if (chunk.phase === 'payload') {
            sent += chunk.data.byteLength;
            options.onProgress?.(
                program.byteLength === 0 ? 1 : sent / program.byteLength,
            );
        }
    }

    options.onProgress?.(1);
}
