// Construye la web de Vercel: la portada, el banco de pruebas y el modo combate.
import { resolve } from 'node:path';
import { defineConfig } from 'vite';

const raiz = resolve(import.meta.dirname, 'site');

export default defineConfig({
    root: raiz,
    build: {
        outDir: resolve(import.meta.dirname, 'dist-site'),
        emptyOutDir: true,
        rollupOptions: {
            input: {
                portada: resolve(raiz, 'index.html'),
                banco: resolve(raiz, 'banco/index.html'),
                combate: resolve(raiz, 'combate/index.html'),
            },
        },
    },
});
