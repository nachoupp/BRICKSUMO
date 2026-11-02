import { ProtocolError } from './errors.js';

/** Versión de Pybricks/Perfil interpretada. */
export interface ParsedVersion {
    readonly raw: string;
    readonly major: number;
    readonly minor: number;
    readonly patch: number;
    readonly prerelease: string | undefined;
    readonly prereleaseNumber: number | undefined;
}

const VERSION_PATTERN = /^v?(\d+)\.(\d+)\.(\d+)(?:[-.]?([a-zA-Z]+)\.?(\d+)?)?$/;

const PRERELEASE_RANK: Readonly<Record<string, number>> = {
    a: 0,
    alpha: 0,
    b: 1,
    beta: 1,
    c: 2,
    rc: 2,
    candidate: 2,
    f: 3,
    final: 3,
};

/**
 * Interpreta versiones tipo `1.5.0`, `1.5.0b1`, `4.0.0b4` o `1.0.0-rc.2`.
 * No se aceptan sufijos arbitrarios: una versión desconocida debe fallar
 * explícitamente para no habilitar funciones por accidente.
 */
export function parseVersion(value: string): ParsedVersion {
    const match = VERSION_PATTERN.exec(value.trim());
    if (!match) {
        throw new ProtocolError(`versión no válida: ${JSON.stringify(value)}`);
    }

    const [, majorText, minorText, patchText, prereleaseText, prereleaseNumberText] =
        match;

    if (
        majorText === undefined ||
        minorText === undefined ||
        patchText === undefined
    ) {
        throw new ProtocolError(`versión incompleta: ${JSON.stringify(value)}`);
    }

    const prerelease = prereleaseText?.toLowerCase();
    if (prerelease !== undefined && PRERELEASE_RANK[prerelease] === undefined) {
        throw new ProtocolError(
            `pre-release no reconocida en versión ${JSON.stringify(value)}`,
        );
    }

    return {
        raw: value.trim(),
        major: Number(majorText),
        minor: Number(minorText),
        patch: Number(patchText),
        prerelease,
        prereleaseNumber:
            prereleaseNumberText === undefined ? undefined : Number(prereleaseNumberText),
    };
}

/** Compara dos versiones. Devuelve <0, 0 o >0. */
export function compareVersions(a: string, b: string): number {
    const left = parseVersion(a);
    const right = parseVersion(b);

    for (const key of ['major', 'minor', 'patch'] as const) {
        if (left[key] !== right[key]) {
            return left[key] - right[key];
        }
    }

    if (left.prerelease === undefined && right.prerelease === undefined) {
        return 0;
    }
    if (left.prerelease === undefined) {
        return 1;
    }
    if (right.prerelease === undefined) {
        return -1;
    }

    const leftRank = PRERELEASE_RANK[left.prerelease] ?? 0;
    const rightRank = PRERELEASE_RANK[right.prerelease] ?? 0;
    if (leftRank !== rightRank) {
        return leftRank - rightRank;
    }

    const leftNumber = left.prereleaseNumber ?? 0;
    const rightNumber = right.prereleaseNumber ?? 0;
    if (leftNumber !== rightNumber) {
        return leftNumber - rightNumber;
    }

    return left.prerelease.localeCompare(right.prerelease);
}

/** `true` si `version` es igual o posterior a `minimum`. */
export function isVersionAtLeast(version: string, minimum: string): boolean {
    return compareVersions(version, minimum) >= 0;
}

/** `true` si `version` es estrictamente anterior a `maximum`. */
export function isVersionBefore(version: string, maximum: string): boolean {
    return compareVersions(version, maximum) < 0;
}
