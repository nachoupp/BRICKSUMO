# ╔════════════════════════════════════════════════════════════╗
# ║        🎮  SUMO MASTER v2 · CONSOLA DE PROGRAMACIÓN  🎮      ║
# ║                                                            ║
# ║   Solo puedes cambiar los números marcados con  ◄◄         ║
# ║   Cada uno tiene su RANGO SEGURO  [mínimo … máximo]        ║
# ║   Si te sales del rango, el robot pita, muestra «!»        ║
# ║   y usa el límite más cercano.                             ║
# ║                                                            ║
# ║   También puedes cambiarlos sin tocar el código:           ║
# ║   · Modo ingeniero: mantén el botón Bluetooth 1,5 s        ║
# ║   · Terminal de Pybricks Code: escribe AYUDA e Intro       ║
# ║   · App BRICKSUMO: con los deslizadores                    ║
# ║                                                            ║
# ║   Interruptores:  1 = SÍ   ·   0 = NO                      ║
# ╚════════════════════════════════════════════════════════════╝


# ┌─── 🤖 NIVEL 1 · TU ROBOT ───────────────────────────────────┐

# 🔧 TIPO DE ROBOT ─ qué arma lleva montada
#    RANGO [1 … 2]
#    1 = martillo (motor en D)  ·  2 = elevador (C) y pala (D)
#    ⚠ Después de cambiarlo, vuelve a ejecutar el programa
TIPO_DE_BOT = 1                # ◄◄


# ┌─── 🏎️ NIVEL 2 · MOVIMIENTO (MARCHAS) ───────────────────────┐
#    El botón rojo derecho del mando cambia de marcha (modo verde)

# 1️⃣ MARCHA 1 · PRECISIÓN ─ para colocarse con cuidado
#    RANGO [50 … 1000] mm/s
#    50 = paso de tortuga · 150 = andar despacio · 1000 = a tope
MARCHA_1 = 150                 # ◄◄

# 2️⃣ MARCHA 2 · NORMAL ─ para moverse por el tatami
#    RANGO [50 … 1000] mm/s
MARCHA_2 = 300                 # ◄◄

# 3️⃣ MARCHA 3 · ¡ATAQUE! ─ para embestir
#    RANGO [50 … 1000] mm/s
#    ⬆ más: empuja con fuerza pero cuesta controlarlo
MARCHA_3 = 800                 # ◄◄

# 🚀 ACELERACIÓN ─ cuánto tarda en coger velocidad
#    RANGO [100 … 1000] mm/s²
#    100 = arranca suave · 1000 = arranca de golpe
#    ⬆ más: reacciona rápido pero puede patinar o levantar el morro
ACELERACION = 500              # ◄◄

# 🙃 CONDUCIR VOLCADO ─ ¿se mueven las ruedas si está tumbado?
#    RANGO [0 … 1]   1 = sí, para intentar levantarse · 0 = no, se para
OPERAR_TUMBADO = 1             # ◄◄


# ┌─── 🔨 NIVEL 3 · ARMAS ──────────────────────────────────────┐

# ── Arma A · MARTILLO (si TIPO_DE_BOT = 1) ──

# 💥 VELOCIDAD DEL GOLPE
#    RANGO [500 … 1000] grados por segundo
#    ⬆ más: golpe más fuerte  ⬇ menos: golpe más controlado
VELOCIDAD_GOLPE = 1000         # ◄◄

# 📐 RECORRIDO DEL GOLPE ─ cuánto baja el martillo
#    RANGO [45 … 180] grados
#    45 = golpecito · 90 = un cuarto de vuelta · 180 = golpe completo
ANGULO_GOLPE = 180             # ◄◄

# ── Arma B · ELEVADOR Y PALA (si TIPO_DE_BOT = 2) ──

# ⏫ VELOCIDAD DEL ELEVADOR       RANGO [100 … 800] grados por segundo
VELOCIDAD_ELEVADOR = 400       # ◄◄

# 🥄 VELOCIDAD DE LA PALA         RANGO [100 … 800] grados por segundo
VELOCIDAD_PALA = 400           # ◄◄

# 📏 ALTURA DEL ELEVADOR ─ posiciones en grados desde abajo
#    RANGO [0 … 350]   0 = abajo del todo · 320 = arriba del todo
LIFT_HIGH_POS = 320            # ◄◄  arriba (al atacar)
LIFT_LOW_POS = 0               # ◄◄  abajo (en reposo)

# 🥄 POSICIÓN DE LA PALA ─ grados
#    RANGO [-100 … 50]   negativo = hacia arriba · positivo = hacia abajo
SCOOP_READY_POS = -5           # ◄◄  lista para cargar
SCOOP_DUMP_POS = 10            # ◄◄  volcando

# ⏱️ TIEMPO ARRIBA ─ cuánto aguanta el elevador arriba antes de bajar
#    RANGO [0 … 2000] ms  (1000 ms = 1 segundo)
TIEMPO_ARRIBA = 500            # ◄◄


# ┌─── 👁️ NIVEL 4 · SENSOR DE SUELO (puerto B) ─────────────────┐

