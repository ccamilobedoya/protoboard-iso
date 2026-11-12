# Sensores de biblioteca: DHT11, BME280 y BMP280

*[English](../en/library-sensors.md)*

Algunos sensores no dan un voltaje que la placa lea con `analogRead`: responden una conversación
corta por un pin de datos (el DHT11) o por el bus I2C (el BME280 y el BMP280), y un programa nunca les
habla a mano. Usa su biblioteca de siempre: `dht.readTemperature()`, `bme.readPressure()`. El kit los
simula **a nivel de biblioteca**: el programa de la placa llama la misma biblioteca, y el sensor
responde con el valor del ambiente pasado por su rango, su resolución y sus tiempos, si tiene
alimentación y está conectado donde la biblioteca lo busca.

```json
{ "id": "U2", "type": "climate-sensor", "part": "DHT11" }
{ "id": "U2", "type": "climate-sensor", "part": "BME280", "address": "0x76" }
```

El código: `src/parts/types/climate-sensor.js` (el tipo), `src/parts/packages/climate.js` (los
dibujos), `src/sim/devices/climate.js` (las respuestas), `src/sim/libraries.js` (las clases que un
programa puede usar), `src/sim/program.js` (las llamadas a la biblioteca) y `src/sim/devices/mcu.js`
(cómo la placa encuentra el sensor). Recetas: `uno-dht11`, `esp32-bme280`, `uno-bmp280-altitude`
([recetas.md](recetas.md)); línea de tiempo `examples/tours/uno-dht11.json`.

## Qué quiere decir «a nivel de biblioteca», y qué no simula

- **Se simula:** lo que devuelve la biblioteca (los números, `NaN`, `begin()` verdadero o falso),
  cuándo lo devuelve (una lectura real del DHT detiene el programa 25 ms, `begin()` 100 ms, los dos en
  tiempo simulado como `delay`), y si el sensor responde: su alimentación frente a sus límites, su
  encendido, el pin o el bus donde está, sus pull-ups, su dirección I2C y su id de chip.
- **Eléctricamente**, el módulo es su corriente de alimentación (una resistencia), sus pull-ups
  (10 kΩ a su alimentación o al riel de su chip) y sus límites. Su pin de datos nunca se maneja: un
  osciloscopio en S o en SDA muestra el nivel del pull-up.
- **No se simula:** los bits del cable (los 40 bits del DHT, los bytes de I2C), el ruido, la lentitud
  propia de los sensores (el DHT11 tarda de 6 a 30 s en seguir un cambio del aire, la humedad del
  BME280 cerca de 1 s: la ficha lo dice), el autocalentamiento. El protocolo bit a bit queda en la hoja
  de ruta como opcional.

## El módulo DHT11

Pines `S`, `+`, `−` como los imprime la placa azul de siempre (otras placas imprimen `+, OUT, −` o
`DATA, VCC, GND`: una fila más con su orden en `src/parts/db.js`). En la placa, un pull-up de 10 kΩ de
S a +.

| | |
|---|---|
| Alimentación | 3 a 5,5 V (a 3,3 V funciona igual); bajo 3 V no responde (`SIM_MODULE_LOW_SUPPLY`); sobre 5,5 V `SIM_IC_SUPPLY`; invertida, `SIM_REVERSE_VOLTAGE` |
| Corriente | 120 µA como una resistencia entre + y − (se deja fuera el 1 mA de los 25 ms de una lectura) |
| Lectura | temperatura y humedad del ambiente, redondeadas al entero más cercano (23,5 → 24), dentro de sus 0…50 °C y 20…90 %HR |
| Encendido | 1 s después de que + llega a 3 V (`warmup` en la pieza, 1 por defecto): leer antes da `NaN` |
| Caché | la de la biblioteca: una lectura a menos de 2 s de la última real (también de una fallida) devuelve esa, sin tiempo y sin valor nuevo; `begin()` hace real la siguiente |
| Exactitud | ±2 °C, ±5 %HR: solo como texto en su ficha |

Una lectura **responde** cuando S está en la red del pin que dio el programa (`DHT dht(2, DHT11)`,
unido por cables), la alimentación entre + y − está en su rango, pasó el segundo de encendido y S queda
en alto (a 0,7 · VCC o más, con su pull-up). Si no, `readTemperature()` y `readHumidity()` dan `NaN`
e `isnan()` es verdadero. Un pin que el programa dejó como salida es de la biblioteca durante una
lectura (ella lo maneja), así que la línea vuelve a quedar en alto. Redondear al más cercano es decisión
del kit; los chips reales suelen truncar, y de todos modos están dentro de ±2 °C. El segundo de
encendido es el `warmup` de la pieza, y el arranque de la simulación no gasta una lectura: la primera
cuesta sus 25 ms, con o sin `begin()`.

