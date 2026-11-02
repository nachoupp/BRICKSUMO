import {
    BuiltinProgramId,
    FileFormat,
    createLegacyStartReplCommand,
    createLegacyStartUserProgramCommand,
    createResetInUpdateModeCommand,
    createStartUserProgramCommand,
    createStopUserProgramCommand,
    createWriteAppDataCommand,
    createWriteStdinCommand,
    createWriteUserProgramMetaCommand,
    createWriteUserRamCommand,
    parseEvent,
    type PybricksEvent,
    type StatusReportEvent,
} from '../protocol/ble-pybricks.js';
import { UnsupportedOperationError } from '../protocol/errors.js';
import { LEGACY_NUS_REPL_COMMAND } from '../protocol/nus.js';
import {
    getProfileFeatures,
    selectFileFormat,
    type ProfileFeatures,
} from '../protocol/profile.js';
import type { HubInfo, PybricksTransport, Unsubscribe } from '../transport/types.js';
import { uploadLegacyProgram, type LegacyUploadOptions } from './legacy-upload.js';

/** Opciones para subir un programa. */
export interface UploadProgramOptions {
    /** Slot 0..127; por defecto 0. */
    readonly slot?: number;
    readonly onProgress?: (progress: number) => void;
}

/** Resultado de una subida. */
export interface UploadProgramResult {
    readonly mode: 'modern' | 'legacy';
    readonly bytes: number;
    readonly slot: number;
}

/** Opciones de la sesión. */
export interface HubSessionOptions {
    readonly onProtocolError?: (error: Error) => void;
    readonly legacyUpload?: LegacyUploadOptions;
}

/** Estado observable de la sesión. */
export interface HubSessionState {
    readonly runningProgramId: number;
    readonly selectedSlot: number;
    readonly statusFlags: number;
}

/**
 * Sesión de alto nivel con un hub Pybricks.
 *
 * No conoce BLE ni USB: sólo usa `PybricksTransport`. Esto permite probar la
 * secuencia completa de descarga con el hub falso y, más adelante, con
 * hardware real sin cambiar la lógica.
 */
export class HubSession {
    readonly info: HubInfo;
    readonly features: ProfileFeatures;
    readonly fileFormat: FileFormat | null;

    private readonly transport: PybricksTransport;
    private readonly listeners = new Set<(event: PybricksEvent) => void>();
    private readonly onProtocolError: ((error: Error) => void) | undefined;
    private readonly legacyUploadOptions: LegacyUploadOptions | undefined;
    private readonly unsubscribeTransport: Unsubscribe;
    private stateValue: HubSessionState = {
        runningProgramId: 0,
        selectedSlot: 0,
        statusFlags: 0,
    };
    private lastErrorValue: Error | null = null;

    constructor(transport: PybricksTransport, options: HubSessionOptions = {}) {
        this.transport = transport;
        this.info = transport.info;
        this.features = getProfileFeatures(transport.info.profileVersion);
        this.fileFormat = selectFileFormat(
            transport.info.profileVersion,
            transport.info.capabilities,
            transport.info.firmwareVersion,
        );
        this.onProtocolError = options.onProtocolError;
        this.legacyUploadOptions = options.legacyUpload;
        this.unsubscribeTransport = transport.onEvent((data) => {
            this.handleEvent(data);
        });
    }

    /** Último estado conocido del hub. */
    get state(): HubSessionState {
        return this.stateValue;
    }

    /** Último error de protocolo observado, si hubo. */
    get lastError(): Error | null {
        return this.lastErrorValue;
    }

