// Known part numbers. Each entry says which package the part uses and the name of each
// lead in package order (pin 1, pin 2, pin 3). Add your own parts here.
//
// `model` holds the electrical data the simulator will use in a later stage.

export const PART_NUMBERS = {
  // MOSFETs
  IRLZ44N: { type: 'mosfet', package: 'TO-220', pins: ['G', 'D', 'S'], model: { channel: 'n', logicLevel: true } },
  IRF520: { type: 'mosfet', package: 'TO-220', pins: ['G', 'D', 'S'], model: { channel: 'n' } },
  IRF9540: { type: 'mosfet', package: 'TO-220', pins: ['G', 'D', 'S'], model: { channel: 'p' } },
  '2N7000': { type: 'mosfet', package: 'TO-92', pins: ['S', 'G', 'D'], model: { channel: 'n' } },

  // Bipolar transistors
  '2N2222A': { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'npn' } },
  '2N3904': { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'npn' } },
  '2N3906': { type: 'bjt', package: 'TO-92', pins: ['E', 'B', 'C'], model: { polarity: 'pnp' } },
  BC547: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'npn' } },
  BC557: { type: 'bjt', package: 'TO-92', pins: ['C', 'B', 'E'], model: { polarity: 'pnp' } },
  TIP120: { type: 'bjt', package: 'TO-220', pins: ['B', 'C', 'E'], model: { polarity: 'npn', darlington: true } },

  // Diodes (axial)
  '1N4007': { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 5.2, diameter: 2.7, color: 'epoxyBlack', band: 'lead' } },
  '1N4148': { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 3.8, diameter: 1.8, color: 'glass', band: 'epoxyBlack', opacity: 0.85 } },
  '1N5819': { type: 'diode', package: 'axial', pins: ['A', 'K'], body: { length: 5.2, diameter: 2.7, color: 'epoxyBlack', band: 'lead' } },
};