`readTemperature(true)` da °F a partir de los °C redondeados (24 → 75,2); `computeHeatIndex(t, h,
false)` es la fórmula de la biblioteca (30 °C y 60 % → 32,83 °C; 25 °C y 50 % → 24,86 °C); `convertCtoF` y
`convertFtoC` son sus dos conversiones.

## Las placas BME280 y BMP280

Pines `VCC`, `GND`, `SCL`, `SDA`; la placa va acostada sobre su peineta de cuatro pines.

| Pieza | Placa | Mide | Id de chip |
|---|---|---|---|
| `BME280` | solo 3,3 V: VCC es la alimentación del chip, de 1,71 a 3,6 V; sobre 3,6 V `SIM_IC_SUPPLY`, sobre 4,25 V (su máximo absoluto) el chip no responde | temperatura, humedad, presión | 0x60 |
| `BME280-5V` | con regulador: uno de 3,3 V (su riel `min(3,3; VIN − 0,2)`) alimenta el chip y los pull-ups; VIN bajo 3,4 V `SIM_MODULE_LOW_SUPPLY` | temperatura, humedad, presión | 0x60 |
| `BMP280` | como `BME280`, sin humedad | temperatura, presión | 0x58 |

- `address`: 0x76 (por defecto; SDO a tierra en la mayoría de placas) o 0x77.
- Lecturas: `readTemperature()` la temperatura dentro de −40…85 °C, a 0,01 °C; `readPressure()` la
  presión dentro de 300…1100 hPa, **en Pa**, a 1 Pa (1013,25 hPa → 101325); `readHumidity()` a
  0,01 %HR, dentro de 0…100; `readAltitude(presionMarHpa)` la de la biblioteca,
  `44330 · (1 − (p / mar)^0,1903)` desde la presión redondeada (900 hPa → 988,7 m).
- Exactitud ±1 °C, ±3 %HR, ±1 hPa: texto en la ficha.
- Corriente después de `begin()` (el modo normal de la biblioteca, que mide todo el tiempo): 0,47 mA
  (BMP280 0,4 mA), como una resistencia en el riel del chip.

`begin(dirección)` devuelve **verdadero** solo cuando SDA y SCL están en los pines I2C por defecto de
la placa (UNO A4 y A5, o sus pines SDA y SCL de la peineta; ESP32 DevKit GPIO21 y GPIO22; ESP32-C3
GPIO8 y GPIO9), los dos quedan en alto (con pull-up), el riel del chip está en su rango, la dirección
es la de la placa y el id de chip es el que espera la biblioteca: `Adafruit_BME280` solo 0x60;
`Adafruit_BMP280::begin(dir, chipid)` 0x58 por defecto (0x60 solo si el programa lo pide). `begin()`
sin dirección pregunta por **0x77**, como hacen las dos bibliotecas. Leer después de un `begin()` que
falló, o con el chip que ya no responde, da `NaN` (una placa real puede imprimir en cambio un número
fijo sin sentido; el kit da lo que dan las comprobaciones de la biblioteca). Un chip cuyo riel bajó de
1,71 V vuelve a arrancar dormido: sus lecturas dan `NaN` hasta que el programa llama `begin()` otra vez.
`setSampling(…)` se acepta y no cambia nada (se avisa `SIM_PROGRAM_IGNORED`); `sensorID()`,
`takeForcedMeasurement()` y `seaLevelForAltitude(m, hPa)` funcionan.

**El bus en un UNO.** La biblioteca arranca `Wire`, y en un AVR eso enciende los pull-ups de SDA y SCL
(unos 35 kΩ a 5 V). Contra los 10 kΩ a 3,3 V de una placa de 3,3 V las líneas quedan en
(5/35k + 3,3/10k)/(1/35k + 1/10k) ≈ 3,68 V, por encima de VDDIO + 0,3 V = 3,6 V del chip: la nota
`SIM_PIN_OVER_VDDIO`. El bus funciona (el UNO lee 3,68 V como alto), pero pasa el máximo del chip:
un convertidor de nivel deja las líneas dentro, o el programa apaga los pull-ups tras `begin()` con
`digitalWrite(A4, LOW); digitalWrite(A5, LOW);` (la receta `uno-bmp280-altitude` lo hace: el bus queda
entonces en 3,3 V; un cálculo estático se detiene dentro de `begin()` y aún muestra 3,68 V). La placa con regulador tampoco trae convertidor: en un UNO
sus líneas quedan en los mismos 3,68 V. En un ESP32 el bus queda en 3,3 V. `Wire.begin(sda, scl)` en un
ESP32 mueve el bus a esos dos GPIO. Bajo 3,4 V el regulador de la placa con regulador entra en caída y
el chip funciona con lo que queda (3,3 V en VIN dan unos 3,1 V): una nota informativa,
`SIM_MODULE_LOW_SUPPLY`.

