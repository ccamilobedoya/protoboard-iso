# Simulación

*[English](../en/simulation.md)*

El kit calcula el voltaje (tensión) de cada grupo conectado y la corriente de cada componente,
a partir del mismo archivo de circuito que dibuja la protoboard. Todo resultado es un
**modelo**: tiras ideales, valores típicos de los componentes, sin temperatura. La respuesta en
texto, el dibujo y la página lo dicen.

```bash
node bin/protoboard-iso.js simulate <objetivo> [--lang es] [--json]                 # punto de operación en DC
node bin/protoboard-iso.js simulate <objetivo> --transient 5,1m [--start zero|dc]    # 5 s en pasos de 1 ms
node bin/protoboard-iso.js render <objetivo> --sim --fit parts                       # resultados dibujados sobre la protoboard
```

MCP: la herramienta `simulate` (mismas opciones) y `render` con `sim: true`.

> **Primero quien aprende.** Nunca se muestra un resultado que alguien debe predecir. Los
> resultados se dibujan solo si se piden (`--sim`), y la página para embeber solo los ofrece
> cuando el circuito lo pide (`"page": { "results": true }`), detrás de un botón y ocultos hasta
> que se presiona.

## La alimentación: `supplies`

```json
"supplies": [{ "id": "V1", "voltage": 5, "positive": "T+", "negative": "T-", "currentLimit": 0.5 }]
```

| Campo | Qué es | Por defecto |
|---|---|---|
| `id` | nombre en los resultados | `V1`, `V2`… |
| `kind` | `bench` (fuente de banco) o `battery` (batería) | `bench` |
| `voltage` | voltios | obligatorio |
| `positive`, `negative` | agujero (`"T+9"`) o grupo (`"T+"`, `"12:a-e"`) de cada cable | `T+`, `T-` |
| `currentLimit` | límite de la fuente de banco, A: por encima, la fuente sostiene la corriente (corriente constante, CC) y su voltaje baja | ninguno |
| `internalResistance` | Ω | banco 0; batería 0,25 Ω por cada celda de 1,5 V |

El negativo de la primera fuente es la **tierra** (0 V). Una segunda fuente sin conexión con la
primera alimenta un circuito aparte, medido desde su propio negativo.

Se fijan con una operación, como cualquier campo del circuito:
`{ "op": "circuit", "supplies": [ … ] }`.

## Análisis

- **DC (punto de operación).** Los capacitores quedan abiertos; todo lo demás, en su estado
  estable. Método de Newton sobre análisis nodal modificado (MNA); si no converge, las fuentes
  se suben poco a poco desde el 10 %.
- **Transitorio.** `stop` y `step` en segundos; los capacitores empiezan descargados
  (`start: "zero"`, la fuente se enciende en t = 0) o en sus valores de DC (`start: "dc"`).
  Euler implícito con paso fijo; se guardan como mucho 400 muestras (`points`).

## Resultados

`simulate(circuit)` (JSON con `--json` o `format: "json"`):

```js
{ analysis: 'dc', model: true, ok: true, ground: 'T-',
  nodes:    { 'T+': 5, '9:a-e': 1.76, … },               // voltios; null = flotante
  supplies: { V1: { voltage, current, power, mode: 'CV' | 'CC' } },
  parts:    { R1: { voltage, current, power, pins: { '1': 5, '2': 1.76 } },
              D1: { …, brightness: 0.49 },                // LED: corriente / 20 mA
              Q1: { currents: { C, B, E }, vbe, vce, beta, region: 'off' | 'active' | 'saturation' },
              M1: { currents: { D, G, S }, vgs, vds, region: 'off' | 'linear' | 'saturation' } },
  issues: [ … ] }
```

Componentes de dos patas: `voltage` = primera pata − segunda, y `current` va de la primera pata a
la segunda a través del componente. Las corrientes de los transistores son positivas cuando
entran por la pata. El transitorio trae `times` y las mismas magnitudes como listas.

## Avisos

| Código | Cuándo |
|---|---|
| `SIM_OVER_POWER` | una resistencia por encima de su potencia (`power`: "1/4" W por defecto) o un transistor por encima de lo que aguanta su encapsulado |
| `SIM_OVER_CURRENT` | un LED con más de 30 mA, un diodo por encima de su máximo |
| `SIM_REVERSE_VOLTAGE` | un LED con más de 5 V en inversa |
| `SIM_CAP_REVERSED`, `SIM_CAP_OVER_VOLTAGE` | un electrolítico al revés; cualquier capacitor por encima de su voltaje |
| `SIM_SUPPLY_LIMITED` | una fuente de banco en su límite de corriente (corriente constante) |
| `SIM_SHORT_CIRCUIT` | una fuente sin límite que entrega más de 3 A |
| `SIM_FLOATING` | grupos sin camino de corriente continua hasta la fuente (por ejemplo, la compuerta de un MOSFET sin conectar) |
| `SIM_UNSUPPORTED`, `SIM_DEFAULT_MODEL` | un componente que todavía no se simula (chips), o una referencia sin modelo propio |

## Modelos

Todos en `src/sim/models.js`, cada uno comprobado una vez en `test/sim.test.js` contra una
referencia independiente (una fórmula de libro resuelta aparte, o el dato de la hoja de datos).

| Componente | Modelo | Referencia en las pruebas |
|---|---|---|
| cable | 0,05 Ω (cable y dos contactos) | — |
| resistencia, potenciómetro | ley de Ohm; cursor: R(1–W) = posición · R | divisor, serie y paralelo |
| pulsador | 0,1 Ω presionado; los pares siempre unidos | el LED prende solo mientras se presiona |
| capacitor | abierto en DC; Euler implícito en el transitorio | V·(1 − e^(−t/RC)) |
| diodo | Shockley + resistencia en serie (1N4007, 1N4148, 1N5819) | Vf de la hoja de datos |
| LED | Shockley + 10 Ω, Vf a 20 mA según el color; `"model": { "vf": 2.95 }` lo cambia | ecuación de la malla resuelta aparte |
| MOSFET | ley cuadrática con encendido suave, k a partir de Rds(on) | ley cuadrática resuelta aparte, Rds(on) |
| BJT | Ebers–Moll, β constante; TIP120 como Darlington con sus dos resistencias | Ebers–Moll resuelto aparte; hFE ≥ 1000 |
| fuente de banco, batería | fuente ideal, límite opcional; batería 0,25 Ω por celda | cortocircuito, batería con carga |

Cualquier campo del modelo se puede cambiar por componente con `"model": { … }` (por ejemplo, el
voltaje directo de un LED medido en el banco).

## Todavía no

Los chips (555, amplificadores operacionales, lógica) quedan sin conectar y se avisa. No hay
bobinas, ni eventos durante un transitorio (presionar un botón en un momento dado), ni
temperatura, ni ruptura. La animación (etapa 3) leerá estos mismos resultados.
