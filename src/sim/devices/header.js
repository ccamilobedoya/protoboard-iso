// Header pins only hold things: no element, no current, nothing to say.

export const header = {
  types: ['header'],
  kind: 'HDR',
  params: () => ({}),
  elements: () => ({}),
  read: (entry) => ({ currents: Object.fromEntries(entry.pins.map((p) => [p.name, 0])) }),
  lines: () => null,
  tag: () => null,
};