## Los errores de siempre que el kit reproduce

| Lo que hace el estudiante | Lo que ve el programa | Lo que dice la ficha |
|---|---|---|
| Lee el DHT11 en un ciclo sin `delay(2000)` | el mismo valor durante 2 s, sin error | la última lectura real y cuándo |
| Lee apenas lo alimenta | `NaN` el primer segundo | «encendiéndose · faltan 0,6 s» |
| Conecta S a D3 y escribe `DHT dht(2, DHT11)` | `NaN` | «el programa lee el pin 2, y S no está en él» |
| `bme.begin()` en la placa de siempre | `false` | «el programa pregunta por 0x77 y esta placa es 0x76» |
| Un BMP280 con la biblioteca del BME280 | `begin` falso | «la biblioteca espera el id de chip 0x60 y este chip es 0x58» |
| La placa de solo 3,3 V a 5 V | `begin` falso, `SIM_IC_SUPPLY` | «por encima de su máximo de 4,25 V» |
| SDA y SCL cruzados | `begin` falso | «SDA y SCL están cruzados» |
| `readPressure()` impreso como si fueran hPa | 101325 en vez de 1013 | la lectura en hPa al lado |
| Una placa de 3,3 V en el I2C de un UNO | funciona | `SIM_PIN_OVER_VDDIO`: el bus a 3,68 V |
| La alimentación cayó y volvió | `NaN` hasta un nuevo `begin()` | «su alimentación cayó y el chip volvió a arrancar dormido» |

## Cómo encuentra la placa un sensor

El dispositivo del sensor tiene la verdad; la placa solo pregunta.

1. Una llamada a la biblioteca en el programa (`dht.readTemperature()`) corre en `program.js` y le
   pregunta a la placa: `ask({ cls: 'DHT', method: 'read', pin: 2 })` (o `{ cls: 'Adafruit_BME280',
   method: 'begin', address: 0x76, chip: 0x60 }`).
2. La placa (`mcu.js`) convierte el pin en su red (nodos unidos por cables) y los pines I2C por
   defecto de su familia en las suyas (`I2C_PINS` en `src/sim/models.js`), y le pregunta a cada
   elemento del circuito que declara la clase: `library: { classes: ['DHT'], bus: 'pin' }` y
   `answer(request)`. El motor le pasa a la placa esos elementos cuando ya están todos armados
   (`connect(elements)`).
3. Cada sensor dice si la pregunta es para él (el DHT en la red de ese pin; el chip en el bus de la
   placa con esa dirección) y, si lo es, si responde (alimentación, encendido, pull-up, id de chip):
   anota ese veredicto para su ficha y devuelve sus valores. Una pregunta para otro pin u otra
   dirección no anota nada, así que con dos sensores cada ficha cuenta solo las preguntas que eran
   para él; cuando no le preguntaron a ningún sensor, la placa le pasa a cada uno que no estaba su
   propia razón (otro pin, otra dirección). Dos sensores en un mismo lugar (dos líneas de datos de DHT
   unidas, dos chips con la misma dirección en un bus) son `SIM_LIBRARY_SHARED`: la placa lee el
   primero en el orden del circuito.
4. Lo que recuerda (la caché del DHT y desde cuándo tiene alimentación) está en el `memo` del elemento,
   que se conserva al rearmar (`state: ['memo']`), así que un deslizador en otra parte ni reinicia el
   encendido ni vuelve real una lectura de la caché. Sus valores son sus parámetros, que cambia el
   ambiente (`sense`).

## Agregar otro sensor de biblioteca

Un DS18B20 o una pantalla SSD1306 serían datos más sus propias respuestas, nada especial en `mcu.js`:

1. Su clase y sus métodos en `LIBRARY_CLASSES` (`src/sim/libraries.js`), al final, sin reordenar
   (el traductor los escribe como números); su include en `LIBRARY_INCLUDES`.
2. Lo que hacen sus métodos en `program.js` (`METHODS`, en el mismo orden): llaman `ask(...)`; un
   método que espera es un generador y va en `WAITS`.
3. Un dispositivo cuyo elemento tenga `library: { classes, bus }` y `answer(request)`, y guarde lo que
   recuerda en una clave de `state`. Un bus nuevo (one-wire en un pin es `pin`) solo necesita lo que
   lleva su pregunta.
4. Casos de ataque en `test/attack.test.js` para la clase nueva, y comprobaciones contra la hoja de
   datos en una prueba propia (como `test/library-sensors.test.js`).
