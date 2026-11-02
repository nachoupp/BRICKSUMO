import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const required = ['BRICKSUMO', 'id="estado"', 'styles.css', 'main.js'];

for (const token of required) {
    if (!html.includes(token)) {
        console.error(`Falta ${JSON.stringify(token)} en site/index.html`);
        process.exitCode = 1;
    }
}

if (process.exitCode !== 1) {
    console.log('OK: sitio estático listo para Vercel.');
}
