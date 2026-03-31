import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, extname, join, resolve } from 'node:path';
import { importDxf, simplifyLayoutPrimitives } from '../packages/core-engine/dist/index.js';

function usage() {
  console.error('Usage: node scripts/eval-layout-import.mjs <file.dxf> [output-dir]');
  process.exit(1);
}

const inputPath = process.argv[2];
if (!inputPath) usage();

const absoluteInput = resolve(process.cwd(), inputPath);
const outputDir = resolve(process.cwd(), process.argv[3] || join('tmp', 'layout-import-eval', basename(inputPath, extname(inputPath))));
mkdirSync(outputDir, { recursive: true });

const dxf = readFileSync(absoluteInput, 'utf8');
const imported = importDxf(dxf);
const simplified = {
  ...imported,
  primitives: simplifyLayoutPrimitives(imported.primitives, { preserveLabels: true }),
  pinCandidates: [],
};

writeFileSync(join(outputDir, 'raw.svg'), toSvg(imported.primitives, imported.bounds));
writeFileSync(join(outputDir, 'simplified.svg'), toSvg(simplified.primitives, simplified.bounds));
writeFileSync(join(outputDir, 'metrics.json'), JSON.stringify({
  input: absoluteInput,
  outputDir,
  raw: summarize(imported.primitives, imported.bounds),
  simplified: summarize(simplified.primitives, simplified.bounds),
}, null, 2));

console.log(`Wrote artifacts to ${outputDir}`);
console.log(`Raw: ${join(outputDir, 'raw.svg')}`);
console.log(`Simplified: ${join(outputDir, 'simplified.svg')}`);
console.log(`Metrics: ${join(outputDir, 'metrics.json')}`);

function summarize(primitives, bounds) {
  const counts = {};
  for (const primitive of primitives) {
    counts[primitive.type] = (counts[primitive.type] || 0) + 1;
  }
  return {
    primitiveCount: primitives.length,
    bounds,
    counts,
  };
}

function toSvg(primitives, bounds) {
  const viewBox = `-2 -2 ${Math.max(10, bounds.width + 4)} ${Math.max(10, bounds.height + 4)}`;
  const body = primitives.map((p) => primitiveToSvg(p)).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" width="1200" height="800">
  <rect x="-2" y="-2" width="${Math.max(10, bounds.width + 4)}" height="${Math.max(10, bounds.height + 4)}" fill="#111"/>
  <g stroke="#cfcfcf" fill="none" stroke-width="0.3">
${indent(body, 4)}
  </g>
</svg>
`;
}

function primitiveToSvg(p) {
  switch (p.type) {
    case 'line':
      return `<line x1="${p.x1}" y1="${p.y1}" x2="${p.x2}" y2="${p.y2}" />`;
    case 'rect':
      return `<rect x="${p.x}" y="${p.y}" width="${p.width}" height="${p.height}" />`;
    case 'circle':
      return `<circle cx="${p.cx}" cy="${p.cy}" r="${p.r}" />`;
    case 'arc':
      return `<path d="${arcPath(p)}" />`;
    case 'polyline':
      return `<polyline points="${p.points.map((pt) => `${pt.x},${pt.y}`).join(' ')}"${p.closed ? ' fill="none"' : ''} />`;
    case 'path':
      return `<path d="${escapeAttr(p.d)}" />`;
    case 'text':
      return `<text x="${p.x}" y="${p.y}" font-size="${p.fontSize || 2}" fill="#d8d8d8" stroke="none">${escapeText(p.content)}</text>`;
    case 'ellipse':
      return `<ellipse cx="${p.cx}" cy="${p.cy}" rx="${p.rx}" ry="${p.ry}" />`;
    default:
      return '';
  }
}

function arcPath(p) {
  const startX = p.cx + p.r * Math.cos(p.startAngle);
  const startY = p.cy + p.r * Math.sin(p.startAngle);
  const endX = p.cx + p.r * Math.cos(p.endAngle);
  const endY = p.cy + p.r * Math.sin(p.endAngle);
  return `M ${startX} ${startY} A ${p.r} ${p.r} 0 0 1 ${endX} ${endY}`;
}

function escapeText(text) {
  return text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function escapeAttr(text) {
  return escapeText(text).replaceAll('"', '&quot;');
}

function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line) => `${pad}${line}`).join('\n');
}
