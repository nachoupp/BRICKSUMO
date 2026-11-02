import {
    FirmwareReader,
    metadataIsV200,
    metadataIsV210,
    type FirmwareMetadata,
} from '@pybricks/firmware';
import { ProtocolError } from '../protocol/errors.js';
import {
    buildFirmwareImage,
    parseFirmwareMetadata,
    type FirmwareMetadataV2,
    type PreparedFirmware,
} from '../protocol/firmware.js';

/** Contenido relevante de un ZIP de firmware. */
export interface FirmwareZipContents {
    readonly base: Uint8Array;
    readonly metadata: FirmwareMetadataV2;
    readonly rawMetadata: FirmwareMetadata;
    readonly readme: string;
}

/** Firmware preparado a partir de un ZIP, con su ReadMe OSS. */
export type PreparedFirmwareZip = PreparedFirmware & {
    readonly readme: string;
};

/**
 * Lee `firmware-base.bin` y `firmware.metadata.json` de un ZIP oficial.
 * Rechaza metadatos v1.x: el flasheo v2 es el único soportado por esta capa.
 */
export async function readFirmwareZip(
    data: Uint8Array | ArrayBuffer,
): Promise<FirmwareZipContents> {
    const reader = await FirmwareReader.load(data);
    const base = await reader.readFirmwareBase();
    const rawMetadata = await reader.readMetadata();

    if (!metadataIsV200(rawMetadata) && !metadataIsV210(rawMetadata)) {
        throw new ProtocolError(
            `metadata-version no soportada para flasheo: ` +
                `${rawMetadata['metadata-version']}`,
        );
    }

    return {
        base,
        metadata: parseFirmwareMetadata(rawMetadata),
        rawMetadata,
        readme: await reader.readReadMeOss(),
    };
}

/** Lee un ZIP y ensambla la imagen final, opcionalmente con nombre de hub. */
export async function prepareFirmwareFromZip(
    data: Uint8Array | ArrayBuffer,
    hubName?: string,
): Promise<PreparedFirmwareZip> {
    const { base, metadata, readme } = await readFirmwareZip(data);
    return {
        ...buildFirmwareImage(base, metadata, hubName),
        readme,
    };
}
