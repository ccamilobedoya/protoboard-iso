// autoLayout for the tests that are not about the budget: with the largest budget the kit takes
// (LIMITS.layoutSeconds), so a busy machine (other test files at once, the coverage run) never turns
// a result into CHANGES at the 60 s default. A test that gives its own budget keeps it; the tests
// about the budget itself (test/layout-size.test.js, test/layout-size-acceptance.test.js) import
// src/layout.js directly and use the default.
import { autoLayout as layout } from '../src/layout.js';
import { LIMITS } from '../src/limits.js';

export const GENEROUS_BUDGET = LIMITS.layoutSeconds;
export const autoLayout = (spec, options = {}) => layout(spec, { budget: GENEROUS_BUDGET, ...options });
