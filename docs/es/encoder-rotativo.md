# Encoder rotativo: el módulo KY-040

*[English](../en/rotary-encoder.md)*

Un encoder rotativo le dice a un programa cuánto y hacia dónde se giró una perilla. El kit trae el
ALPS EC11 en su módulo usual, el KY-040 (`rotary-encoder`): un eje que gira con un clic cada 18°, dos
contactos que se cierran a tierra por turnos y un pulsador en el eje. Lo maneja el `angle` del
ambiente ([ambiente.md](ambiente.md)), así que quien aprende fija un ángulo y el módulo produce, en el
tiempo, el tren de pulsos que daría una mano. El código es `src/sim/devices/encoder.js` (el eje y la
tabla son funciones puras), sus números `ENCODER` en `src/sim/models.js`, el tipo
`src/parts/types/rotary-encoder.js` y el dibujo `src/parts/packages/encoder-module.js`.

## El módulo

Pines `CLK`, `DT`, `SW`, `+`, `GND`, como los imprime la placa, a 2,54 mm, de pie sobre sus cinco
pines en una fila de la protoboard (la placa mide 19 × 26 mm; el encoder, 12 × 12 mm con un eje de
6 mm que sale 20 mm hacia el frente). El módulo trae una resistencia pull-up de 10 kΩ de `+` a `CLK`,
a `DT` y a `SW`. Cuelgan del pin `+`: con `+` sin conectar las salidas flotan, el error clásico del
módulo (`SIM_ENCODER_FLOATING`; un pin en `INPUT_PULLUP` las lee limpias con su propio pull-up, y la nota dice ambos casos). CLK es el canal A y DT el canal B.

| Campo | Por defecto | |
|---|---|---|
| `part` | `"KY-040"` | el único número de parte |
| `pulses`, `detents` | 20, 20 | por vuelta; otro par se rechaza con `BAD_VALUE`, porque daría una onda equivocada |
| `speed` | 360 | grados por segundo con que el eje sigue a su objetivo (un giro humano enérgico) |
| `bounce` | 0 | milisegundos de rebote en cada cambio de CLK y DT; 0 es limpio |
| `pressed` | false | el pulsador está oprimido |
| `swPullup` | true | el pull-up de `+` a `SW`; algunos clones no lo traen |
| `angle` | | el ángulo objetivo propio de la pieza; sin él la pieza sigue al ambiente |

## La tabla de cuadratura

Con 20 pulsos y 20 detenes un clic es un ciclo completo de cada canal, 18°. Un contacto está cerrado
a tierra (0,1 Ω) la mitad del ciclo, y las líneas tienen pull-up, así que un contacto cerrado lee
bajo. Girando a la derecha (el ángulo crece), CLK va adelante y DT se atrasa un cuarto de ciclo, 4,5°:

| Posición en el ciclo (°, desde el clic) | CLK | DT | evento al comienzo |
|---|---|---|---|
| −2,25 … 2,25 (en reposo) | alto | alto | el clic: los dos contactos abiertos |
| 2,25 … 6,75 | bajo | alto | CLK se cierra primero |
| 6,75 … 11,25 | bajo | bajo | DT se cierra |
| 11,25 … 15,75 | alto | bajo | CLK se abre |
| 15,75 … 20,25 | alto | alto | DT se abre: de nuevo en reposo |

Hacia la izquierda el orden se invierte: DT cae primero y CLK 4,5° después. De ahí sale la regla del
programa usual: en un flanco de bajada de CLK, DT alto significa derecha y DT bajo izquierda.

## Cómo el eje sigue al ángulo

`angle` es el **objetivo**. La perilla reposa en un clic, así que el objetivo se ajusta al más
cercano (pasos de 18°; un empate sube) y el eje, que el dispositivo guarda en su estado heredado, va
hacia él a `speed` por el arco más corto (media vuelta exacta va a la derecha). Los dos contactos
siguen la tabla en la posición del eje, de modo que los pulsos salen en el orden y en los tiempos que
daría una mano:

