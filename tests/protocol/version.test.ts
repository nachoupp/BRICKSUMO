import { describe, expect, it } from 'vitest';
import {
    compareVersions,
    isVersionAtLeast,
    isVersionBefore,
    parseVersion,
} from '../../src/protocol/version.js';
import { getProfileFeatures, selectFileFormat } from '../../src/protocol/profile.js';
import { FileFormat, HubCapabilityFlag, type HubCapabilities } from '../../src/protocol/ble-pybricks.js';

describe('parseVersion', () => {
    it('interpreta versiones de Pybricks', () => {
        expect(parseVersion('1.5.0')).toMatchObject({
            major: 1,
            minor: 5,
            patch: 0,
            prerelease: undefined,
        });
        expect(parseVersion('4.0.0b4')).toMatchObject({
            major: 4,
            minor: 0,
            patch: 0,
            prerelease: 'b',
            prereleaseNumber: 4,
        });
        expect(parseVersion('1.0.0-rc.2')).toMatchObject({
            prerelease: 'rc',
            prereleaseNumber: 2,
        });
    });

    it('rechaza versiones ambiguas', () => {
        expect(() => parseVersion('1.5')).toThrow();
        expect(() => parseVersion('1.5.0zzz1')).toThrow();
    });
});

describe('compareVersions', () => {
    it('ordena releases y pre-releases', () => {
        expect(compareVersions('1.4.0', '1.5.0')).toBeLessThan(0);
        expect(compareVersions('1.5.0b1', '1.5.0')).toBeLessThan(0);
        expect(compareVersions('4.0.0b4', '3.2.0b2')).toBeGreaterThan(0);
        expect(compareVersions('1.5.0', '1.5.0')).toBe(0);
        expect(compareVersions('1.5.0b2', '1.5.0b1')).toBeGreaterThan(0);
    });

    it('expone helpers de umbral', () => {
        expect(isVersionAtLeast('1.5.0', '1.4.0')).toBe(true);
        expect(isVersionBefore('1.3.9', '1.4.0')).toBe(true);
    });
});

describe('getProfileFeatures', () => {
    it('marca las transiciones de perfil', () => {
        expect(getProfileFeatures('1.1.9')).toMatchObject({
            hasCapabilities: false,
            usesLegacyDownload: true,
            usesLegacyStart: true,
            hasNus: true,
            hasStdin: false,
        });
        expect(getProfileFeatures('1.2.0')).toMatchObject({
            hasCapabilities: true,
            usesLegacyDownload: false,
            usesLegacyStart: true,
            hasNus: true,
            hasStdin: false,
        });
        expect(getProfileFeatures('1.3.0')).toMatchObject({
            usesLegacyStart: true,
            hasNus: true,
            hasStdin: true,
        });
        expect(getProfileFeatures('1.4.0')).toMatchObject({
            usesLegacyStart: false,
            hasStartProgramId: true,
            hasAppData: true,
            hasNus: true,
        });
        expect(getProfileFeatures('1.5.0')).toMatchObject({
            hasSlots: true,
            hasNus: false,
        });
    });
});

describe('selectFileFormat', () => {
    const capabilities: HubCapabilities = {
        maxWriteSize: 20,
        flags: HubCapabilityFlag.UserProgramMultiMpy6,
        maxUserProgramSize: 65536,
        numSlots: 5,
    };

    it('prefiere MultiMpy6 cuando el hub lo declara', () => {
        expect(selectFileFormat('1.5.0', capabilities)).toBe(FileFormat.MultiMpy6);
    });

    it('devuelve null si hay capacidades pero no MultiMpy6', () => {
        expect(
            selectFileFormat('1.5.0', { ...capabilities, flags: 0 }),
        ).toBeNull();
    });

    it('usa la heurística de firmware sin capacidades', () => {
        expect(selectFileFormat('1.1.0', null, '3.2.0b2')).toBe(FileFormat.Mpy5);
        expect(selectFileFormat('1.1.0', null, '4.0.0b4')).toBe(FileFormat.Mpy6);
    });
});
