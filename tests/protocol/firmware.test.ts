import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
    buildFirmwareImage,
    encodeHubName,
    parseFirmwareMetadata,
    type FirmwareMetadataV2,
} from '../../src/protocol/firmware.js';
import { firmwareChecksum } from '../../src/protocol/checksums.js';
import { utf8Decode } from '../../src/protocol/bytes.js';
import {
    prepareFirmwareFromZip,
    readFirmwareZip,
} from '../../src/firmware/firmware-zip.js';

const baseMetadata: FirmwareMetadataV2 = {
    'metadata-version': '2.1.0',
    'firmware-version': 'test-1.0.0',
    'device-id': 128,
    'checksum-type': 'sum',
    'checksum-size': 64,
    'hub-name-offset': 16,
    'hub-name-size': 8,
};

function syntheticBase(): Uint8Array {
    const base = new Uint8Array(32);
    for (let i = 0; i < base.length; i++) {
        base[i] = i;
    }
    return base;
}

describe('nombre del hub', () => {
    it('codifica UTF-8 y termina en NUL', () => {
        expect(encodeHubName('HUB', 8)).toEqual(
            new Uint8Array([0x48, 0x55, 0x42, 0, 0, 0, 0, 0]),
        );
    });

    it('trunca sin perder el terminador', () => {
        const encoded = encodeHubName('BRICKSUMO', 4);
        expect(encoded).toEqual(new Uint8Array([0x42, 0x52, 0x49, 0x00]));
    });

    it('rechaza tamaños inválidos', () => {
        expect(() => encodeHubName('x', 0)).toThrow();
    });
});

describe('metadatos v2', () => {
    it('acepta 2.0.0 y 2.1.0', () => {
        expect(parseFirmwareMetadata(baseMetadata)).toEqual(baseMetadata);
        expect(
            parseFirmwareMetadata({ ...baseMetadata, 'metadata-version': '2.0.0' }),
        ).toMatchObject({ 'metadata-version': '2.0.0' });
    });

    it('rechaza versiones y tipos desconocidos', () => {
        expect(() =>
            parseFirmwareMetadata({ ...baseMetadata, 'metadata-version': '1.1.0' }),
        ).toThrow();
        expect(() =>
            parseFirmwareMetadata({ ...baseMetadata, 'checksum-type': 'sha256' }),
        ).toThrow();
        expect(() =>
            parseFirmwareMetadata({
                ...baseMetadata,
                'metadata-version': '2.0.0',
                'checksum-type': 'none',
            }),
        ).toThrow();
    });

    it('rechaza campos numéricos inválidos', () => {
        expect(() =>
            parseFirmwareMetadata({ ...baseMetadata, 'checksum-size': 3 }),
        ).toThrow();
        expect(() =>
            parseFirmwareMetadata({ ...baseMetadata, 'device-id': '128' }),
        ).toThrow();
    });
});

describe('ensamblado de firmware v2', () => {
    it('añade checksum sum y nombre de hub', () => {
        const base = syntheticBase();
        const prepared = buildFirmwareImage(base, baseMetadata, 'HUB');

        expect(prepared.image).toHaveLength(base.length + 4);
        // El nombre del hub se escribe dentro de la imagen, sobre la base.
        expect(prepared.image.subarray(0, 16)).toEqual(base.subarray(0, 16));
        expect(prepared.image.subarray(24, 32)).toEqual(base.subarray(24, 32));
        expect(prepared.image.subarray(16, 24)).toEqual(
            new Uint8Array([0x48, 0x55, 0x42, 0, 0, 0, 0, 0]),
        );

        const withoutChecksum = prepared.image.slice();
        withoutChecksum.fill(0, base.length);
        expect(prepared.checksum).toBe(
            firmwareChecksum(withoutChecksum, 64, 'sum'),
        );
        expect(prepared.checksum).toBe(
            new DataView(prepared.image.buffer).getUint32(base.length, true),
        );
    });

    it('calcula crc32', () => {
        const prepared = buildFirmwareImage(syntheticBase(), {
            ...baseMetadata,
            'checksum-type': 'crc32',
        });
        expect(prepared.checksum).toBeTypeOf('number');
    });

    it('no añade checksum con tipo none', () => {
        const prepared = buildFirmwareImage(syntheticBase(), {
            ...baseMetadata,
            'metadata-version': '2.1.0',
            'checksum-type': 'none',
        });
        expect(prepared.image).toHaveLength(32);
        expect(prepared.checksum).toBeUndefined();
    });

    it('rechaza imágenes que no caben o no están alineadas', () => {
        expect(() =>
            buildFirmwareImage(new Uint8Array(33), baseMetadata),
        ).toThrow();
        expect(() =>
            buildFirmwareImage(new Uint8Array(8), {
                ...baseMetadata,
                'checksum-size': 8,
            }),
        ).toThrow();
    });
});

describe('integración con el ZIP oficial de Pybricks', () => {
    it('lee primehub.zip y prepara una imagen con nombre', async () => {
        const zipPath = new URL(
            '../../node_modules/@pybricks/firmware/build/primehub.zip',
            import.meta.url,
        );
        const zip = await readFile(zipPath);
        const contents = await readFirmwareZip(zip);

        expect(contents.metadata['metadata-version']).toBe('2.1.0');
        expect(contents.metadata['device-id']).toBe(129);
        expect(contents.metadata['checksum-type']).toBe('crc32');
        expect(contents.base.byteLength).toBeGreaterThan(1000);
        expect(contents.readme.length).toBeGreaterThan(0);

        const prepared = await prepareFirmwareFromZip(zip, 'BRICKSUMO');
        expect(prepared.image.byteLength).toBe(contents.base.byteLength + 4);
        expect(prepared.checksum).toBeTypeOf('number');
        expect(prepared.deviceId).toBe(129);

        const offset = contents.metadata['hub-name-offset'];
        const size = contents.metadata['hub-name-size'];
        const name = utf8Decode(prepared.image.subarray(offset, offset + size));
        expect(name.replace(/\0.*$/s, '')).toBe('BRICKSUMO');
    });
});