- 0° → 90° a 360 °/s son cinco clics, 0,25 s, a la derecha: CLK cae en 6,25, 56,25, 106,25, 156,25 y
  206,25 ms; DT cae 12,5 ms después de cada uno; CLK sube en 31,25 + 50 k ms y DT en 43,75 + 50 k ms.
  Las dos líneas están altas de nuevo a los 250 ms.
- 90° → 0° es el mismo tren al revés: primero DT, CLK 12,5 ms después.
- 0° → 180° va a la derecha (media vuelta exacta): diez ciclos en medio segundo. 0° → 270° son cinco
  ciclos hacia la izquierda, por el camino corto. 0° → 355° se ajusta a 360°, que es 0°: nada se mueve.
- En el punto de operación en continua el eje está en el objetivo, en reposo, con los dos contactos
  abiertos.

El ángulo absoluto no puede decir "270° a la derecha"; para una lección que cuenta clics, muévelo en
pasos menores que media vuelta. Dos controles momentáneos "+1 clic" y "−1 clic" están en la hoja de
ruta.

### Por qué un salto del deslizador igual da todos los flancos

Un control movido en cualquier parte del circuito reconstruye todo el sistema, así que el dispositivo
lista las claves de su elemento que deben sobrevivir (`state: ['shaft', 'ageA', 'ageB']`, como hacen
los sensores con tiempo, mira [sensores-temporizados.md](sensores-temporizados.md)). El eje sigue
girando desde donde estaba, haga lo que haga el deslizador, y el objetivo cambia solo hacia dónde
apunta. El elemento le pide al motor pasos cortos mientras el eje se mueve (`maxStep()`: una
veinticincoava parte del tiempo entre dos flancos, 0,5 ms a 360 °/s) y nada cuando está quieto, y
estampa los niveles que tendrán los contactos al **final** del paso que se resuelve, así que cada
flanco se lee en el paso que termina en él, a menos de un paso de su hora. `span()` da el tiempo entre
dos flancos, de modo que una página cuyo único reloj es un encoder corre en tiempo real.

## Qué debe hacer un programa

Los flancos van a 12,5 ms en un giro enérgico. Un programa que duerme más que eso entre lecturas
pierde clics, igual que en una placa real. El ciclo usual de sondeo lee CLK tan seguido como puede,
guarda el último valor y en un flanco de bajada lee DT una vez; la receta `encoder-uno` lo hace con un
`delay(1)`, y `encoder-dimmer-uno` añade un LED cuyo brillo sigue a la cuenta. Un programa que use una
interrupción (`attachInterrupt`) todavía no se simula.

## Límites y rebote

Un contacto que lleve más de 10 mA es `SIM_OVER_CURRENT` (un LED conectado directo por un contacto
cerrado con 220 Ω desde 5 V toma unos 15 mA por el contacto, 14,4 mA de ellos en el LED; con 470 Ω, 7,5 mA, sin aviso); un contacto abierto que
sostenga más de 12 V es `SIM_SWITCH_VOLTAGE`. El pin de un programa que baja una línea contra `+`
toma 0,5 mA y no estresa nada. Los 10 mA y 12 V son los valores nominales del EC11 a 5 V en continua con
carga resistiva; los 12 V son la elección del kit para avisar.

Con `bounce` mayor que 0, cada transición de un contacto en el tiempo t0 muestra, de forma
determinista, el nivel nuevo durante el primer tercio del rebote, el viejo durante el segundo tercio y
el nuevo otra vez de ahí en adelante: tres flancos en lugar de uno. Con 2 ms, 0° → 90° da 30 flancos
en CLK en vez de 10, el primero de bajada todavía en 6,25 ms. El elemento pide entonces pasos de una
veinteava parte del rebote. Los programas de las recetas no filtran el rebote, así que un rebote mayor
que un milisegundo más o menos los hace contar mal: un buen ejercicio.
