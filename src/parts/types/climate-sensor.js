// Climate sensors read at LIBRARY level (family F6, docs/en/library-sensors.md): a board's program
// calls the usual library and the kit answers with the environment's temperature, humidity and
// pressure through the sensor's range, resolution and timing (src/sim/devices/climate.js).
//
// Part numbers (src/parts/db.js):
//   DHT11      (the default) the usual 3-pin module standing on its pins, S, +, − as printed, with its
//              10 kΩ pull-up from S to +; temperature and humidity
//   BME280     the 3.3 V-only board lying on its 4-pin header (VCC, GND, SCL, SDA): temperature,
//              humidity and pressure; I2C address 0x76 (SDO to ground, the usual) or 0x77
//   BME280-5V  the same chip on the regulated board (a 3.3 V regulator feeds it and its pull-ups)
//   BMP280     as BME280 without humidity (chip id 0x58)
//
// fields: part; temperature (°C), humidity (%RH), pressure (hPa): its own values, which win over the
//   environment's (docs/en/environment.md); warmup (DHT11: seconds after power before a good read,
//   default 1); address (BME280, BME280-5V, BMP280: 0x76 or 0x77 as a number or "0x76", default 0x76).

import { lookupPartNumber } from '../db.js';

const bad = (field, v) => ({ error: { code: 'BAD_VALUE', params: { value: `${field} ${v}` } } });
const RANGES = { temperature: [-55, 150, 25], humidity: [0, 100, 50], pressure: [0, 1500, 1013.25] };
const ADDRESSES = [0x76, 0x77];

export const climateSensor = {
  type: 'climate-sensor',
  family: 'sensor',
  pins: null, // from the part number
  resolve(part) {
    const found = lookupPartNumber(part.part ?? 'DHT11');
    if (!found || found.entry.type !== 'climate-sensor') return { error: { code: 'UNKNOWN_PART_NUMBER', params: { number: String(part.part), type: 'climate-sensor' } } };
    const dht = found.number === 'DHT11';
    const values = {};
    for (const [field, [lo, hi, fallback]] of Object.entries(RANGES)) {
      const v = Number(part[field] ?? fallback);
      if (!(v >= lo && v <= hi)) return bad(field, part[field]);
      values[field] = v;
    }
    const electrical = { kind: 'CLIM', part: found.number, ...values };
    if (dht) {
      const warmup = Number(part.warmup ?? 1);
      if (!(warmup >= 0 && warmup <= 60)) return bad('warmup', part.warmup);
      electrical.warmup = warmup;
    } else {
      const given = part.address ?? 0x76;
      const address = typeof given === 'string' && /^0x[0-9a-f]+$/i.test(given.trim()) ? Number.parseInt(given.trim().slice(2), 16) : Number(given);
      if (!ADDRESSES.includes(address)) return bad('address', part.address);
      electrical.address = address;
    }
    return {
      package: found.entry.package,
      pinNames: found.entry.pins,
      params: { part: found.number },
      label: { text: found.number },
      electrical,
    };
  },
};
