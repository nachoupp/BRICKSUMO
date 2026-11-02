import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { FileFormat } from '../protocol/ble-pybricks.js';
import { HubType } from '../protocol/lwp3-bootloader.js';
import { encodeMultiMpy6 } from '../protocol/mpy.js';
import { FakeBootloaderLink } from '../transport/fake-bootloader.js';
import { FakePybricksTransport } from '../transport/fake-pybricks.js';
import { HubSession } from '../session/hub-session.js';
import { flashFirmwareBle } from '../firmware/flash-ble.js';
import { prepareFirmwareFromZip } from '../firmware/firmware-zip.js';

const HELP = `BRICKSUMO · CLI de demostración

Uso:
  npm run cli -- fake-upload [--profile 1.5.0] [--slot 0] [--size 64]
  npm run cli -- fake-flash [--hub technic|city|move] [--firmware archivo.zip]
  npm run cli -- inspect-firmware <archivo.zip> [--name BRICKSUMO]
  npm run cli -- help

Los comandos fake-* usan transportes simulados. No tocan hardware.
`;

const HUB_TYPES: Readonly<Record<string, HubType>> = {
    move: HubType.MoveHub,
    city: HubType.CityHub,
    technic: HubType.TechnicHub,
};

const HUB_LABELS: Readonly<Record<HubType, string>> = {
    [HubType.MoveHub]: 'Move Hub',
    [HubType.CityHub]: 'City Hub',
    [HubType.TechnicHub]: 'Technic Hub',
};

const FILE_FORMAT_LABELS: Readonly<Record<FileFormat, string>> = {
    [FileFormat.Mpy5]: 'MPY5',
    [FileFormat.Mpy6]: 'MPY6',
    [FileFormat.MultiMpy6]: 'MultiMPY6',
};

function hubLabel(hubType: HubType): string {
    return HUB_LABELS[hubType] ?? `desconocido (0x${hubType.toString(16)})`;
}

function fileFormatLabel(format: FileFormat | null): string {
    if (format === null) {
        return 'desconocido';
    }
    return FILE_FORMAT_LABELS[format] ?? String(format);
}

function option(args: readonly string[], name: string): string | undefined {
    const index = args.indexOf(name);
    if (index < 0) {
        return undefined;
    }
    const value = args[index + 1];
    if (value === undefined || value.startsWith('--')) {
        throw new Error(`Falta el valor de ${name}`);
    }
    return value;
}

function parseHubType(value: string): HubType {
    const hubType = HUB_TYPES[value.toLowerCase()];
    if (hubType === undefined) {
        throw new Error(
            `Tipo de hub desconocido: ${value}. Usa technic, city o move.`,
        );
    }
    return hubType;
}

let lastProgressLabel = '';
let lastProgressPercent = -1;

function progressLine(label: string, value: number): void {
    const percent = Math.round(value * 100);
    if (label === lastProgressLabel && percent === lastProgressPercent) {
        return;
    }
    lastProgressLabel = label;
    lastProgressPercent = percent;
    process.stdout.write(`\r${label}: ${String(percent).padStart(3)} %`);
}

function finishProgressLine(): void {
    process.stdout.write('\n');
    lastProgressLabel = '';
    lastProgressPercent = -1;
}

function makeTestImage(size: number): Uint8Array {
    const image = new Uint8Array(size);
    for (let index = 0; index < image.byteLength; index++) {
        image[index] = index & 0xff;
    }
    return image;
}

