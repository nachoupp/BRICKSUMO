/* eslint-disable @typescript-eslint/require-await -- doble de prueba síncrono */
import {
    Command,
    HubType,
    Result,
    createGetInfoRequest,
    getMessageType,
    maxProgramFlashSize,
    parseGetInfoResponse,
    updateXor8,
    type BootloaderInfo,
} from '../protocol/lwp3-bootloader.js';
import { readUint32LE } from '../protocol/bytes.js';
import { ProtocolError, TransportError } from '../protocol/errors.js';
import { NotificationQueue } from './notification-queue.js';
import type { BootloaderLink } from './types.js';

/** Opciones del bootloader falso. */
export interface FakeBootloaderOptions {
    readonly hubType?: HubType;
    readonly version?: number;
    readonly startAddress?: number;
    readonly endAddress?: number;
    readonly eraseDelayMs?: number;
    readonly eraseResult?: Result;
    readonly initResult?: Result;
    readonly checksumMismatch?: boolean;
    readonly finalCountMismatch?: boolean;
    readonly noFinalResponse?: boolean;
    readonly maxPayload?: number;
}

const DEFAULT_START = 0x08008000;
const DEFAULT_END = 0x08108000;

/**
 * Bootloader LWP3 simulado.
 *
 * Implementa el estado real del flasheo: erase, init, program, checksum
 * periódico y respuesta final con count/checksum.
 */
export class FakeBootloaderLink implements BootloaderLink {
    readonly info: BootloaderInfo;
    readonly flash: Uint8Array;
    readonly sentMessages: Uint8Array[] = [];

    erased = false;
    started = false;
    disconnected = false;

    private readonly queue = new NotificationQueue<Uint8Array>();
    private readonly maxPayload: number;
    private readonly options: FakeBootloaderOptions;
    private expectedSize = 0;
    private written = 0;
    private runningChecksum = 0xff;

    constructor(options: FakeBootloaderOptions = {}) {
        this.options = options;
        const hubType = options.hubType ?? HubType.TechnicHub;
        const startAddress = options.startAddress ?? DEFAULT_START;
        const endAddress = options.endAddress ?? DEFAULT_END;
        this.info = {
            version: options.version ?? 1,
            startAddress,
            endAddress,
            hubType,
        };
        this.flash = new Uint8Array(endAddress - startAddress);
        this.flash.fill(0xff);
        this.maxPayload = options.maxPayload ?? maxProgramFlashSize(hubType);
    }

    async getInfo(): Promise<BootloaderInfo> {
        const response = this.waitForMessage(
            (message) => getMessageType(message) === Command.GetInfo,
            1000,
        );
        await this.send(createGetInfoRequest());
        return parseGetInfoResponse(await response);
    }

    async send(
        message: Uint8Array,
        _options?: { readonly withResponse?: boolean },
    ): Promise<void> {
        if (this.disconnected) {
            throw new TransportError('bootloader falso desconectado');
        }

        this.sentMessages.push(message.slice());
        const type = getMessageType(message);

        switch (type) {
            case Command.EraseFlash:
                await this.handleErase();
                return;
            case Command.InitLoader:
                this.handleInit(message);
                return;
            case Command.ProgramFlash:
                this.handleProgram(message);
                return;
            case Command.StartApp:
                this.started = true;
                return;
            case Command.GetInfo:
                this.pushInfo();
                return;
            case Command.GetChecksum:
                this.pushChecksum();
                return;
            case Command.GetFlashState:
                this.queue.push(new Uint8Array([Command.GetFlashState, 0x00]));
                return;
            case Command.Disconnect:
                this.disconnected = true;
                this.queue.close();
                return;
            default:
                this.queue.push(
                    new Uint8Array([0x05, 0x00, 0x05, type & 0xff, 0x05]),
                );
        }
    }

    waitForMessage(
        predicate: (message: Uint8Array) => boolean,
        timeoutMs: number,
    ): Promise<Uint8Array> {
        return this.queue.waitFor(predicate, timeoutMs);
    }

