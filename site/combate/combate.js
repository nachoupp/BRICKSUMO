// Modo combate de BRICKSUMO (capa 1).
// Conecta dos hubs Pybricks a la vez por Web Bluetooth, activa su telemetría (TEL ON)
// y muestra en vivo lo que envían. El árbitro lleva el reloj y los puntos a mano.
// No guarda nada en el navegador.

import {
    BlePybricksTransport,
    requestPybricksBleDevice,
} from '../../src/adapters/ble-pybricks.ts';
import { Status, hasStatus } from '../../src/protocol/ble-pybricks.ts';
import { HubSession } from '../../src/session/hub-session.ts';

const $ = (id) => document.getElementById(id);
const SVG = 'http://www.w3.org/2000/svg';
const encoder = new TextEncoder();

const NOMBRE = { azul: 'AZUL', amarillo: 'AMARILLO' };
const HACKEOS = ['—', 'niebla', 'barro', 'mando loco', 'arma dormida', 'congelado'];

// ---------- Estado de cada robot ----------
function nuevoRobot(id) {
    return {
        id,
        session: null,
        device: null,
        ocupado: false,
        enMarcha: false,
        telActivada: false,
        decoder: new TextDecoder(),
        pendiente: '',
        hack: 0,
        placa: document.querySelector(`.placa[data-robot="${id}"]`),
        panel: document.querySelector(`.panel[data-robot="${id}"]`),
    };
}
const robots = { azul: nuevoRobot('azul'), amarillo: nuevoRobot('amarillo') };

function campo(robot, nombre) {
    return [...robot.placa.querySelectorAll(`[data-campo="${nombre}"]`), ...robot.panel.querySelectorAll(`[data-campo="${nombre}"]`)];
}

function poner(robot, nombre, texto, alerta = false) {
    for (const el of campo(robot, nombre)) {
        el.textContent = texto;
        el.classList.toggle('alerta', alerta);
    }
}

// ---------- Registro y sucesos ----------
function registrar(robot, texto) {
    const pre = $('registro');
    pre.textContent += `[${robot ? NOMBRE[robot.id] : 'APP'}] ${texto}\n`;
    if (pre.textContent.length > 20000) {
        pre.textContent = pre.textContent.slice(-15000);
    }
    pre.scrollTop = pre.scrollHeight;
    console.log('[BRICKSUMO]', robot ? NOMBRE[robot.id] : 'APP', texto);
}

function suceso(robotId, texto) {
    const li = document.createElement('li');
    const t = document.createElement('span');
    t.className = 't';
    t.textContent = $('reloj').textContent;
    li.append(t);
    if (robotId) {
        const quien = document.createElement('span');
        quien.className = robotId;
        quien.textContent = `${NOMBRE[robotId]} `;
        li.append(quien);
    }
    li.append(texto);
    const lista = $('sucesos');
    lista.prepend(li);
    while (lista.children.length > 4) {
        lista.lastElementChild.remove();
    }
}

let temporizadorCartel = null;
function cartel(texto, detalle = '', ms = 1500) {
    const el = $('cartel');
    el.textContent = texto;
    if (detalle) {
        const s = document.createElement('small');
        s.textContent = detalle;
        el.append(s);
    }
    el.hidden = false;
    clearTimeout(temporizadorCartel);
    temporizadorCartel = setTimeout(() => {
        el.hidden = true;
    }, ms);
}

// ---------- Radar (tatami Ø 100 cm a escala) ----------
const K = 196 / 500; // píxeles por milímetro
const CX = 360;
const CY = 210;

function el(tag, attrs, padre) {
    const e = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) {
        e.setAttribute(k, String(v));
    }
    padre?.append(e);
    return e;
}

