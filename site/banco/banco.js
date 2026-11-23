// Banco de pruebas de BRICKSUMO.
// Conecta un hub Pybricks por Web Bluetooth, compila Python en el navegador,
// envía el programa, lo ejecuta y ofrece una consola (stdin/stdout).
// No guarda nada en el navegador.

import { compile } from '@pybricks/mpy-cross-v6';
import wasmUrl from '@pybricks/mpy-cross-v6/build/mpy-cross-v6.wasm?url';
import {
    BlePybricksTransport,
    requestPybricksBleDevice,
} from '../../src/adapters/ble-pybricks.ts';
import { Status, hasStatus } from '../../src/protocol/ble-pybricks.ts';
import { encodeMultiMpy6 } from '../../src/protocol/mpy.ts';
import { HubSession } from '../../src/session/hub-session.ts';

const $ = (id) => document.getElementById(id);
const ui = {
    aviso: $('aviso-navegador'),
    conectar: $('conectar'),
    desconectar: $('desconectar'),
    enviar: $('enviar'),
    parar: $('parar'),
    progreso: $('progreso'),
    codigo: $('codigo'),
    salida: $('salida'),
    form: $('form-orden'),
    orden: $('orden'),
    mandar: $('mandar'),
    limpiar: $('limpiar'),
    copiar: $('copiar'),
    nombre: $('hub-nombre'),
    firmware: $('hub-firmware'),
    programa: $('hub-programa'),
    bateria: $('hub-bateria'),
};

let device = null;
let session = null;
let ocupado = false;
const decoder = new TextDecoder();
const encoder = new TextEncoder();

// ---------- Consola ----------
function escribir(texto, clase) {
    const linea = document.createElement('span');
    if (clase) {
        linea.className = clase;
    }
    linea.textContent = texto;
    ui.salida.append(linea);
    // Copia en la consola del navegador, para poder revisarla desde las herramientas de Chrome.
    console.log('[BRICKSUMO]', texto.replace(/\n$/, ''));
    ui.salida.scrollTop = ui.salida.scrollHeight;
}

function sistema(texto) {
    escribir(`· ${texto}\n`, 'sis');
}

function error(texto) {
    escribir(`✗ ${texto}\n`, 'err');
}

// ---------- Estado de la interfaz ----------
function actualizarBotones() {
    const conectado = session !== null;
    ui.conectar.disabled = conectado || ocupado;
    ui.desconectar.disabled = !conectado || ocupado;
    ui.enviar.disabled = !conectado || ocupado;
    ui.parar.disabled = !conectado;
    ui.orden.disabled = !conectado;
    ui.mandar.disabled = !conectado;
}

function limpiarDatosHub() {
    ui.nombre.textContent = '—';
    ui.firmware.textContent = '—';
    ui.programa.textContent = '—';
    ui.bateria.textContent = '—';
}

function alEvento(evento) {
    if (evento.type === 'stdout') {
        escribir(decoder.decode(evento.data, { stream: true }));
    } else if (evento.type === 'status') {
        const enMarcha = hasStatus(evento.flags, Status.UserProgramRunning);
        ui.programa.textContent = enMarcha ? 'En marcha' : 'Parado';
        const baja = hasStatus(evento.flags, Status.BatteryLowVoltageWarning);
        ui.bateria.textContent = baja ? 'Baja: cárgala' : 'Bien';
    }
}

function alDesconectar() {
    if (session === null) {
        return;
    }
    session = null;
    sistema('El hub se ha desconectado.');
    limpiarDatosHub();
    actualizarBotones();
}

// ---------- Conectar / desconectar ----------
async function conectar() {
    ocupado = true;
    actualizarBotones();
    try {
        device = await requestPybricksBleDevice();
        if (device === null) {
            sistema('Conexión cancelada.');
            return;
        }
        sistema(`Conectando con ${device.name ?? 'el hub'}…`);
        const transport = await BlePybricksTransport.connect(device);
        session = new HubSession(transport, {
            onProtocolError: (e) => error(`Protocolo: ${e.message}`),
        });
        session.onEvent(alEvento);
        device.addEventListener('gattserverdisconnected', alDesconectar);

        const info = session.info;
        ui.nombre.textContent = info.name || device.name || 'Hub';
        ui.firmware.textContent = `${info.firmwareVersion} (perfil ${info.profileVersion})`;
        sistema(`Conectado: ${ui.nombre.textContent}, firmware ${info.firmwareVersion}.`);
        if (session.fileFormat === null && !session.features.usesLegacyDownload) {
            error('Este firmware no admite enviar programas desde aquí. Actualízalo a Pybricks 3.3 o posterior.');
        }
    } catch (e) {
        error(e instanceof Error ? e.message : String(e));
        session = null;
    } finally {
        ocupado = false;
        actualizarBotones();
    }
}

