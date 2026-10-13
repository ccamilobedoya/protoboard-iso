// Registry of physical packages. A package knows only geometry: how big the body is,
// how far apart its leads may go and how to draw it. What the part does electrically
// lives in ../types.

import axial from './axial.js';
import led from './led.js';
import radialCan from './radial-can.js';
import disc from './disc.js';
import to220 from './to220.js';
import to92 from './to92.js';
import wire from './wire.js';
import tactile from './tactile.js';
import pot from './pot.js';
import dip from './dip.js';

export const PACKAGES = Object.fromEntries([axial, led, radialCan, disc, to220, to92, pot, tactile, dip, wire].map((p) => [p.id, p]));