# 🛡️ ¿HAY SENSOR DE SUELO? ─ para no salirse del tatami
#    RANGO [0 … 1]   1 = sí, está en el puerto B · 0 = no hay
#    ⚠ Después de cambiarlo, vuelve a ejecutar el programa
USA_SENSOR_SUELO = 0           # ◄◄

# 🔍 CÓMO DETECTA EL BORDE
#    RANGO [1 … 2]   1 = por luz (borde claro) · 2 = por color blanco
MODO_BORDE = 1                 # ◄◄

# 💡 UMBRAL DE LUZ ─ a partir de cuánta luz cree que hay borde (si MODO_BORDE = 1)
#    RANGO [10 … 90] %
#    ⬆ más: solo frena en bordes muy claros  ⬇ menos: frena antes, quizá sin motivo
UMBRAL_LUZ_BORDE = 35          # ◄◄


# ┌─── ⚔️ NIVEL 5 · MODOS DE COMBATE ───────────────────────────┐
#    El botón verde del mando cambia de modo:
#    🟢 1 manual · 🟠 2 evasión · 🟣 3 radar · 🔵 4 hacker

# 🟠 MODO 2 · EVASIÓN ─ cuánto gira para esquivar
#    RANGO [45 … 360] grados
#    45 = giro corto · 180 = media vuelta · 360 = vuelta entera
#    ⬆ más: esquiva mejor pero tarda más  ⬇ menos: rápido pero esquiva poco
M2_ANGULO_EVASION = 180        # ◄◄

# 🟣 MODO 3 · RADAR ─ a qué distancia ataca él solo
#    RANGO [50 … 500] mm
#    50 = casi tocando · 150 = un palmo · 500 = medio tatami
#    ⬆ más: golpea antes pero puede fallar  ⬇ menos: acierta pero llega tarde
M3_DISTANCIA_ATAQUE = 150      # ◄◄

# 🟣 MODO 3 · ESCANEO ─ velocidad de giro buscando rival (botón rojo izquierdo)
#    RANGO [50 … 800] grados por segundo
#    ⬆ más: encuentra antes pero se puede pasar de largo
M3_VELOCIDAD_ESCANEO = 300     # ◄◄

# 🟣 MODO 3 · PITIDO DEL RADAR ─ pita más rápido cuanto más cerca está el rival
#    RANGO [0 … 1]   1 = pita · 0 = silencio
M3_PITIDO_SONAR = 1            # ◄◄

# 🔵 MODO 4 · HACKER ─ qué hackeo envía al rival
#    RANGO [1 … 5]
#    1 = niebla · 2 = barro · 3 = mando loco · 4 = arma dormida · 5 = congelado
M4_TIPO_HACK = 5               # ◄◄


# ┌─── 👾 NIVEL 5b · HACKEOS RECIBIDOS ─────────────────────────┐
#    Cuánto dura cada hackeo cuando TE lo lanzan (milisegundos: 1000 = 1 segundo)

# 🌫️ NIEBLA ─ tu radar no ve nada      RANGO [1000 … 5000] ms
H_NIEBLA = 3000                # ◄◄

# 🟤 BARRO ─ vas a media velocidad      RANGO [1000 … 5000] ms
H_BARRO = 3000                 # ◄◄

# 🔀 MANDO LOCO ─ el giro va al revés   RANGO [1000 … 5000] ms
H_LOCO = 3000                  # ◄◄

# 💤 ARMA DORMIDA ─ martillo o pala no funcionan   RANGO [1000 … 6000] ms
H_ARMA = 4000                  # ◄◄

# 🧊 CONGELADO ─ te quedas quieto del todo
#    RANGO [500 … 3000] ms   ⚠ si dura mucho, el combate deja de ser divertido
H_CONGELADO = 1500             # ◄◄


# ┌─── 🔊 NIVEL 6 · PERSONALIDAD ───────────────────────────────┐

# 🔈 VOLUMEN                      RANGO [0 … 10]   0 = mudo · 10 = máximo
VOLUMEN_GENERAL = 2            # ◄◄

# 🔧 PITIDO AL ENTRAR EN MODO INGENIERO     RANGO [0 … 1]
PITIDO_INGENIERO = 1           # ◄◄

# ⏳ CUENTA ATRÁS DE KO ─ segundos al volcar (como en un combate)
#    RANGO [3 … 20] segundos
SEGUNDOS_KO = 9                # ◄◄


# ╔════════════════════════════════════════════════════════════╗
# ║   ⛔  NO TOCAR A PARTIR DE AQUÍ · MOTOR DEL JUEGO  ⛔        ║
# ║   El código de abajo usa los números de arriba.            ║
# ╚════════════════════════════════════════════════════════════╝

from pybricks.hubs import PrimeHub          # PrimeHub sirve también para Robot Inventor
from pybricks.pupdevices import Motor, ColorSensor, UltrasonicSensor, Remote
from pybricks.parameters import Port, Direction, Color, Side, Icon, Button
from pybricks.robotics import DriveBase
from pybricks.tools import wait, StopWatch, Matrix
from usys import stdin
from uselect import poll
import ustruct