async function desconectar() {
    const s = session;
    session = null;
    try {
        await s?.disconnect();
    } catch (e) {
        error(e instanceof Error ? e.message : String(e));
    }
    limpiarDatosHub();
    sistema('Desconectado.');
    actualizarBotones();
}

// ---------- Compilar y enviar ----------
async function compilar(codigo) {
    const resultado = await compile('main.py', codigo, undefined, wasmUrl);
    if (resultado.status !== 0 || !resultado.mpy) {
        const mensaje = Array.isArray(resultado.err) ? resultado.err.join('\n') : String(resultado.err ?? '');
        throw new Error(`El programa tiene errores:\n${mensaje}`);
    }
    return resultado.mpy;
}

async function enviar() {
    if (session === null) {
        return;
    }
    ocupado = true;
    actualizarBotones();
    try {
        ui.progreso.textContent = 'Compilando…';
        const mpy = await compilar(ui.codigo.value);
        // Pybricks espera el programa principal como módulo "__main__".
        const paquete = encodeMultiMpy6([{ name: '__main__', bytecode: mpy }]);

        // Si hay un programa en marcha, se para antes de enviar el nuevo.
        if (ui.programa.textContent === 'En marcha') {
            await session.stopProgram();
        }

        ui.progreso.textContent = 'Enviando…';
        const resultado = await session.uploadProgram(paquete, {
            onProgress: (p) => {
                ui.progreso.textContent = `Enviando… ${Math.round(p * 100)} %`;
            },
        });
        ui.progreso.textContent = '';
        sistema(`Programa enviado (${resultado.bytes} bytes) y en marcha.`);
    } catch (e) {
        ui.progreso.textContent = '';
        error(e instanceof Error ? e.message : String(e));
    } finally {
        ocupado = false;
        actualizarBotones();
    }
}

async function parar() {
    try {
        await session?.stopProgram();
        sistema('Programa parado.');
    } catch (e) {
        error(e instanceof Error ? e.message : String(e));
    }
}

// ---------- Órdenes por stdin ----------
async function mandarOrden(evento) {
    evento.preventDefault();
    const texto = ui.orden.value.trim();
    if (session === null || texto === '') {
        return;
    }
    ui.orden.value = '';
    escribir(`> ${texto}\n`, 'sis');
    const datos = encoder.encode(`${texto}\n`);
    // Cada envío tiene un tamaño máximo; se trocea por si la orden es larga.
    const maximo = Math.max(1, (session.info.capabilities?.maxWriteSize ?? 20) - 1);
    try {
        for (let i = 0; i < datos.length; i += maximo) {
            await session.writeStdin(datos.subarray(i, i + maximo));
        }
    } catch (e) {
        error(e instanceof Error ? e.message : String(e));
    }
}

// ---------- Arranque ----------
if (!('bluetooth' in navigator)) {
    ui.aviso.hidden = false;
    ui.conectar.disabled = true;
} else {
    ui.conectar.addEventListener('click', () => void conectar());
    ui.desconectar.addEventListener('click', () => void desconectar());
    ui.enviar.addEventListener('click', () => void enviar());
    ui.parar.addEventListener('click', () => void parar());
    ui.form.addEventListener('submit', (e) => void mandarOrden(e));
    actualizarBotones();
}
ui.limpiar.addEventListener('click', () => {
    ui.salida.textContent = '';
});
ui.copiar.addEventListener('click', () => {
    navigator.clipboard
        .writeText(ui.salida.textContent ?? '')
        .then(() => sistema('Registro copiado: pégalo en el chat.'))
        .catch(() => error('No se pudo copiar el registro.'));
});