    async disconnect(): Promise<void> {
        this.disconnected = true;
        this.queue.close();
    }

    private async handleErase(): Promise<void> {
        if (this.options.eraseDelayMs !== undefined && this.options.eraseDelayMs > 0) {
            await new Promise((resolve) =>
                setTimeout(resolve, this.options.eraseDelayMs),
            );
        }

        const result = this.options.eraseResult ?? Result.OK;
        if (result === Result.OK) {
            this.flash.fill(0xff);
            this.erased = true;
            this.expectedSize = 0;
            this.written = 0;
            this.runningChecksum = 0xff;
        }
        this.queue.push(new Uint8Array([Command.EraseFlash, result]));
    }

    private handleInit(message: Uint8Array): void {
        const result = this.options.initResult ?? Result.OK;
        if (result !== Result.OK) {
            this.queue.push(new Uint8Array([Command.InitLoader, result]));
            return;
        }

        const size = readUint32LE(message, 1, 'InitLoader');
        if (size > this.flash.byteLength) {
            throw new ProtocolError(
                `InitLoader: firmware de ${size} bytes no cabe en ${this.flash.byteLength}`,
                message,
            );
        }

        this.expectedSize = size;
        this.written = 0;
        this.runningChecksum = 0xff;
        this.queue.push(new Uint8Array([Command.InitLoader, Result.OK]));
    }

    private handleProgram(message: Uint8Array): void {
        if (this.expectedSize === 0) {
            throw new ProtocolError('ProgramFlash sin InitLoader', message);
        }
        if (message.byteLength < 6) {
            throw new ProtocolError('ProgramFlash incompleto', message);
        }

        const declaredLength = message[1] ?? 0;
        const payload = message.subarray(6);
        if (declaredLength !== payload.byteLength + 4) {
            throw new ProtocolError(
                `ProgramFlash: longitud declarada ${declaredLength}, real ` +
                    `${payload.byteLength + 4}`,
                message,
            );
        }
        if (payload.byteLength > this.maxPayload) {
            throw new ProtocolError(
                `ProgramFlash: payload ${payload.byteLength} excede ${this.maxPayload}`,
                message,
            );
        }

        const address = readUint32LE(message, 2, 'ProgramFlash');
        const offset = address - this.info.startAddress;
        if (
            offset < 0 ||
            offset + payload.byteLength > this.flash.byteLength ||
            offset + payload.byteLength > this.expectedSize
        ) {
            throw new ProtocolError(
                `ProgramFlash fuera de rango: address 0x${address.toString(16)}, ` +
                    `payload ${payload.byteLength}`,
                message,
            );
        }

        this.flash.set(payload, offset);
        this.runningChecksum = updateXor8(this.runningChecksum, payload);
        this.written += payload.byteLength;

        if (this.written === this.expectedSize && this.options.noFinalResponse !== true) {
            const checksum = this.options.checksumMismatch
                ? this.runningChecksum ^ 0x01
                : this.runningChecksum;
            const count = this.options.finalCountMismatch
                ? this.written + 1
                : this.written;
            const response = new Uint8Array(6);
            const view = new DataView(response.buffer);
            view.setUint8(0, Command.ProgramFlash);
            view.setUint8(1, checksum);
            view.setUint32(2, count, true);
            this.queue.push(response);
        }
    }

    private pushInfo(): void {
        const response = new Uint8Array(14);
        const view = new DataView(response.buffer);
        view.setUint8(0, Command.GetInfo);
        view.setUint32(1, this.info.version, true);
        view.setUint32(5, this.info.startAddress, true);
        view.setUint32(9, this.info.endAddress, true);
        view.setUint8(13, this.info.hubType);
        this.queue.push(response);
    }

    private pushChecksum(): void {
        const checksum = this.options.checksumMismatch
            ? this.runningChecksum ^ 0x01
            : this.runningChecksum;
        this.queue.push(new Uint8Array([Command.GetChecksum, checksum]));
    }
}