# ---------------- TABLA DE RANGOS SEGUROS ----------------
# (nombre, mínimo, máximo, unidad, qué hace, ¿necesita reiniciar?)
# Es una lista para conservar el orden de la consola. Esta tabla vigila los números de la consola y la usan la terminal y la app.
RANGOS = [
    ("TIPO_DE_BOT",           1, 2, "", "1 = martillo, 2 = elevador y pala", True),
    ("MARCHA_1",              50, 1000, "mm/s", "marcha 1: precisión", False),
    ("MARCHA_2",              50, 1000, "mm/s", "marcha 2: normal", False),
    ("MARCHA_3",              50, 1000, "mm/s", "marcha 3: ¡ataque!", False),
    ("ACELERACION",           100, 1000, "mm/s²", "aceleración de las ruedas", False),
    ("OPERAR_TUMBADO",        0, 1, "", "¿se mueven las ruedas si está volcado?", False),
    ("VELOCIDAD_GOLPE",       500, 1000, "deg/s", "rapidez del martillo", False),
    ("ANGULO_GOLPE",          45, 180, "deg", "recorrido del martillo", False),
    ("VELOCIDAD_ELEVADOR",    100, 800, "deg/s", "velocidad del elevador", False),
    ("VELOCIDAD_PALA",        100, 800, "deg/s", "velocidad de la pala", False),
    ("LIFT_HIGH_POS",         0, 350, "deg", "elevador arriba", False),
    ("LIFT_LOW_POS",          0, 350, "deg", "elevador abajo", False),
    ("SCOOP_READY_POS",       -100, 50, "deg", "pala lista", False),
    ("SCOOP_DUMP_POS",        -100, 50, "deg", "pala volcando", False),
    ("TIEMPO_ARRIBA",         0, 2000, "ms", "tiempo con el elevador arriba", False),
    ("USA_SENSOR_SUELO",      0, 1, "", "¿hay sensor de color en el puerto B?", True),
    ("MODO_BORDE",            1, 2, "", "1 = por luz, 2 = por color blanco", False),
    ("UMBRAL_LUZ_BORDE",      10, 90, "%", "luz a partir de la que hay borde", False),
    ("M2_ANGULO_EVASION",     45, 360, "deg", "giro de evasión (modo naranja)", False),
    ("M3_DISTANCIA_ATAQUE",   50, 500, "mm", "golpe automático (modo magenta)", False),
    ("M3_VELOCIDAD_ESCANEO",  50, 800, "deg/s", "giro al escanear (modo magenta)", False),
    ("M3_PITIDO_SONAR",       0, 1, "", "¿pita el radar?", False),
    ("M4_TIPO_HACK",          1, 5, "", "1 niebla, 2 barro, 3 mando loco, 4 arma dormida, 5 congelado", False),
    ("H_NIEBLA",              1000, 5000, "ms", "duración de la niebla (radar ciego)", False),
    ("H_BARRO",               1000, 5000, "ms", "duración del barro (media velocidad)", False),
    ("H_LOCO",                1000, 5000, "ms", "duración del mando loco (giro al revés)", False),
    ("H_ARMA",                1000, 6000, "ms", "duración del arma dormida", False),
    ("H_CONGELADO",           500, 3000, "ms", "duración del congelado", False),
    ("VOLUMEN_GENERAL",       0, 10, "", "volumen del altavoz", False),
    ("PITIDO_INGENIERO",      0, 1, "", "¿pita al entrar en modo ingeniero?", False),
    ("SEGUNDOS_KO",           3, 20, "s", "cuenta atrás al volcar", False),
]

# Une cada número de la consola con su rango: AJUSTES[nombre] = [valor, mín, máx, unidad, texto, reinicio]
_consola = globals()
AJUSTES = {r[0]: [_consola[r[0]]] + list(r[1:]) for r in RANGOS}
NOMBRES = [r[0] for r in RANGOS]           # orden fijo: el de la consola de arriba

# Datos fijos del robot (no cambian en marcha)
PROGRAMA        = "sumo_master_v2"  # nombre del programa: la app lo lee con VER
DIAMETRO_RUEDA  = 56               # mm
ANCHO_EJE       = 112              # mm (distancia entre centros de rueda): ¡mídelo en tu robot!
CANAL_BROADCAST = 66               # canal Bluetooth del modo hacker (todos los robots igual)
COLOR_DEL_BORDE = Color.WHITE      # color del borde si MODO_BORDE = 2
COLORES_MODO    = [Color.GREEN, Color.ORANGE, Color.MAGENTA, Color.BLUE]
NOMBRES_MODO    = ["manual", "evasion", "radar", "hacker"]

def aj(nombre):
    """Valor actual de un ajuste."""
    return AJUSTES[nombre][0]

def marcha(n):
    return aj("MARCHA_" + str(n))

ORIGINALES = {n: d[0] for n, d in AJUSTES.items()}    # para RESET

# ==============================================================================
# 💾 MEMORIA FLASH (los ajustes sobreviven al apagado)
# ==============================================================================
hub = PrimeHub(broadcast_channel=CANAL_BROADCAST, observe_channels=[CANAL_BROADCAST])

FORMATO = "<" + "h" * (len(NOMBRES) + 2)     # firma + huella + un entero por ajuste
FIRMA = 8100 + len(NOMBRES)                  # cambia sola si añades o quitas ajustes

