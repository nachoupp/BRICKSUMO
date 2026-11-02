import { toDataView, utf8Encode } from './bytes.js';
import { type ChecksumType, firmwareChecksum } from './checksums.js';
import { ProtocolError } from './errors.js';

/** Metadatos de firmware v2.0.0 / v2.1.0 (formato actual de Pybricks). */
export interface FirmwareMetadataV2 {
    readonly 'metadata-version': '2.0.0' | '2.1.0';
    readonly 'firmware-version': string;
    readonly 'device-id': number;
    readonly 'checksum-type': ChecksumType;
    readonly 'checksum-size': number;
    readonly 'hub-name-offset': number;
    readonly 'hub-name-size': number;
}

/** Imagen de firmware lista para flashear. */
export interface PreparedFirmware {
    /** Bytes exactos que se envían al bootloader. */
    readonly image: Uint8Array;
    /** Checksum calculado, o undefined si el firmware no usa checksum. */
    readonly checksum: number | undefined;
    /** Metadatos usados. */
    readonly metadata: FirmwareMetadataV2;
    /** Tipo de hub declarado por el firmware. */
    readonly deviceId: number;
}

/**
 * Codifica el nombre del hub en un campo de tamaño fijo, UTF-8 y terminado
 * en NUL. Si no cabe, se trunca sin romper la terminación.
 */
export function encodeHubName(name: string, size: number): Uint8Array {
    if (!Number.isInteger(size) || size < 1) {
        throw new ProtocolError(`hub-name-size inválido: ${size}`);
    }

    const field = new Uint8Array(size);
    const encoded = utf8Encode(name);
    field.set(encoded.subarray(0, size - 1));
    return field;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function requireInteger(
    value: unknown,
    name: string,
    minimum = 0,
    maximum = 0xffffffff,
): number {
    if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < minimum ||
        value > maximum
    ) {
        throw new ProtocolError(
            `metadato ${name} inválido: ${JSON.stringify(value)} (se esperaba entero ` +
                `${minimum}..${maximum})`,
        );
    }
    return value;
}

/** Valida y normaliza `firmware.metadata.json`. */
export function parseFirmwareMetadata(value: unknown): FirmwareMetadataV2 {
    if (!isRecord(value)) {
        throw new ProtocolError('firmware.metadata.json no es un objeto');
    }

    const metadataVersion = value['metadata-version'];
    if (metadataVersion !== '2.0.0' && metadataVersion !== '2.1.0') {
        throw new ProtocolError(
            `metadata-version no soportada: ${JSON.stringify(metadataVersion)}`,
        );
    }

    const firmwareVersion = value['firmware-version'];
    if (typeof firmwareVersion !== 'string' || firmwareVersion.length === 0) {
        throw new ProtocolError('firmware-version inválida');
    }

    const checksumType = value['checksum-type'];
    if (
        checksumType !== 'sum' &&
        checksumType !== 'crc32' &&
        checksumType !== 'none'
    ) {
        throw new ProtocolError(
            `checksum-type no soportado: ${JSON.stringify(checksumType)}`,
        );
    }
    if (metadataVersion === '2.0.0' && checksumType === 'none') {
        throw new ProtocolError('metadata 2.0.0 no admite checksum-type "none"');
    }

    return {
        'metadata-version': metadataVersion,
        'firmware-version': firmwareVersion,
        'device-id': requireInteger(value['device-id'], 'device-id'),
        'checksum-type': checksumType,
        'checksum-size': requireInteger(
            value['checksum-size'],
            'checksum-size',
            4,
        ),
        'hub-name-offset': requireInteger(
            value['hub-name-offset'],
            'hub-name-offset',
        ),
        'hub-name-size': requireInteger(value['hub-name-size'], 'hub-name-size', 1),
    };
}

/**
 * Ensambla la imagen de firmware v2.x:
 * base + hueco de checksum (si aplica) + nombre de hub opcional.
 *
 * El checksum se calcula sobre `checksum-size` bytes, rellenando con 0xffffffff
 * el espacio de flash que queda tras la imagen.
 */
export function buildFirmwareImage(
    firmwareBase: Uint8Array,
    metadata: FirmwareMetadataV2,
    hubName?: string,
): PreparedFirmware {
    const checksumType = metadata['checksum-type'];
    const checksumSize = metadata['checksum-size'];

    if (checksumSize % 4 !== 0) {
        throw new ProtocolError(
            `checksum-size debe ser múltiplo de 4: ${checksumSize}`,
            firmwareBase,
        );
    }

    if (firmwareBase.byteLength > checksumSize) {
        throw new ProtocolError(
            `firmware-base (${firmwareBase.byteLength}) excede checksum-size ` +
                `(${checksumSize})`,
            firmwareBase,
        );
    }

    if (checksumType !== 'none' && firmwareBase.byteLength % 4 !== 0) {
        throw new ProtocolError(
            `firmware-base debe estar alineado a 4 bytes: ${firmwareBase.byteLength}`,
            firmwareBase,
        );
    }

    const checksumLength = checksumType === 'none' ? 0 : 4;
    const image = new Uint8Array(firmwareBase.byteLength + checksumLength);
    image.set(firmwareBase);

    if (image.byteLength > checksumSize) {
        throw new ProtocolError(
            `la imagen con checksum (${image.byteLength}) excede checksum-size ` +
                `(${checksumSize})`,
            image,
        );
    }

    if (hubName !== undefined && hubName.length > 0) {
        const offset = metadata['hub-name-offset'];
        const size = metadata['hub-name-size'];
        if (offset + size > image.byteLength) {
            throw new ProtocolError(
                `el nombre del hub no cabe: offset ${offset} + tamaño ${size} > ` +
                    `${image.byteLength}`,
                image,
            );
        }
        image.set(encodeHubName(hubName, size), offset);
    }

    const checksum = firmwareChecksum(image, checksumSize, checksumType);
    if (checksum !== undefined) {
        toDataView(image).setUint32(firmwareBase.byteLength, checksum, true);
    }

    return {
        image,
        checksum,
        metadata,
        deviceId: metadata['device-id'],
    };
}
