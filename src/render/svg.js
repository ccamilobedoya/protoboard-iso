// Writes a scene (see scene.js) as a self-contained SVG: fixed colours, explicit size,
// white background, no CSS variables or scripts. Layers become groups (board, parts,
// labels, annotations) so pages and tools can style or toggle them.

import { buildScene } from './scene.js';

const fmt = (n) => (Math.round(n * 100) / 100).toString();

export const escapeXml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

function opToSvg(op) {
  switch (op.kind) {
    case 'polygon': {
      const pts = op.pts.map((p) => `${fmt(p.x)},${fmt(p.y)}`).join(' ');
      const stroke = op.stroke ? ` stroke="${op.stroke}" stroke-width="${op.strokeWidth}" stroke-linejoin="round"` : '';
      const opacity = op.opacity !== undefined ? ` fill-opacity="${op.opacity}"` : '';
      return `<polygon points="${pts}" fill="${op.fill}"${stroke}${opacity}/>`;
    }
    case 'text': {
      const where = op.matrix ? `transform="matrix(${op.matrix.map(fmt).join(' ')})"` : `x="${fmt(op.x)}" y="${fmt(op.y)}"`;
      const weight = op.weight && op.weight !== 400 ? ` font-weight="${op.weight}"` : '';
      const halo = op.halo ? ` stroke="${op.halo}" stroke-width="${fmt(op.size * 0.28)}" paint-order="stroke" stroke-linejoin="round"` : '';
      return `<text ${where} font-size="${fmt(op.size)}"${weight} text-anchor="${op.anchor ?? 'middle'}" dominant-baseline="central" fill="${op.fill}"${halo}>${escapeXml(op.text)}</text>`;
    }
    case 'line': {
      const dash = op.dash ? ` stroke-dasharray="${op.dash}"` : '';
      return `<line x1="${fmt(op.x1)}" y1="${fmt(op.y1)}" x2="${fmt(op.x2)}" y2="${fmt(op.y2)}" stroke="${op.stroke}" stroke-width="${op.strokeWidth}"${dash}/>`;
    }
    case 'circle': {
      const stroke = op.stroke ? ` stroke="${op.stroke}" stroke-width="${op.strokeWidth}"` : '';
      return `<circle cx="${fmt(op.cx)}" cy="${fmt(op.cy)}" r="${fmt(op.r)}" fill="${op.fill}"${stroke}/>`;
    }
    case 'rect': {
      const dash = op.dash ? ` stroke-dasharray="${op.dash}"` : '';
      const opacity = op.fillOpacity !== undefined ? ` fill-opacity="${op.fillOpacity}"` : '';
      return `<rect x="${fmt(op.x)}" y="${fmt(op.y)}" width="${fmt(op.width)}" height="${fmt(op.height)}" rx="${op.rx ?? 0}" fill="${op.fill}"${opacity} stroke="${op.stroke}" stroke-width="${op.strokeWidth}"${dash}/>`;
    }
    default:
      return '';
  }
}

export function sceneToSvg(scene, { background = '#ffffff', title } = {}) {
  const { x, y, width, height } = scene.frame;
  const bg = background ? `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${background}"/>` : '';
  const titleTag = title ? `<title>${escapeXml(title)}</title>` : '';
  const groups = Object.entries(scene.layers)
    .filter(([name, ops]) => ops.length || name !== 'annotations')
    .map(([name, ops]) => `<g class="${name}">\n${ops.map(opToSvg).join('\n')}\n</g>`);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${x} ${y} ${width} ${height}" ` +
    `font-family="Helvetica, Arial, Lato, sans-serif">${titleTag}${bg}\n${groups.join('\n')}\n</svg>\n`
  );
}

// One-call helper kept for simple uses: primitives in, SVG string out.
export function renderScene({ background, title, overlays, ...options }) {
  return sceneToSvg(buildScene({ labels: overlays, ...options }), { background, title });
}
