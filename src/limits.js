// Size caps on what comes from outside (a circuit file, a list of operations, a board's
// program). A circuit may come from anyone: a shared file, an agent, a page someone sends. The
// caps sit far above any lesson (the largest example is about 2 KB, the longest sketch under
// 2 KB), so they only stop input that would take the memory or the time of the machine.
// The rule they serve: CLAUDE.md, "External input".

export const LIMITS = {
  circuitBytes: 1_000_000, // a circuit file, or a circuit given whole (create_circuit, layout)
  parts: 1000, // parts in one circuit
  ops: 3000, // operations in one change (a layout again removes and adds every part)
  sketchChars: 65_536, // a board's program, as text or as a .ino file
};

const tooLarge = (code, size, limit) => ({ severity: 'error', code, params: { size, limit } });

// The error for a list of operations that is too long, or null.
export const opsTooMany = (ops) => (ops.length > LIMITS.ops ? tooLarge('OPS_TOO_MANY', ops.length, LIMITS.ops) : null);

// The error for a circuit with too many parts or too many bytes, or null.
export function circuitTooLarge(circuit) {
  const parts = circuit?.parts?.length ?? 0;
  if (parts > LIMITS.parts) return tooLarge('CIRCUIT_TOO_MANY_PARTS', parts, LIMITS.parts);
  const bytes = JSON.stringify(circuit ?? {}).length;
  return bytes > LIMITS.circuitBytes ? tooLarge('CIRCUIT_TOO_LARGE', bytes, LIMITS.circuitBytes) : null;
}

// The same for a circuit file, from its size on disk, before it is read.
export const fileTooLarge = (bytes) => (bytes > LIMITS.circuitBytes ? tooLarge('CIRCUIT_TOO_LARGE', bytes, LIMITS.circuitBytes) : null);