    /** Suscribe a eventos ya decodificados. */
    onEvent(listener: (event: PybricksEvent) => void): Unsubscribe {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Descarga un programa y lo inicia.
     *
     * Perfil <1.2: NUS antiguo (el llamador debe aportar un .mpy ya compilado).
     * Perfil >=1.2: WriteUserProgramMeta/Ram + StartUserProgram.
     */
    async uploadProgram(
        program: Uint8Array,
        options: UploadProgramOptions = {},
    ): Promise<UploadProgramResult> {
        if (program.byteLength === 0) {
            throw new UnsupportedOperationError('no se puede subir un programa vacío');
        }

        if (this.features.usesLegacyDownload) {
            const legacy = this.transport.legacyNus;
            if (legacy === null) {
                throw new UnsupportedOperationError(
                    'el hub requiere descarga NUS, pero el transporte no la ofrece',
                );
            }
            await uploadLegacyProgram(legacy, program, {
                ...this.legacyUploadOptions,
                ...(options.onProgress === undefined
                    ? {}
                    : { onProgress: options.onProgress }),
            });
            return { mode: 'legacy', bytes: program.byteLength, slot: 0 };
        }

        if (this.fileFormat !== FileFormat.MultiMpy6) {
            throw new UnsupportedOperationError(
                `formato de programa no soportado: ${this.fileFormat ?? 'ninguno'}`,
            );
        }

        const capabilities = this.info.capabilities;
        if (capabilities === null) {
            throw new UnsupportedOperationError(
                'el hub no publicó capacidades; no se puede calcular el bloque de escritura',
            );
        }

        const chunkSize = capabilities.maxWriteSize - 5;
        if (chunkSize <= 0) {
            throw new UnsupportedOperationError(
                `maxWriteSize inválido para WriteUserRam: ${capabilities.maxWriteSize}`,
            );
        }
        if (program.byteLength > capabilities.maxUserProgramSize) {
            throw new UnsupportedOperationError(
                `el programa (${program.byteLength} bytes) excede el máximo ` +
                    `(${capabilities.maxUserProgramSize})`,
            );
        }

        const slot = options.slot ?? 0;
        if (!Number.isInteger(slot) || slot < 0 || slot > 0x7f) {
            throw new UnsupportedOperationError(`slot inválido: ${slot}`);
        }
        if (capabilities.numSlots > 0 && slot >= capabilities.numSlots) {
            throw new UnsupportedOperationError(
                `slot ${slot} fuera de rango (${capabilities.numSlots} slots)`,
            );
        }

        options.onProgress?.(0);

        // Invalidar cualquier programa anterior antes de escribir.
        await this.transport.writeCommand(createWriteUserProgramMetaCommand(0));

        for (let offset = 0; offset < program.byteLength; offset += chunkSize) {
            const chunk = program.subarray(offset, offset + chunkSize);
            await this.transport.writeCommand(createWriteUserRamCommand(offset, chunk));
            options.onProgress?.(offset / program.byteLength);
        }

        await this.transport.writeCommand(
            createWriteUserProgramMetaCommand(program.byteLength),
        );
        options.onProgress?.(1);
        await this.startProgram(slot);

        return { mode: 'modern', bytes: program.byteLength, slot };
    }

    /** Inicia el programa de un slot. */
    async startProgram(slot = 0): Promise<void> {
        if (this.features.usesLegacyStart) {
            await this.transport.writeCommand(createLegacyStartUserProgramCommand());
            return;
        }
        await this.transport.writeCommand(createStartUserProgramCommand(slot));
    }

    /** Detiene el programa de usuario. */
    async stopProgram(): Promise<void> {
        await this.transport.writeCommand(createStopUserProgramCommand());
    }

    /** Inicia un programa incorporado (REPL, PortView, IMUCalibration). */
    async startBuiltinProgram(programId: BuiltinProgramId): Promise<void> {
        if (!this.features.hasStartProgramId) {
            if (programId === BuiltinProgramId.REPL) {
                await this.startRepl();
                return;
            }
            throw new UnsupportedOperationError(
                `el perfil ${this.info.profileVersion} no soporta programas incorporados`,
            );
        }
        await this.transport.writeCommand(createStartUserProgramCommand(programId));
    }

    /** Inicia el REPL, usando la ruta adecuada según el perfil. */
    async startRepl(): Promise<void> {
        if (this.features.usesLegacyDownload) {
            const legacy = this.transport.legacyNus;
            if (legacy === null) {
                throw new UnsupportedOperationError('el hub requiere NUS para el REPL');
            }
            await legacy.writeRaw(LEGACY_NUS_REPL_COMMAND);
            return;
        }

        if (this.features.usesLegacyStart) {
            await this.transport.writeCommand(createLegacyStartReplCommand());
            return;
        }

        await this.transport.writeCommand(
            createStartUserProgramCommand(BuiltinProgramId.REPL),
        );
    }

    /** Envía datos a stdin. */
    async writeStdin(data: Uint8Array): Promise<void> {
        if (this.features.hasStdin) {
            await this.transport.writeCommand(createWriteStdinCommand(data));
            return;
        }

        const legacy = this.transport.legacyNus;
        if (legacy === null) {
            throw new UnsupportedOperationError(
                `el perfil ${this.info.profileVersion} no soporta stdin`,
            );
        }
        await legacy.writeRaw(data);
    }

    /** Escribe datos en el buffer de la aplicación del usuario. */
    async writeAppData(offset: number, data: Uint8Array): Promise<void> {
        if (!this.features.hasAppData) {
            throw new UnsupportedOperationError(
                `el perfil ${this.info.profileVersion} no soporta AppData`,
            );
        }
        await this.transport.writeCommand(createWriteAppDataCommand(offset, data));
    }

    /** Pide al hub reiniciar en modo actualización. */
    async resetInUpdateMode(): Promise<void> {
        await this.transport.writeCommand(createResetInUpdateModeCommand());
    }

    /** Cierra la sesión y el transporte. */
    async disconnect(): Promise<void> {
        this.unsubscribeTransport();
        this.listeners.clear();
        await this.transport.disconnect();
    }

    private handleEvent(data: Uint8Array): void {
        try {
            const event = parseEvent(data);
            if (event.type === 'status') {
                this.updateStatus(event);
            }
            for (const listener of this.listeners) {
                listener(event);
            }
        } catch (error) {
            const normalized =
                error instanceof Error ? error : new Error(String(error));
            this.lastErrorValue = normalized;
            this.onProtocolError?.(normalized);
        }
    }

    private updateStatus(event: StatusReportEvent): void {
        this.stateValue = {
            runningProgramId: event.runningProgramId,
            selectedSlot: event.selectedSlot,
            statusFlags: event.flags,
        };
    }
}