const sprites = {};
function dibujarRadar() {
    const svg = $('radar');
    const defs = el('defs', {}, svg);
    const g = el('linearGradient', { id: 'barrido', x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
    el('stop', { offset: 0, 'stop-color': '#6FF0A6', 'stop-opacity': 0 }, g);
    el('stop', { offset: 1, 'stop-color': '#6FF0A6', 'stop-opacity': 0.28 }, g);

    el('rect', { x: 110, y: 0, width: 500, height: 420, rx: 16, fill: '#120B05' }, svg);
    el('circle', { cx: CX, cy: CY, r: 500 * K, fill: '#1A1F1A' }, svg);
    el('circle', { cx: CX, cy: CY, r: 475 * K, fill: 'none', stroke: '#FF5A6A', 'stroke-width': 50 * K }, svg);
    for (const [rc, color] of [[150, '#3DDC84'], [300, '#4C8DFF'], [400, '#FFD23F']]) {
        el('circle', { cx: CX, cy: CY, r: rc * K, fill: 'none', stroke: color, 'stroke-width': 25 * K, opacity: 0.85 }, svg);
    }
    for (const a of [0, 90, 180, 270]) {
        for (const [r1, r2] of [[162.5, 287.5], [312.5, 387.5], [412.5, 450]]) {
            el('rect', {
                x: r1 * K, y: -10 * K, width: (r2 - r1) * K, height: 20 * K,
                fill: '#0B0B0B', stroke: '#3A3A3A', 'stroke-width': 0.8,
                transform: `translate(${CX} ${CY}) rotate(${a})`,
            }, svg);
        }
    }
    for (const x of [-60, 45]) {
        el('rect', { x: CX + x * K, y: CY - 50 * K, width: 15 * K, height: 100 * K, fill: '#BDBDBD', opacity: 0.7 }, svg);
    }
    el('path', { class: 'barrido', d: `M${CX} ${CY} L${CX + 196} ${CY} A196 196 0 0 0 ${CX + 138} ${CY - 139} Z`, fill: 'url(#barrido)' }, svg);

    // Posición fija en las líneas de salida hasta la capa 4 (posición real).
    sprites.azul = robotSvg(svg, CX - 150 * K, CY, 90, '#4C8DFF', '#2C5BB8', '1');
    sprites.amarillo = robotSvg(svg, CX + 150 * K, CY, -90, '#FFD23F', '#B8901A', '2');

    const txt = el('g', { 'font-family': "'Kosugi Maru', sans-serif", 'font-size': 12, fill: '#CDBB9C' }, svg);
    el('text', { x: 122, y: 398 }, txt).textContent = 'RADAR · TATAMI Ø 100 cm';
    el('text', { x: 598, y: 398, 'text-anchor': 'end' }, txt).textContent = 'posición real: capa 4 (ahora, en la salida)';
}

function robotSvg(svg, x, y, rumbo, color, oscuro, etiqueta) {
    const g = el('g', { class: 'robot desconectado', transform: `translate(${x} ${y}) rotate(${rumbo})` }, svg);
    el('rect', { x: -22, y: -30, width: 44, height: 60, rx: 8, fill: color, stroke: '#0B0F1B', 'stroke-width': 3 }, g);
    el('rect', { x: -30, y: -20, width: 8, height: 22, rx: 2, fill: '#1B1B1B' }, g);
    el('rect', { x: 22, y: -20, width: 8, height: 22, rx: 2, fill: '#1B1B1B' }, g);
    el('rect', { x: -12, y: -12, width: 24, height: 24, rx: 4, fill: oscuro }, g);
    const t = el('text', { x: 0, y: 5, 'text-anchor': 'middle', 'font-family': "'Darumadrop One', cursive", 'font-size': 14, fill: '#F5ECDD', transform: `rotate(${-rumbo})` }, g);
    t.textContent = etiqueta;
    el('circle', { cx: -8, cy: -34, r: 4, fill: '#EEF1FA', stroke: '#0B0F1B', 'stroke-width': 2 }, g);
    el('circle', { cx: 8, cy: -34, r: 4, fill: '#EEF1FA', stroke: '#0B0F1B', 'stroke-width': 2 }, g);
    el('rect', { x: -4, y: -62, width: 8, height: 26, rx: 3, fill: '#C9CED9', stroke: '#0B0F1B', 'stroke-width': 2 }, g);
    return g;
}

// ---------- Mensajes de los robots ----------
function alLinea(robot, crudo) {
    const linea = crudo.trim();
    // Código fuente del hub (respuesta a DAMESCRIPT): se guarda con su sangría, no se vuelca al registro
    if (robot.scriptLineas) {
        if (linea === 'SCRIPTFIN') {
            guardarScript(robot, robot.scriptLineas.join('\n') + '\n');
            robot.scriptLineas = null;
            registrar(robot, 'Script recibido del hub. Pulsa "Descargar script".');
        } else {
            robot.scriptLineas.push(crudo.replace(/\s+$/, ''));
        }
        return;
    }
    if (!linea) return;
    if (linea.startsWith('SCRIPT ')) {
        robot.scriptLineas = [];
        return;
    }
    if (linea.startsWith('T ')) {
        telemetria(robot, linea);
        return;
    }
    registrar(robot, linea);
    let m;
    if ((m = linea.match(/^OK hackeado: ([a-z ]+?) \d+ ms/))) {
        suceso(robot.id, `recibe hackeo: ${m[1]}`);
        cartel(m[1].toUpperCase(), `hackeo a ${NOMBRE[robot.id]}`);
    } else if ((m = linea.match(/^OK lanzando HACK_(\d)/))) {
        suceso(robot.id, `lanza ${HACKEOS[Number(m[1])] ?? 'hackeo'}`);
    } else if (linea.startsWith('OK fin del hackeo')) {
        suceso(robot.id, 'se libra del hackeo');
    } else if (linea.startsWith('ERR mando desconectado')) {
        suceso(robot.id, 'ha perdido el mando');
    } else if (linea.startsWith('OK mando conectado')) {
        suceso(robot.id, 'mando conectado');
    }
}

function telemetria(robot, linea) {
    const d = {};
    for (const par of linea.slice(2).split(' ')) {
        const i = par.indexOf('=');
        if (i > 0) {
            d[par.slice(0, i)] = par.slice(i + 1);
        }
    }
    if (d.modo) poner(robot, 'modo', d.modo);
    if (d.marcha) poner(robot, 'marcha', d.marcha);
    if (d.dist) {
        const mm = Number(d.dist);
        poner(robot, 'dist', mm >= 2000 ? 'nada' : `${mm} mm`, mm < 150);
    }
    if (d.arma) poner(robot, 'arma', `${d.arma}°`);
    if (d.vel) poner(robot, 'vel', `${d.vel} mm/s`);
    if (d.mando) poner(robot, 'mando', d.mando === '1' ? 'Sí' : 'No', d.mando !== '1');
    const caido = d.caido === '1';
    poner(robot, 'caido', caido ? '¡SÍ!' : 'No', caido);
    sprites[robot.id].classList.toggle('caido', caido);
    const hack = Number(d.hack ?? 0);
    poner(robot, 'hack', HACKEOS[hack] ?? '—', hack > 0);
    sprites[robot.id].classList.toggle('hackeado', hack > 0);
}

function alEvento(robot, evento) {
    if (evento.type === 'stdout') {
        robot.pendiente += robot.decoder.decode(evento.data, { stream: true });
        const lineas = robot.pendiente.split(/\r?\n/);
        robot.pendiente = lineas.pop() ?? '';
        for (const l of lineas) {
            // Pasamos la línea sin recortar: el código fuente necesita su sangría
            if (robot.scriptLineas || l.trim()) alLinea(robot, l);
        }
    } else if (evento.type === 'status') {
        const enMarcha = hasStatus(evento.flags, Status.UserProgramRunning);
        if (hasStatus(evento.flags, Status.BatteryLowVoltageWarning)) {
            poner(robot, 'conexion', 'Conectado · ¡batería baja!', true);
        }
        if (enMarcha !== robot.enMarcha) {
            robot.enMarcha = enMarcha;
            robot.telActivada = false;
            actualizarRobot(robot);
            if (enMarcha) {
                // Damos tiempo a que el programa arranque antes de pedir la telemetría.
                setTimeout(() => void activarTelemetria(robot), 1500);
            }
        }
    }
}

async function mandar(robot, texto) {
    if (!robot.session) return;
    const datos = encoder.encode(`${texto}\n`);
    const maximo = Math.max(1, (robot.session.info.capabilities?.maxWriteSize ?? 20) - 1);
    for (let i = 0; i < datos.length; i += maximo) {
        await robot.session.writeStdin(datos.subarray(i, i + maximo));
    }
}

async function activarTelemetria(robot) {
    if (!robot.session || !robot.enMarcha || robot.telActivada) return;
    try {
        await mandar(robot, 'TEL ON');
        robot.telActivada = true;
        registrar(robot, 'TEL ON enviado');
    } catch (e) {
        registrar(robot, `No se pudo activar la telemetría: ${e instanceof Error ? e.message : e}`);
    }
}

// ---------- Conectar ----------
function actualizarRobot(robot) {
    const boton = robot.placa.querySelector('.btn-conectar');
    const arrancar = robot.panel.querySelector('.btn-arrancar');
    const conectado = robot.session !== null;
    boton.textContent = conectado ? 'Desconectar' : `Conectar ${robot.id}`;
    boton.disabled = robot.ocupado;
    arrancar.hidden = !conectado || robot.enMarcha;
    const nombre = robot.session?.info.name || robot.device?.name || 'hub';
    const estado = !conectado ? 'Sin conectar' : robot.enMarcha ? `${nombre} · en marcha` : `${nombre} · programa parado`;
    for (const e of campo(robot, 'conexion')) {
        e.textContent = estado;
        e.classList.toggle('ok', conectado && robot.enMarcha);
    }
    sprites[robot.id]?.classList.toggle('desconectado', !conectado);
}

async function conectar(robot) {
    robot.ocupado = true;
    actualizarRobot(robot);
    try {
        const device = await requestPybricksBleDevice();
        if (device === null) return;
        const otro = robot.id === 'azul' ? robots.amarillo : robots.azul;
        if (otro.device && otro.device.id === device.id) {
            registrar(robot, `Ese hub ya está conectado como ${NOMBRE[otro.id]}.`);
            cartel('¡OJO!', `Ese hub ya es el ${NOMBRE[otro.id]}`);
            return;
        }
        registrar(robot, `Conectando con ${device.name ?? 'el hub'}…`);
        const transport = await BlePybricksTransport.connect(device);
        robot.device = device;
        robot.session = new HubSession(transport, {
            onProtocolError: (e) => registrar(robot, `Protocolo: ${e.message}`),
        });
        robot.session.onEvent((ev) => alEvento(robot, ev));
        device.addEventListener('gattserverdisconnected', () => alDesconectar(robot));
        registrar(robot, `Conectado: ${robot.session.info.name || device.name}, firmware ${robot.session.info.firmwareVersion}`);
        suceso(robot.id, 'conectado');
    } catch (e) {
        registrar(robot, `Error al conectar: ${e instanceof Error ? e.message : e}`);
        robot.session = null;
    } finally {
        robot.ocupado = false;
        actualizarRobot(robot);
        void activarTelemetria(robot);
    }
}

async function desconectar(robot) {
    const s = robot.session;
    robot.session = null;
    robot.enMarcha = false;
    try {
        await s?.disconnect();
    } catch (e) {
        registrar(robot, e instanceof Error ? e.message : String(e));
    }
    actualizarRobot(robot);
}

function alDesconectar(robot) {
    if (robot.session === null) return;
    robot.session = null;
    robot.enMarcha = false;
    registrar(robot, 'Se ha desconectado.');
    suceso(robot.id, 'se ha desconectado');
    actualizarRobot(robot);
}

async function pedirScript(robot) {
    if (!robot.session) {
        registrar(robot, 'Conecta el robot antes de pedir el script.');
        return;
    }
    try {
        registrar(robot, 'Pidiendo el script al hub…');
        await mandar(robot, 'DAMESCRIPT');
    } catch (e) {
        registrar(robot, `No se pudo pedir el script: ${e instanceof Error ? e.message : e}`);
    }
}

function guardarScript(robot, texto) {
    if (robot.scriptUrl) URL.revokeObjectURL(robot.scriptUrl);
    robot.scriptUrl = URL.createObjectURL(new Blob([texto], { type: 'text/x-python' }));
    const enlace = robot.panel.querySelector('.descargar-script');
    enlace.href = robot.scriptUrl;
    enlace.download = `hub_${robot.id}_script.py`;
    enlace.hidden = false;
}

async function arrancar(robot) {
    try {
        await robot.session?.startProgram();
        registrar(robot, 'Programa arrancado.');
    } catch (e) {
        registrar(robot, `No se pudo arrancar: ${e instanceof Error ? e.message : e}`);
    }
}

// ---------- Árbitro: reloj y puntos ----------
const combate = { estado: 'preparados', restante: 120, ultimo: 0, puntos: { azul: 0, amarillo: 0 }, historial: [] };

function formatoReloj(seg) {
    const s = Math.max(0, Math.ceil(seg));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function formatoPuntos(p) {
    const enteros = Math.floor(p);
    const medio = p - enteros >= 0.5;
    if (enteros === 0) return medio ? '½' : '0';
    return `${enteros}${medio ? '½' : ''}`;
}

function pintarCombate() {
    $('reloj').textContent = formatoReloj(combate.restante);
    const textos = { preparados: 'PREPARADOS', cuenta: '¡ATENCIÓN!', combate: 'EN COMBATE', pausa: 'PAUSA', fin: 'FIN' };
    $('estado-combate').textContent = textos[combate.estado];
    for (const id of ['azul', 'amarillo']) {
        $(`marcador-${id}`).textContent = formatoPuntos(combate.puntos[id]);
        poner(robots[id], 'puntos', `PUNTOS ${formatoPuntos(combate.puntos[id])}`);
    }
    $('hajime').disabled = combate.estado === 'combate' || combate.estado === 'cuenta' || combate.estado === 'fin';
    $('pausa').disabled = combate.estado !== 'combate' && combate.estado !== 'pausa';
    $('pausa').textContent = combate.estado === 'pausa' ? 'Seguir' : 'Pausa';
    $('deshacer').disabled = combate.historial.length === 0;
    $('duracion').disabled = combate.estado !== 'preparados';
}

function hajime() {
    if (combate.estado === 'preparados') {
        combate.restante = Number($('duracion').value);
    }
    combate.estado = 'cuenta';
    pintarCombate();
    let n = 3;
    const paso = () => {
        if (n > 0) {
            cartel(String(n), '', 900);
            n -= 1;
            setTimeout(paso, 1000);
        } else {
            cartel('¡HAJIME!', '', 1200);
            combate.estado = 'combate';
            combate.ultimo = performance.now();
            suceso(null, '¡Hajime! empieza el combate');
            pintarCombate();
        }
    };
    paso();
}

function terminar(motivo) {
    combate.estado = 'fin';
    const { azul, amarillo } = combate.puntos;
    let texto = 'EMPATE';
    if (azul > amarillo) texto = 'GANA AZUL';
    if (amarillo > azul) texto = 'GANA AMARILLO';
    cartel(texto, motivo, 6000);
    suceso(null, `${texto} (${motivo})`);
    pintarCombate();
}

function punto(id) {
    if (combate.estado === 'fin') return;
    combate.puntos[id] += 0.5;
    combate.historial.push(id);
    const ippon = combate.puntos[id] >= 1;
    cartel(ippon ? '¡IPPON!' : '¡WAZA-ARI!', `${NOMBRE[id]} · +½ punto`);
    suceso(id, 'waza-ari (punto manual)');
    pintarCombate();
    if (ippon) setTimeout(() => terminar('ippon'), 1600);
}

function deshacer() {
    const id = combate.historial.pop();
    if (!id) return;
    combate.puntos[id] -= 0.5;
    if (combate.estado === 'fin') combate.estado = combate.restante > 0 ? 'pausa' : 'fin';
    suceso(id, 'punto anulado');
    pintarCombate();
}

function reiniciar() {
    combate.estado = 'preparados';
    combate.restante = Number($('duracion').value);
    combate.puntos = { azul: 0, amarillo: 0 };
    combate.historial = [];
    $('sucesos').textContent = '';
    pintarCombate();
}

setInterval(() => {
    if (combate.estado !== 'combate') return;
    const ahora = performance.now();
    combate.restante -= (ahora - combate.ultimo) / 1000;
    combate.ultimo = ahora;
    if (combate.restante <= 0) {
        combate.restante = 0;
        terminar('se acabó el tiempo');
    }
    pintarCombate();
}, 200);

// ---------- Arranque ----------
dibujarRadar();
pintarCombate();
$('hajime').addEventListener('click', hajime);
$('pausa').addEventListener('click', () => {
    if (combate.estado === 'combate') {
        combate.estado = 'pausa';
    } else if (combate.estado === 'pausa') {
        combate.estado = 'combate';
        combate.ultimo = performance.now();
    }
    pintarCombate();
});
$('punto-azul').addEventListener('click', () => punto('azul'));
$('punto-amarillo').addEventListener('click', () => punto('amarillo'));
$('deshacer').addEventListener('click', deshacer);
$('reiniciar').addEventListener('click', reiniciar);
$('duracion').addEventListener('change', () => {
    combate.restante = Number($('duracion').value);
    pintarCombate();
});
$('limpiar').addEventListener('click', () => {
    $('registro').textContent = '';
});
$('copiar').addEventListener('click', () => {
    navigator.clipboard.writeText($('registro').textContent ?? '').catch(() => undefined);
});

for (const robot of Object.values(robots)) {
    actualizarRobot(robot);
    if (!('bluetooth' in navigator)) {
        robot.placa.querySelector('.btn-conectar').disabled = true;
        continue;
    }
    robot.placa.querySelector('.btn-conectar').addEventListener('click', () => {
        void (robot.session ? desconectar(robot) : conectar(robot));
    });
    robot.panel.querySelector('.btn-arrancar').addEventListener('click', () => void arrancar(robot));
    // Script del hub: pedirlo, descargarlo (el enlace aparece al recibirlo)
    const bloque = document.createElement('div');
    bloque.className = 'script-hub';
    bloque.innerHTML = '<button type="button" class="pedir-script secundario">Pedir script al hub</button> ' +
        '<a class="descargar-script" hidden>Descargar script</a>';
    robot.panel.appendChild(bloque);
    bloque.querySelector('.pedir-script').addEventListener('click', () => void pedirScript(robot));
}
if (!('bluetooth' in navigator)) {
    $('aviso-navegador').hidden = false;
}
