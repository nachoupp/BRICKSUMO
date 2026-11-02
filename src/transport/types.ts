import type { HubCapabilities } from '../protocol/ble-pybricks.js';
import type { BootloaderInfo } from '../protocol/lwp3-bootloader.js';

/** Origen del transporte. */
export type TransportKind = 'ble' | 'usb' | 'fake';

/** Información de un hub conectado. */
export interface HubInfo {
    readonly name: string;
    /** Versión del firmware, por ejemplo `4.0.0b4`. */
    readonly firmwareVersion: string;
    /** Versión del perfil Pybricks, por ejemplo `1.5.0`. */
    readonly profileVersion: string;
    /** Capacidades; null en perfiles anteriores a 1.2.0. */
    readonly capabilities: HubCapabilities | null;
    readonly kind: TransportKind;
}

/** Cancela una suscripción. */
export type Unsubscribe = () => void;

/**
 * Canal NUS antiguo (perfil <1.4 para descarga, <1.3 para stdio).
 *
 * `writeChunk` divide internamente en escrituras de 20 bytes y el hub
 * responde un checksum al terminar el bloque lógico.
 */
export interface LegacyNusTransport {
    writeChunk(data: Uint8Array): Promise<void>;
    writeRaw(data: Uint8Array): Promise<void>;
    onChecksum(listener: (checksum: number) => void): Unsubscribe;
}

/** Transporte de comandos Pybricks (BLE o USB). */
export interface PybricksTransport {
    readonly info: HubInfo;
    /** Escribe un comando y espera a que el transporte lo acepte. */
    writeCommand(command: Uint8Array): Promise<void>;
    /** Recibe eventos crudos (sin decodificar) del hub. */
    onEvent(listener: (data: Uint8Array) => void): Unsubscribe;
    /** Canal NUS si el hub lo soporta; null en USB o perfiles nuevos. */
    readonly legacyNus: LegacyNusTransport | null;
    disconnect(): Promise<void>;
}

/** Enlace de bajo nivel con el bootloader LWP3. */
export interface BootloaderLink {
    /** Lee la información del bootloader (direcciones, tipo de hub). */
    getInfo(): Promise<BootloaderInfo>;
    /** Envía un mensaje; `withResponse` solo afecta a BLE. */
    send(message: Uint8Array, options?: { readonly withResponse?: boolean }): Promise<void>;
    /** Espera una respuesta que cumpla el predicado, con timeout. */
    waitForMessage(
        predicate: (message: Uint8Array) => boolean,
        timeoutMs: number,
    ): Promise<Uint8Array>;
    disconnect(): Promise<void>;
}
