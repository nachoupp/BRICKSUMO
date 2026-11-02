import { readdir, readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../src/', import.meta.url));
const forbidden = ['localStorage', 'sessionStorage', 'indexedDB'];
const findings = [];

async function walk(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            await walk(path);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
            const text = await readFile(path, 'utf8');
            for (const token of forbidden) {
                if (text.includes(token)) {
                    findings.push(`${relative(root, path)}: ${token}`);
                }
            }
        }
    }
}

await walk(root);

if (findings.length > 0) {
    console.error('BRICKSUMO prohíbe el almacenamiento local del navegador:');
    for (const finding of findings) {
        console.error(`  - ${finding}`);
    }
    process.exitCode = 1;
} else {
    console.log('OK: src/ no contiene localStorage, sessionStorage ni indexedDB.');
}