def huella():
    """Resumen de los números escritos en la consola de arriba.
    Si alguien los edita, la huella cambia y se ignora lo guardado."""
    return sum(ORIGINALES[n] * (i + 1) for i, n in enumerate(NOMBRES)) % 30000

def cargar():
    datos = ustruct.unpack(FORMATO, hub.system.storage(0, read=ustruct.calcsize(FORMATO)))
    if datos[0] != FIRMA or datos[1] != huella():
        return False                         # nada guardado, o el código se ha editado después
    for nombre, valor in zip(NOMBRES, datos[2:]):
        AJUSTES[nombre][0] = valor
    return True

def guardar():
    hub.system.storage(0, write=ustruct.pack(FORMATO, FIRMA, huella(), *[aj(n) for n in NOMBRES]))

if cargar():
    print("OK usando los ajustes guardados en el hub (escribe RESET para volver a los del código)")
else:
    print("OK usando los números de la consola del programa")

def revisar_rangos():
    """Si un número de la consola se sale de su rango, usa el límite y avisa."""
    fuera = False
    for n in NOMBRES:
        v, mn, mx = AJUSTES[n][0], AJUSTES[n][1], AJUSTES[n][2]
        if not isinstance(v, int) or v < mn or v > mx:
            seguro = mn if (not isinstance(v, int) or v < mn) else mx
            print("AVISO {}={} está fuera de rango [{}…{}], uso {}".format(n, v, mn, mx, seguro))
            AJUSTES[n][0] = seguro
            fuera = True
    if fuera:
        hub.display.char("!")
        hub.speaker.beep(300, 600)
        wait(1500)

revisar_rangos()

# ==============================================================================
# 🛠️ INICIALIZACIÓN SEGURA DEL HARDWARE
# ==============================================================================
TIPO = aj("TIPO_DE_BOT")                     # se fija al arrancar
hub.speaker.volume(aj("VOLUMEN_GENERAL") * 10)

def obligatorio(letra, crear):
    """Crea un motor/sensor; si falta, muestra la letra del puerto y espera."""
    try:
        return crear()
    except OSError:
        hub.light.on(Color.RED)
        hub.display.char(letra)              # p. ej. "D" = revisa el puerto D
        hub.speaker.beep(200, 500)
        print("ERR falta el dispositivo del puerto", letra)
        while True:
            wait(1000)                       # parar con el botón central del hub

mot_izq = obligatorio("F", lambda: Motor(Port.F, Direction.COUNTERCLOCKWISE))
mot_der = obligatorio("E", lambda: Motor(Port.E, Direction.CLOCKWISE))
db = DriveBase(mot_izq, mot_der, DIAMETRO_RUEDA, ANCHO_EJE)
sensor_ojos = obligatorio("A", lambda: UltrasonicSensor(Port.A))
sensor_ojos.lights.on(50)

arma_motor = elevador_motor = pala_motor = None
if TIPO == 1:
    arma_motor = obligatorio("D", lambda: Motor(Port.D))
    arma_motor.reset_angle(0)                # el martillo debe arrancar en reposo
else:
    elevador_motor = obligatorio("C", lambda: Motor(Port.C))
    pala_motor = obligatorio("D", lambda: Motor(Port.D))
    elevador_motor.reset_angle(0)            # elevador abajo y pala lista al arrancar
    pala_motor.reset_angle(0)

sensor_suelo = None
if aj("USA_SENSOR_SUELO"):
    try:
        sensor_suelo = ColorSensor(Port.B)
    except OSError:                          # opcional: avisa y sigue sin él
        print("ERR sensor de suelo activado pero no está en el puerto B")
        hub.display.char("?"); hub.speaker.beep(200, 500); wait(1000)

def aplicar():
    """Lleva los ajustes a los sitios que no se leen en cada vuelta."""
    hub.speaker.volume(aj("VOLUMEN_GENERAL") * 10)
    db.settings(marcha(2), aj("ACELERACION"), marcha(2), aj("ACELERACION"))

aplicar()
print("OK hardware listo. Tipo de bot:", TIPO)

# ==============================================================================
# 🖥️ CONSOLA (terminal de Pybricks Code o app BRICKSUMO)
# ==============================================================================
teclado = poll()
teclado.register(stdin)
linea = ""
telemetria = False

# --- Mando desde la app (joystick y botones) ---
HOMBRE_MUERTO = 500                          # ms sin órdenes J -> el robot se para
app_avance = app_giro = 0                    # -100..100 % (orden J)
reloj_app = StopWatch()

def describir(n):
    v, mn, mx, unidad, texto, reinicio = AJUSTES[n]
    return "A {}={} min={} max={} unidad={} reinicio={} | {}".format(
        n, v, mn, mx, unidad or "-", int(reinicio), texto)

