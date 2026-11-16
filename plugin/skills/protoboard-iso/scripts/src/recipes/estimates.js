// Named closed-form estimates of a recipe's goal (docs/en/recipes.md, "Goals"): the textbook formula
// a goal with several knobs, or one measured over time, is ranked by before the simulator measures
// its best few candidates. They are also the independent reference the tests compare the simulator
// with. Each one names the parts it reads by their role, and the ids those roles have in a recipe
// unless the goal says otherwise; values are in base units (Ω, F) and the result is in the goal's.
//
//   ESTIMATES[name] = { roles: { role: id }, value: ({ role: number }) → number }

export const ESTIMATES = {
  // NE555 astable: C charges through RA + RB and discharges through RB (the datasheet's formula).
  '555-astable': {
    roles: { ra: 'R1', rb: 'R2', c: 'C1' },
    value: ({ ra, rb, c }) => 1.44 / ((ra + 2 * rb) * c),
  },
};