async function fakeUpload(args: readonly string[]): Promise<void> {
    const profileVersion = option(args, '--profile') ?? '1.5.0';
    const slot = Number(option(args, '--slot') ?? 0);
    const size = Number(option(args, '--size') ?? 64);

    if (!Number.isInteger(size) || size <= 0) {
        throw new Error(`Tamaño de bytecode inválido: ${size}`);
    }

    const hub = new FakePybricksTransport({
        profileVersion,
        maxWriteSize: 20,
        maxUserProgramSize: 1024 * 1024,
        numSlots: 5,
    });
    const session = new HubSession(hub);

    // Bytecode ficticio con cabecera MPY6: no ejecuta nada.
    const bytecode = new Uint8Array(size);
    bytecode[0] = 6;
    const program = encodeMultiMpy6([{ name: '__main__', bytecode }]);

    const result = await session.uploadProgram(program, {
        slot,
        onProgress: (value) => progressLine('Subida', value),
    });
    finishProgressLine();

    console.log(`Hub: ${hub.info.name} (${hub.info.profileVersion})`);
    console.log(`Modo: ${result.mode}`);
    console.log(`Programa: ${result.bytes} bytes en el slot ${result.slot}`);
    console.log(
        `Formato de archivo: ${fileFormatLabel(session.fileFormat)}`,
    );
}

async function fakeFlash(args: readonly string[]): Promise<void> {
    const hubType = parseHubType(option(args, '--hub') ?? 'technic');
    const firmwarePath = option(args, '--firmware');

    let image: Uint8Array;
    if (firmwarePath === undefined) {
        image = makeTestImage(4096);
        console.log('Firmware de prueba: 4096 bytes generados localmente.');
    } else {
        const zip = await readFile(firmwarePath);
        const firmware = await prepareFirmwareFromZip(zip);
        image = firmware.image;
        console.log(`Firmware: ${firmware.metadata['firmware-version']}`);
    }

    const startAddress = 0x08008000;
    const link = new FakeBootloaderLink({
        hubType,
        startAddress,
        endAddress: startAddress + Math.max(image.byteLength, 1024 * 1024),
    });

    const result = await flashFirmwareBle({
        link,
        image,
        expectedHubType: hubType,
        onProgress: ({ phase, bytesWritten, totalBytes }) => {
            progressLine(
                `Flasheo (${phase})`,
                totalBytes === 0 ? 0 : bytesWritten / totalBytes,
            );
        },
    });
    finishProgressLine();

    console.log(`Hub: ${hubLabel(result.hubType)}`);
    console.log(`Bytes escritos: ${result.bytesWritten}`);
    console.log(`Checksum XOR: 0x${result.checksum.toString(16).padStart(2, '0')}`);
    console.log(`Arranque solicitado: ${link.started ? 'sí' : 'no'}`);
}

async function inspectFirmware(args: readonly string[]): Promise<void> {
    const path = args[0];
    if (path === undefined || path.startsWith('--')) {
        throw new Error(
            'Uso: npm run cli -- inspect-firmware <archivo.zip> [--name BRICKSUMO]',
        );
    }

    const zip = await readFile(path);
    const firmware = await prepareFirmwareFromZip(zip, option(args, '--name'));

    console.log(`Archivo: ${basename(path)}`);
    console.log(`Metadatos: ${firmware.metadata['metadata-version']}`);
    console.log(`Firmware: ${firmware.metadata['firmware-version']}`);
    console.log(`device-id: 0x${firmware.deviceId.toString(16)}`);
    console.log(`Imagen: ${firmware.image.byteLength} bytes`);
    console.log(
        `Checksum: ${
            firmware.checksum === undefined
                ? 'ninguno'
                : `0x${firmware.checksum.toString(16).padStart(8, '0')}`
        }`,
    );
    console.log(`ReadMe OSS: ${firmware.readme.length} caracteres`);
}

async function main(args: readonly string[]): Promise<void> {
    const [command, ...rest] = args;

    switch (command) {
        case undefined:
        case 'help':
        case '--help':
        case '-h':
            console.log(HELP);
            return;
        case 'fake-upload':
            await fakeUpload(rest);
            return;
        case 'fake-flash':
            await fakeFlash(rest);
            return;
        case 'inspect-firmware':
            await inspectFirmware(rest);
            return;
        default:
            throw new Error(`Comando desconocido: ${command}`);
    }
}

main(process.argv.slice(2)).catch((error: unknown) => {
    console.error(
        `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
});