def ejecutar(orden):
    """Interpreta una línea de texto. Responde siempre con OK o ERR."""
    global telemetria, app_avance, app_giro, marcha_actual
    partes = orden.upper().split()
    if not partes:
        return
    cmd = partes[0]
    if cmd in ("AYUDA", "?"):
        print("OK órdenes: GET | SET NOMBRE VALOR | SAVE | LOAD | RESET | DESC | TEL ON/OFF | VER | GOLPE | MODO 1-4 | HACK 1-5 (probar un hackeo)")
        print("OK app: J avance giro (-100..100, se para si no llega otra en 0,5 s) | B1 golpe | B2 modo | B3 especial | B4 marcha")
    elif cmd == "GET":
        print("OK " + " ".join("{}={}".format(n, aj(n)) for n in NOMBRES))
    elif cmd == "DESC":                      # la app lo usa para crear los deslizadores
        for n in NOMBRES:
            print(describir(n))
        print("OK fin")
    elif cmd == "SET" and len(partes) == 3:
        n = partes[1]
        if n not in AJUSTES:
            print("ERR no existe", n); return
        try:
            valor = int(partes[2])
        except ValueError:
            print("ERR el valor debe ser un número entero"); return
        mn, mx = AJUSTES[n][1], AJUSTES[n][2]
        if valor < mn or valor > mx:
            print("ERR", n, "va de", mn, "a", mx); return
        AJUSTES[n][0] = valor
        aplicar()
        aviso = " (se aplica al reiniciar: SAVE y vuelve a ejecutar)" if AJUSTES[n][5] else " (sin guardar: escribe SAVE)"
        print("OK {}={}{}".format(n, valor, aviso))
    elif cmd == "SAVE":
        guardar(); hub.speaker.beep(2000, 100)
        print("OK guardado en el hub")
    elif cmd == "LOAD":
        print("OK cargado" if cargar() else "ERR no hay nada guardado")
        aplicar()
    elif cmd == "RESET":
        for n in NOMBRES:
            AJUSTES[n][0] = ORIGINALES[n]
        aplicar()
        print("OK valores del programa (escribe SAVE para guardarlos)")
    elif cmd == "VER":                       # la app pregunta qué programa lleva el hub
        print("OK ver", PROGRAMA, "tipo=" + str(TIPO))
    elif cmd == "TEL" and len(partes) == 2:
        telemetria = partes[1] == "ON"
        print("OK telemetría", "activada" if telemetria else "desactivada")
    elif cmd == "GOLPE":
        print("OK arma" if efecto != 4 else "OK arma dormida: no golpea"); accionar_arma()
    elif cmd == "J" and len(partes) == 3:   # joystick de la app: sin respuesta, llega 10-20 veces/s
        try:
            app_avance = max(-100, min(100, int(partes[1])))
            app_giro = max(-100, min(100, int(partes[2])))
            reloj_app.reset()
        except ValueError:
            print("ERR J necesita dos números enteros")
    elif cmd == "B1":                        # botón GOLPE de la app
        print("OK golpe" if efecto != 4 else "OK arma dormida: no golpea"); accionar_arma()
    elif cmd == "B2":                        # botón MODO de la app
        set_modo(modo_actual % 4 + 1); print("OK modo", NOMBRES_MODO[modo_actual - 1])
    elif cmd == "B3":                        # botón ESPECIAL: depende del modo
        if modo_actual == 2:
            evadir(); print("OK evasion")
        elif modo_actual == 4:
            lanzar_hack()
        else:
            print("OK B3 no hace nada en este modo")
    elif cmd == "B4":                        # botón MARCHA de la app
        marcha_actual = marcha_actual % 3 + 1
        hub.speaker.beep(500 + marcha_actual * 200, 100)
        print("OK marcha", marcha_actual)
    elif cmd == "HACK" and len(partes) == 2 and partes[1] in ("1", "2", "3", "4", "5"):
        recibir_hack(int(partes[1]))         # prueba: el robot se hackea a sí mismo
    elif cmd == "MODO" and len(partes) == 2 and partes[1] in ("1", "2", "3", "4"):
        set_modo(int(partes[1])); print("OK modo", NOMBRES_MODO[modo_actual - 1])
    else:
        print("ERR orden desconocida:", orden, "(escribe AYUDA)")

def leer_consola():
    """Junta letras hasta Intro sin parar el robot."""
    global linea
    while teclado.poll(0):
        c = stdin.read(1)
        if c in ("\r", "\n"):
            if linea:
                if not linea.upper().startswith("J "):
                    print(">", linea)        # eco de lo recibido (no del joystick: llega muchas veces)
                ejecutar(linea)
            linea = ""
        elif len(linea) < 60:
            linea += c

# ==============================================================================
# 🔢 NÚMEROS "ANTON" (modo actual en grande)
# ==============================================================================
NUMEROS_ANTON = {
    1: Matrix([[0,0,100,0,0],[0,100,100,0,0],[0,0,100,0,0],[0,0,100,0,0],[0,100,100,100,0]]),
    2: Matrix([[0,100,100,100,0],[0,0,0,100,0],[0,100,100,100,0],[0,100,0,0,0],[0,100,100,100,0]]),
    3: Matrix([[0,100,100,100,0],[0,0,0,100,0],[0,0,100,100,0],[0,0,0,100,0],[0,100,100,100,0]]),
    4: Matrix([[0,100,0,100,0],[0,100,0,100,0],[0,100,100,100,0],[0,0,0,100,0],[0,0,0,100,0]]),
}

def mostrar_numero_anton(numero):
    if numero in NUMEROS_ANTON:
        hub.display.icon(NUMEROS_ANTON[numero])
    else:
        hub.display.number(numero)

