# Sensores analógicos: un sensor Hall lineal y un módulo sensor de voltaje

*[English](../en/analog-sensors.md)*

Algunos sensores responden con un **voltaje que sigue a lo que sienten**, no con un sí o un no: el
`hall-sensor` (un 49E, suelto o en su módulo KY-035) y el módulo `voltage-sensor`. Una placa los lee con
su ADC (`analogRead`). Son dos tipos de la familia sensor, no módulos de la placa con LM393
([modulos-sensores.md](modulos-sensores.md)): no hay comparador, ni trimmer, ni DO.

El código: `src/parts/types/analog-sensors.js` (los tipos), `src/sim/devices/hall-sensor.js` y
`voltage-sensor.js` (la simulación; las constantes son `HALL_LINEAR` y `VOLTAGE_SENSOR` en
`src/sim/models.js`), `src/parts/packages/sensor-module.js` (el KY-035 y el sensor de voltaje son sus
placas `bare`) y el paquete TO-92 (el 49E suelto). Recetas: `hall-linear-uno`, `voltage-sensor-uno`
([recetas.md](recetas.md)).

## El sensor Hall lineal

```json
{ "id": "U1", "type": "hall-sensor", "part": "KY-035" }
{ "id": "U1", "type": "hall-sensor", "part": "49E", "field": 100 }
```

| Parte | Pines | Qué es |
|---|---|---|
| `KY-035` (por defecto) | `S`, `+`, `−` | el 49E en una placa pequeña con tres pines |
| `49E` | `VCC`, `GND`, `OUT` | el chip suelto en un TO-92, pines vistos desde la cara plana |

Cualquiera de las dos formas de escribir un pin lo encuentra (`OUT` es `S`, `VCC` es `+`, `GND` es `−`),
solo en este tipo.

La salida es la mitad de la alimentación más un término que sigue al campo:

```text
Vout = Vs / 2 + 1,4 mV/G · (Vs / 5 V) · campo          mantenida dentro de [0,95 V, Vs − 0,95 V]
```

- Sin imán es **la mitad de la alimentación**: 2,5 V a 5 V. Un polo sur frente a la cara marcada
  (`field` positivo, en gauss) la sube, un polo norte la baja. +100 G da 2,640 V a 5 V; +1500 G llega
  al tope de 4,05 V.
- Es **ratiométrico**: el cero (Vs / 2) *y* la sensibilidad escalan con la alimentación. A 3,3 V,
  +100 G da 1,742 V. Una placa cuyo ADC usa su propia alimentación como referencia (los 5 V de un
  UNO, los 3,3 V de un ESP32) lee la misma fracción en ambos casos, por eso el programa de
  `hall-linear-uno` sirve en las dos cambiando solo la alimentación que supone. El UNO del kit lee
  contra su riel real (AVcc: por USB unos 4,985 V), así que en reposo el programa imprime −1,75 G, una
  cuenta de su conversión `5.0 / 1023`, sea cual sea la alimentación; el ADC del ESP32 conserva su
  referencia fija.
- La salida está tras 50 Ω y su corriente está limitada a unos 5 mA (la clase aguanta ±1,5 mA); el chip toma unos 6 mA de la alimentación, así que un corto en la salida dibuja unos 11 mA y nunca vuelve negativa la corriente de alimentación. El rango lineal es de
  unos ±650 G; el deslizador muestra ±500 G, el campo puede escribirse hasta ±10 000 G.
- Siente el `field` del ambiente ([ambiente.md](ambiente.md)); un `field` en la parte gana.

Límites y avisos: `SIM_IC_SUPPLY` por encima de 8 V (las hojas no dan máximo absoluto: la cifra del kit),
`SIM_REVERSE_VOLTAGE` al revés (el chip queda apagado: su salida se queda en tierra), `SIM_MODULE_LOW_SUPPLY` por debajo de los 2,7 V desde los que se
especifica (el aviso que usan todos los sensores) `SIM_HALL_LOAD` (una nota) cuando se toman más de
1,5 mA de la salida, `SIM_OVER_CURRENT` cuando a la salida se le pide más de su límite de 5 mA (lo que llevarían los 50 Ω,
antes del límite: un corto pide 50 mA) y `SIM_HALL_HIGH_SUPPLY` (una nota) entre 6,5 V, el final de su rango de operación, y los 8 V del aviso. La tarjeta muestra el campo, la salida, la alimentación, la corriente que da VOUT y
la propia del chip.

## Leerlos con `analogRead`

Un ADC convierte un voltaje en un número, una fracción de su referencia:

- **Placa de 5 V** (UNO): `analogRead` va de 0 a 1023 para 0 a 5 V, así que 1,4 mV por gauss son 0,29
  cuentas por gauss. `volts = reading * 5.0 / 1023.0`, y `(volts − 2.5) / 0.0014` es el campo en gauss.
- **Placa de 3,3 V** (ESP32, 12 bits): 0 a 4095 para 0 a 3,3 V; el sensor debe alimentarse del riel de
  3,3 V para que su salida quede dentro del rango del pin. El cero es 1,65 V y la sensibilidad 0,924 mV
  por gauss: `(volts − 1.65) / 0.000924`.

Alimentar un 49E con 5 V hacia el pin de una placa de 3,3 V pone hasta 4 V en él: la comprobación de la
propia placa (`SIM_PIN_OVERVOLTAGE`) lo dice.

## El módulo sensor de voltaje

```json
{ "id": "U2", "type": "voltage-sensor" }
```

Parte `VOLT-25V`: un **divisor 5:1**, 30 kΩ del borne de entrada a `S` y 7,5 kΩ de `S` a tierra, así
que `S = VIN / 5` y una entrada de hasta 25 V da como mucho 5 V. En el borde de pines imprime `S`, `+` y
`−`; el pin `+` **no está conectado por dentro**. El voltaje a medir va a un borne de tornillo: aquí los
dos contactos del borne son dos pines más, `VIN` y `GND`, en la misma fila (un cable cada uno; un borne
fuera de la placa que reciba cables es una mejora para después). `−` y `GND` son la misma pista de cobre
(un miliohmio entre ellos en el modelo).

- 12 V de entrada dan 2,40 V en `S` y 0,32 mA desde la entrada (VIN sobre 37,5 kΩ); 25 V dan 5,00 V.
- `S` tiene una resistencia de salida de 6 kΩ (30 kΩ ∥ 7,5 kΩ): la relación es exactamente 5 solo hacia
  un lector de alta impedancia. Un ADC que la cargue (el condensador de muestreo de un ESP32) lee un
  poco bajo.
- `SIM_OVER_POWER` en la de 30 kΩ por encima de 100 mW (una entrada de 68 V). Lo que `S` alcance por
  encima de la alimentación de una placa es la comprobación de esa placa (`SIM_PIN_OVERVOLTAGE`): 25 V de
  entrada ponen 5 V en el pin de una placa de 3,3 V.
  Sobre los 25 V impresos en el módulo una nota (`SIM_VOLTAGE_SENSOR_RANGE`) dice que está fuera de su rango:
  40 V de entrada dan 8 V en `S`.

La tarjeta muestra la entrada, `S`, la relación y la corriente de entrada. La receta multiplica la
lectura por cinco para dar los voltios.
