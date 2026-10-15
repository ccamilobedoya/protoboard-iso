// Entry of a page that runs the simulation (the circuit asks for results or the current layer).

import { startPage } from './main.js';
import { setupLive } from './live.js';

startPage([setupLive]);