# ==============================================================================
# 🎮 MANDO
# ==============================================================================
def conectar_mando(espera_ms):
    try:
        return Remote(timeout=espera_ms)
    except OSError:
        return None

mando = None                                 # se conecta justo antes del bucle principal

# ==============================================================================
# ⚙️ FUNCIONES DE COMBATE (sin bloquear la conducción)
# ==============================================================================
estado_pala = None                           # None, "subiendo" o "arriba"
reloj_pala = StopWatch()

def accionar_arma():
    """Lanza el ataque y vuelve enseguida al bucle (la vuelta a reposo es automática)."""
    global estado_pala
    if efecto == 4:                          # 💤 ARMA DORMIDA: no hace nada
        hub.speaker.beep(150, 80)
        return
    if arma_motor:
        arma_motor.run_target(aj("VELOCIDAD_GOLPE"), aj("ANGULO_GOLPE"), wait=False)
    elif elevador_motor and estado_pala is None:
        pala_motor.run_target(aj("VELOCIDAD_PALA"), aj("SCOOP_DUMP_POS"), wait=False)
        elevador_motor.run_target(aj("VELOCIDAD_ELEVADOR"), aj("LIFT_HIGH_POS"), wait=False)
        estado_pala = "subiendo"

def vigilar_arma():
    """Se llama en cada vuelta: devuelve el arma a reposo cuando toca."""
    global estado_pala
    if arma_motor:
        if arma_motor.done() and abs(arma_motor.angle()) > 20:
            arma_motor.run_target(aj("VELOCIDAD_GOLPE"), 0, wait=False)
    elif estado_pala == "subiendo" and elevador_motor.done():
        estado_pala = "arriba"; reloj_pala.reset()
    elif estado_pala == "arriba" and reloj_pala.time() > aj("TIEMPO_ARRIBA"):
        elevador_motor.run_target(aj("VELOCIDAD_ELEVADOR"), aj("LIFT_LOW_POS"), wait=False)
        pala_motor.run_target(aj("VELOCIDAD_PALA"), aj("SCOOP_READY_POS"), wait=False)
        estado_pala = None

# ==============================================================================
# 👾 HACKEOS RECIBIDOS (no bloquean: el efecto dura unos segundos y se quita solo)
# ==============================================================================
# Código por Bluetooth -> número de hackeo: 1 niebla, 2 barro, 3 mando loco, 4 arma dormida, 5 congelado
CODIGOS_HACK = {"HACK_1": 1, "HACK_2": 2, "HACK_3": 3, "HACK_4": 4, "HACK_5": 5}
NOMBRES_HACK = ["", "niebla", "barro", "mando loco", "arma dormida", "congelado"]
DURACION_HACK = ["", "H_NIEBLA", "H_BARRO", "H_LOCO", "H_ARMA", "H_CONGELADO"]
DIBUJOS_HACK = [None,
    Matrix([[50,0,50,0,50],[0,50,0,50,0],[50,0,50,0,50],[0,50,0,50,0],[50,0,50,0,50]]),            # niebla
    Matrix([[0,0,0,0,0],[0,0,0,0,0],[0,40,0,40,0],[40,100,40,100,40],[100,100,100,100,100]]),    # barro
    Matrix([[100,0,0,0,100],[0,100,0,100,0],[0,0,100,0,0],[0,100,0,100,0],[100,0,0,0,100]]),     # mando loco
    Matrix([[100,100,100,0,0],[0,0,100,0,0],[0,100,0,0,0],[100,100,100,0,0],[0,0,0,0,0]]),       # arma dormida (Z)
    Matrix([[100,0,100,0,100],[0,100,100,100,0],[100,100,100,100,100],[0,100,100,100,0],[100,0,100,0,100]]),  # congelado
]
efecto = 0                                   # 0 = sin hackeo; 1..5 = hackeo activo
reloj_efecto = StopWatch()

def recibir_hack(n):
    """Activa el hackeo n durante su tiempo. El bucle principal aplica el efecto."""
    global efecto
    efecto = n
    reloj_efecto.reset()
    hub.display.icon(DIBUJOS_HACK[n])
    hub.speaker.beep(300, 150)
    if n == 5:
        db.stop()
    print("OK hackeado:", NOMBRES_HACK[n], aj(DURACION_HACK[n]), "ms")

def vigilar_efecto():
    """Se llama en cada vuelta: quita el hackeo cuando se acaba su tiempo."""
    global efecto
    if efecto and reloj_efecto.time() > aj(DURACION_HACK[efecto]):
        print("OK fin del hackeo:", NOMBRES_HACK[efecto])
        efecto = 0
        hub.speaker.beep(1500, 80)
        set_modo(modo_actual)                # restaurar pantalla y luces

def hay_borde():
    """Lee el sensor de suelo (siempre dentro del bucle)."""
    if aj("MODO_BORDE") == 1:
        return sensor_suelo.reflection() > aj("UMBRAL_LUZ_BORDE")
    return sensor_suelo.color() == COLOR_DEL_BORDE   # comparar colores con == sí es correcto

# ==============================================================================
# 🔧 MODO INGENIERO (Bluetooth 1,5 s). ◄ ► = elegir, Bluetooth = entrar/confirmar
# El botón central del hub NO se usa: es el botón de parada del programa.
# ==============================================================================
def esperar_suelta(boton):
    while boton in hub.buttons.pressed():
        wait(10)

