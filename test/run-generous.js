// runCircuit for the tests that are not about the run's machine-time limit: with the largest budget the
// kit takes (LIMITS.runMsMax), so a busy machine (other test files at once, the coverage run) never cuts
// a run with RUN_BUDGET before the simulated time a test reads. A test that gives its own budgetMs keeps
// it; the tests about the limit itself import src/sim/run.js directly and use the default. The command
// line's form: RUN_BUDGET_ARGS after `simulate … --run <s>`. The same idea as test/layout-generous.js.
// Since a run's step is at least its length over 20 000, most runs take under a second of a free
// machine and use the default budget; this is for the ones that take seconds (logic-chips' 74HC595
// runs, about 2.3 s free), the skill's references (a run of 60 s) and the acceptance files.
import { runCircuit as run } from '../src/sim/run.js';
import { LIMITS } from '../src/limits.js';

export const GENEROUS_RUN_MS = LIMITS.runMsMax;
export const RUN_BUDGET_ARGS = ['--budget', String(LIMITS.runMsMax / 1000)];
export const runCircuit = (circuit, options = {}) => run(circuit, { budgetMs: GENEROUS_RUN_MS, ...options });
