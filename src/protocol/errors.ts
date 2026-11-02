/**
 * Error de protocolo: los bytes recibidos o enviados no cumplen el formato
 * esperado. Nunca se debe continuar una operación de escritura/flasheo tras
 * este error.
 */
export class ProtocolError extends Error {
    readonly data: Uint8Array;

    constructor(message: string, data: Uint8Array = new Uint8Array()) {
        super(message);
        this.name = 'ProtocolError';
        this.data = data;
    }
}

/** Error de transporte: el enlace BLE/USB falló o se desconectó. */
export class TransportError extends Error {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = 'TransportError';
    }
}

/** Una espera superó el tiempo máximo permitido. */
export class TimeoutError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'TimeoutError';
    }
}

/** El checksum calculado por el hub no coincide con el esperado. */
export class ChecksumMismatchError extends Error {
    readonly expected: number;
    readonly actual: number;

    constructor(expected: number, actual: number) {
        super(
            `checksum mismatch: esperado 0x${expected.toString(16).padStart(2, '0')}, ` +
                `recibido 0x${actual.toString(16).padStart(2, '0')}`,
        );
        this.name = 'ChecksumMismatchError';
        this.expected = expected;
        this.actual = actual;
    }
}

/** El firmware no corresponde al tipo de hub conectado. */
export class HubTypeMismatchError extends Error {
    readonly expected: number;
    readonly actual: number;

    constructor(expected: number, actual: number) {
        super(`tipo de hub incorrecto: esperado ${expected}, conectado ${actual}`);
        this.name = 'HubTypeMismatchError';
        this.expected = expected;
        this.actual = actual;
    }
}

/** La operación no está disponible para esta versión de perfil o transporte. */
export class UnsupportedOperationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'UnsupportedOperationError';
    }
}