def editar_valor(nombre, factor):
    """Edita un ajuste por niveles (valor / factor) viendo el número en la pantalla."""
    _, mn, mx, _, _, _ = AJUSTES[nombre]
    nivel, nivel_min, nivel_max = aj(nombre) // factor, mn // factor, mx // factor
    hub.display.number(nivel)
    while Button.BLUETOOTH not in hub.buttons.pressed():
        b = hub.buttons.pressed()
        if Button.RIGHT in b:
            nivel = min(nivel_max, nivel + 1); hub.speaker.beep(700, 50); esperar_suelta(Button.RIGHT)
        elif Button.LEFT in b:
            nivel = max(nivel_min, nivel - 1); hub.speaker.beep(500, 50); esperar_suelta(Button.LEFT)
        hub.display.number(nivel)
        wait(20)
    esperar_suelta(Button.BLUETOOTH)
    AJUSTES[nombre][0] = max(mn, min(mx, nivel * factor))
    aplicar()
    hub.speaker.beep(1000, 100)

def modo_ingeniero():
    db.stop()
    hub.display.char("E")
    esperar_suelta(Button.BLUETOOTH)         # evita salir nada más entrar
    # A = marcha de ataque, d = distancia radar, V = volumen, H = hack, X = guardar y salir
    opciones = [("A", "MARCHA_3", 100), ("d", "M3_DISTANCIA_ATAQUE", 50),
                ("V", "VOLUMEN_GENERAL", 1), ("H", "M4_TIPO_HACK", 1), ("X", None, 0)]
    i = 0
    while True:
        hub.display.char(opciones[i][0])
        b = hub.buttons.pressed()
        if Button.RIGHT in b:
            i = (i + 1) % len(opciones); hub.speaker.beep(600, 50); esperar_suelta(Button.RIGHT)
        elif Button.LEFT in b:
            i = (i - 1) % len(opciones); hub.speaker.beep(600, 50); esperar_suelta(Button.LEFT)
        elif Button.BLUETOOTH in b:
            esperar_suelta(Button.BLUETOOTH)
            letra, nombre, factor = opciones[i]
            if nombre is None:               # X: guardar y salir
                guardar(); hub.speaker.beep(2000, 300)
                print("OK ajustes guardados desde el modo ingeniero")
                return
            editar_valor(nombre, factor)
        wait(20)

# ==============================================================================
# 🔄 BUCLE PRINCIPAL (EL CEREBRO DEL JUEGO)
# ==============================================================================
modo_actual = 1
marcha_actual = 1
botones, antes = (), ()
caido = False
girando = False                              # True durante la evasión
ultimo_bt = None                             # último mensaje Bluetooth oído
posicion_normal = hub.imu.up()               # el robot arranca sobre sus ruedas
hub.ble.broadcast("ONLINE")                  # limpiamos el canal al arrancar

crono_hub, crono_sonar, crono_caida = StopWatch(), StopWatch(), StopWatch()
crono_reconexion, crono_tel = StopWatch(), StopWatch()

def nuevo(boton):
    """True solo en el instante en que se pulsa (no mientras se mantiene)."""
    return boton in botones and boton not in antes

def set_modo(n):
    global modo_actual
    modo_actual = n
    mostrar_numero_anton(n)
    hub.light.on(COLORES_MODO[n - 1])
    try:
        mando.light.on(COLORES_MODO[n - 1])
    except (OSError, AttributeError):
        pass                                 # mando desconectado

def evadir():
    """Giro de evasión sin bloquear (modo naranja)."""
    global girando
    db.turn(aj("M2_ANGULO_EVASION"), wait=False)
    girando = True

def lanzar_hack():
    """Envía el castigo a los robots cercanos y vuelve al modo verde."""
    hack = "HACK_" + str(aj("M4_TIPO_HACK"))
    print("OK lanzando", hack, "por el canal", CANAL_BROADCAST)
    hub.ble.broadcast(hack)
    hub.speaker.beep(2500, 200)
    wait(300)                                # tiempo para que lo reciban
    hub.ble.broadcast("ONLINE")
    set_modo(1)                              # vuelve al verde

# Esperar al mando (la consola ya funciona del todo mientras tanto)
hub.display.char("C")                        # C = conectando: pulsa el botón verde del mando
print("OK esperando el mando... (escribe AYUDA)")
mando = None
while mando is None:
    leer_consola()                           # la consola funciona aunque no haya mando
    mando = conectar_mando(1000)
print("OK mando conectado")
hub.speaker.beep(1000, 200)

set_modo(modo_actual)                         # respeta el modo elegido desde la consola

