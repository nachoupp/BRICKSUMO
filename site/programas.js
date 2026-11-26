// Programas del repo para la web: todo .py de /programas llega aquí como texto.
// Para tener un script nuevo en el banco y en el combate basta con añadirlo a /programas.
// No guarda nada en el navegador.

const crudos = import.meta.glob('../programas/*.py', { query: '?raw', import: 'default', eager: true });

export const PROGRAMAS_REPO = Object.entries(crudos)
    .map(([ruta, texto]) => ({ nombre: ruta.split('/').pop(), texto }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
