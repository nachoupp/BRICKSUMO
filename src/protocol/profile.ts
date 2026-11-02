import {
    FileFormat,
    HubCapabilityFlag,
    type HubCapabilities,
    hasCapability,
} from './ble-pybricks.js';
import { compareVersions, isVersionAtLeast, isVersionBefore, parseVersion } from './version.js';

/** Última versión de perfil que esta implementación conoce. */
export const SUPPORTED_PROFILE_VERSION = '1.5.0';

/** Capacidades derivadas de la versión del perfil Pybricks. */
export interface ProfileFeatures {
    readonly profileVersion: string;
    /** La característica de capacidades existe desde 1.2.0. */
    readonly hasCapabilities: boolean;
    /** WriteStdin existe desde 1.3.0. */
    readonly hasStdin: boolean;
    /** StartUserProgram acepta id desde 1.4.0. */
    readonly hasStartProgramId: boolean;
    /** WriteAppData existe desde 1.4.0. */
    readonly hasAppData: boolean;
    /** numSlots existe desde 1.5.0. */
    readonly hasSlots: boolean;
    /** NUS sigue existiendo antes de 1.5.0. */
    readonly hasNus: boolean;
    /** Antes de 1.2.0 el programa se descarga por NUS. */
    readonly usesLegacyDownload: boolean;
    /** Antes de 1.4.0 StartUserProgram no lleva id. */
    readonly usesLegacyStart: boolean;
    /** Antes de 1.3.0 stdout va por NUS. */
    readonly usesLegacyStdio: boolean;
}

/** Calcula las capacidades de un perfil a partir de su versión. */
export function getProfileFeatures(profileVersion: string): ProfileFeatures {
    // Valida el formato antes de habilitar cualquier función.
    parseVersion(profileVersion);

    return {
        profileVersion,
        hasCapabilities: isVersionAtLeast(profileVersion, '1.2.0'),
        hasStdin: isVersionAtLeast(profileVersion, '1.3.0'),
        hasStartProgramId: isVersionAtLeast(profileVersion, '1.4.0'),
        hasAppData: isVersionAtLeast(profileVersion, '1.4.0'),
        hasSlots: isVersionAtLeast(profileVersion, '1.5.0'),
        hasNus: isVersionBefore(profileVersion, '1.5.0'),
        usesLegacyDownload: isVersionBefore(profileVersion, '1.2.0'),
        usesLegacyStart: isVersionBefore(profileVersion, '1.4.0'),
        usesLegacyStdio: isVersionBefore(profileVersion, '1.3.0'),
    };
}

/**
 * Selecciona el formato de programa preferido.
 *
 * Con capacidades, el hub debe declarar MultiMpy6. Sin capacidades (perfil
 * antiguo), se usa la heurística de firmware de Pybricks Code.
 */
export function selectFileFormat(
    profileVersion: string,
    capabilities: HubCapabilities | null,
    firmwareVersion?: string,
): FileFormat | null {
    const features = getProfileFeatures(profileVersion);

    if (features.hasCapabilities && capabilities !== null) {
        return hasCapability(capabilities, HubCapabilityFlag.UserProgramMultiMpy6)
            ? FileFormat.MultiMpy6
            : null;
    }

    if (firmwareVersion !== undefined) {
        return compareVersions(firmwareVersion, '3.2.0b2') <= 0
            ? FileFormat.Mpy5
            : FileFormat.Mpy6;
    }

    return FileFormat.Mpy6;
}