while True:
    leer_consola()
    vigilar_arma()
    vigilar_efecto()

    # 0. MODO INGENIERO (Bluetooth del hub mantenido 1,5 s)
    if Button.BLUETOOTH in hub.buttons.pressed():
        if crono_hub.time() > 1500:
            if aj("PITIDO_INGENIERO"):
                hub.speaker.beep(1000, 500)
            modo_ingeniero()
            crono_hub.reset()
            set_modo(modo_actual)
    else:
        crono_hub.reset()

    # 1. LECTURA DEL MANDO (con reconexión cada 2 s si se pierde)
    antes = botones
    if mando is not None:
        try:
            botones = mando.buttons.pressed()
        except OSError:
            mando, botones = None, ()
            crono_reconexion.reset()
            print("ERR mando desconectado")
    elif crono_reconexion.time() > 2000:
        db.stop()                            # sin mando, robot quieto
        hub.display.char("C")
        mando = conectar_mando(500)
        crono_reconexion.reset()
        if mando is not None:
            set_modo(modo_actual); print("OK mando conectado")

    # 2. VUELCO: cuenta atrás de KO
    if hub.imu.up() != posicion_normal:
        if not caido:
            caido = True; crono_caida.reset()
        hub.display.number(max(0, aj("SEGUNDOS_KO") - crono_caida.time() // 1000))
    elif caido:
        caido = False; set_modo(modo_actual)

    # 3. ANTI-CAÍDA DEL TATAMI (prioridad absoluta)
    if sensor_suelo and hay_borde():
        db.stop()
        hub.speaker.beep(1000, 100)
        db.straight(-150)                    # maniobra de seguridad: bloquea a propósito
        db.turn(120)
        continue

    # 4. ESCUCHA DE HACKS MULTIJUGADOR
    mensaje_bt = hub.ble.observe(CANAL_BROADCAST)
    if mensaje_bt != ultimo_bt:              # solo cuando cambia: el mensaje se repite mientras se emite
        ultimo_bt = mensaje_bt
        if mensaje_bt in CODIGOS_HACK:
            hub.ble.broadcast("ACK")
            recibir_hack(CODIGOS_HACK[mensaje_bt])

    # 5. CAMBIO DE MODO (botón verde del mando)
    if nuevo(Button.CENTER):
        set_modo(modo_actual % 4 + 1)

    # 6. CONDUCCIÓN (izquierda avanza/retrocede, derecha gira)
    v = marcha(marcha_actual)
    velocidad = giro = 0
    if Button.LEFT_PLUS in botones:    velocidad = v
    elif Button.LEFT_MINUS in botones: velocidad = -v
    if Button.RIGHT_PLUS in botones:   giro = v
    elif Button.RIGHT_MINUS in botones: giro = -v

    # 6b. JOYSTICK DE LA APP (si el mando LEGO no se está usando)
    if not (velocidad or giro) and reloj_app.time() < HOMBRE_MUERTO:
        velocidad = app_avance * v // 100
        giro = app_giro * v // 100

    # 7. LÓGICA DE CADA MODO
    if modo_actual == 1:                     # MANUAL (verde)
        if nuevo(Button.RIGHT):              # cambio de marcha
            marcha_actual = marcha_actual % 3 + 1
            hub.speaker.beep(500 + marcha_actual * 200, 100)
            hub.display.number(marcha_actual)
        if nuevo(Button.LEFT):               # arma libre
            accionar_arma()

    elif modo_actual == 2:                   # EVASIÓN (naranja)
        if nuevo(Button.LEFT):
            evadir()
        if nuevo(Button.RIGHT):
            accionar_arma()

    elif modo_actual == 3:                   # RADAR (magenta)
        distancia = sensor_ojos.distance()   # leer SIEMPRE dentro del bucle
        if efecto == 1:
            distancia = 2000                 # 🌫️ NIEBLA: el radar no ve nada
        ataque = aj("M3_DISTANCIA_ATAQUE")
        if aj("M3_PITIDO_SONAR") and ataque < distancia < 600:
            if crono_sonar.time() > distancia * 2:
                hub.speaker.beep(2000 - distancia * 2, 50)
                crono_sonar.reset()
        if distancia < ataque:
            accionar_arma()                  # no bloquea: sigue conduciendo
        if Button.LEFT in botones:           # escaneo mientras se mantiene
            velocidad, giro = 0, aj("M3_VELOCIDAD_ESCANEO")

    elif modo_actual == 4:                   # HACKER (azul)
        if nuevo(Button.LEFT) or nuevo(Button.RIGHT):
            lanzar_hack()

    # 7b. EFECTOS DE HACKEO
    if efecto == 2:                          # 🟤 BARRO: media velocidad
        velocidad, giro = velocidad // 2, giro // 2
    elif efecto == 3:                        # 🔀 MANDO LOCO: giro al revés
        giro = -giro

    # 8. SALIDA A MOTORES
    if efecto == 5:                          # 🧊 CONGELADO: quieto del todo
        db.stop()
    elif caido and not aj("OPERAR_TUMBADO"):
        db.stop()
    elif girando and not db.done() and not (velocidad or giro):
        pass                                 # dejar terminar la evasión
    else:
        girando = False
        db.drive(velocidad, giro)

    # 9. TELEMETRÍA (5 veces por segundo, solo con TEL ON)
    if telemetria and crono_tel.time() > 200:
        crono_tel.reset()
        arma = arma_motor.angle() if arma_motor else elevador_motor.angle()
        print("T modo={} marcha={} dist={} arma={} caido={} mando={} vel={} giro={} hack={}".format(
            NOMBRES_MODO[modo_actual - 1], marcha_actual, sensor_ojos.distance(), arma,
            int(caido), int(mando is not None), velocidad, giro, efecto))

    wait(10)
