import { describe, expect, it } from 'vitest';
import { xor8 } from '../../src/protocol/checksums.js';
import {
    Command,
    HubType,
    Result,
    getMessageType,
} from '../../src/protocol/lwp3-bootloader.js';
import {
    ChecksumMismatchError,
    HubTypeMismatchError,
    ProtocolError,
    TimeoutError,
} from '../../src/protocol/errors.js';
import { flashFirmwareBle } from '../../src/firmware/flash-ble.js';
import { FakeBootloaderLink } from '../../src/transport/fake-bootloader.js';

function makeImage(length: number): Uint8Array {
    const image = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
        image[i] = (i * 7) & 0xff;
    }
    return image;
}

function sentTypes(link: FakeBootloaderLink): Command[] {
    return link.sentMessages.map((message) => getMessageType(message));
}

describe('flashFirmwareBle', () => {
    it('borra, inicializa, programa y arranca', async () => {
        const link = new FakeBootloaderLink({ hubType: HubType.TechnicHub });
        const image = makeImage(100);
        const phases: string[] = [];

        const result = await flashFirmwareBle({
            link,
            image,
            expectedHubType: HubType.TechnicHub,
            onProgress: (progress) => phases.push(progress.phase),
        });

        expect(result.bytesWritten).toBe(100);
        expect(result.checksum).toBe(xor8(image, 0xff));
        expect(result.hubType).toBe(HubType.TechnicHub);
        expect(link.started).toBe(true);
        expect(link.flash.subarray(0, image.length)).toEqual(image);

        const types = sentTypes(link);
        expect(types[0]).toBe(Command.GetInfo);
        expect(types[1]).toBe(Command.EraseFlash);
        expect(types[2]).toBe(Command.InitLoader);
        expect(types.slice(3, -1).every((type) => type === Command.ProgramFlash)).toBe(
            true,
        );
        expect(types.at(-1)).toBe(Command.StartApp);
        expect(phases).toEqual(['erase', 'init', 'flash', 'flash', 'flash', 'flash', 'start']);
    });

    it('pide checksum cada 8 paquetes y no en el último', async () => {
        const link = new FakeBootloaderLink({ hubType: HubType.TechnicHub });
        const image = makeImage(1000);

        const result = await flashFirmwareBle({ link, image });

        const checksumRequests = sentTypes(link).filter(
            (type) => type === Command.GetChecksum,
        );
        expect(checksumRequests).toHaveLength(3);
        expect(result.checksum).toBe(xor8(image, 0xff));
        expect(link.flash.subarray(0, image.length)).toEqual(image);
    });

    it('respeta el tamaño máximo de payload de MoveHub', async () => {
        const link = new FakeBootloaderLink({ hubType: HubType.MoveHub });
        const image = makeImage(50);

        await flashFirmwareBle({ link, image });

        const programMessages = link.sentMessages.filter(
            (message) => getMessageType(message) === Command.ProgramFlash,
        );
        expect(programMessages).toHaveLength(4); // 14 + 14 + 14 + 8
        expect(link.flash.subarray(0, image.length)).toEqual(image);
    });

    it('valida el tipo de hub antes de borrar', async () => {
        const link = new FakeBootloaderLink({ hubType: HubType.TechnicHub });

        await expect(
            flashFirmwareBle({
                link,
                image: makeImage(10),
                expectedHubType: HubType.CityHub,
            }),
        ).rejects.toBeInstanceOf(HubTypeMismatchError);

        expect(sentTypes(link)).toEqual([Command.GetInfo]);
    });

    it('rechaza una imagen que no cabe en la flash', async () => {
        const link = new FakeBootloaderLink({
            startAddress: 0x08000000,
            endAddress: 0x08000010,
        });

        await expect(
            flashFirmwareBle({ link, image: makeImage(17) }),
        ).rejects.toBeInstanceOf(ProtocolError);
        expect(sentTypes(link)).toEqual([Command.GetInfo]);
    });

    it('falla si el checksum final no coincide y no arranca', async () => {
        const link = new FakeBootloaderLink({ checksumMismatch: true });

        await expect(
            flashFirmwareBle({ link, image: makeImage(100) }),
        ).rejects.toBeInstanceOf(ChecksumMismatchError);
        expect(link.started).toBe(false);
    });

    it('falla si el count final no coincide y no arranca', async () => {
        const link = new FakeBootloaderLink({ finalCountMismatch: true });

        await expect(
            flashFirmwareBle({ link, image: makeImage(100) }),
        ).rejects.toBeInstanceOf(ProtocolError);
        expect(link.started).toBe(false);
    });

    it('falla si el hub rechaza el erase', async () => {
        const link = new FakeBootloaderLink({ eraseResult: Result.Error });

        await expect(
            flashFirmwareBle({ link, image: makeImage(10) }),
        ).rejects.toBeInstanceOf(ProtocolError);
        expect(link.started).toBe(false);
    });

    it('sólo tolera timeout de erase si se pide explícitamente', async () => {
        const strict = new FakeBootloaderLink({ eraseDelayMs: 20 });
        await expect(
            flashFirmwareBle({
                link: strict,
                image: makeImage(10),
                eraseTimeoutMs: 1,
            }),
        ).rejects.toBeInstanceOf(TimeoutError);

        const tolerant = new FakeBootloaderLink({ eraseDelayMs: 20 });
        await expect(
            flashFirmwareBle({
                link: tolerant,
                image: makeImage(10),
                eraseTimeoutMs: 1,
                continueOnEraseTimeout: true,
            }),
        ).resolves.toMatchObject({ bytesWritten: 10 });
    });

    it('falla si no llega la respuesta final de ProgramFlash', async () => {
        const link = new FakeBootloaderLink({ noFinalResponse: true });

        await expect(
            flashFirmwareBle({
                link,
                image: makeImage(10),
                responseTimeoutMs: 5,
            }),
        ).rejects.toBeInstanceOf(TimeoutError);
        expect(link.started).toBe(false);
    });

    it('rechaza imágenes vacías', async () => {
        const link = new FakeBootloaderLink();
        await expect(
            flashFirmwareBle({ link, image: new Uint8Array() }),
        ).rejects.toBeInstanceOf(ProtocolError);
    });
});
