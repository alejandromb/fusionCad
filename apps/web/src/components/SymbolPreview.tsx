/**
 * Shared SymbolPreview component - renders a mini SVG preview of a symbol.
 * Used by InsertSymbolDialog and RightPanel.
 */

import type { SymbolDefinition, SymbolPrimitive } from '@fusion-cad/core-model';

/**
 * Render a single SymbolPrimitive to an SVG JSX element.
 */
export function renderPrimitiveToSVG(p: SymbolPrimitive, i: number): JSX.Element | null {
  const stroke = ('stroke' in p && p.stroke) || '#00ff00';
  const fill = ('fill' in p && p.fill) || 'none';
  const sw = ('strokeWidth' in p && p.strokeWidth) || 2;

  switch (p.type) {
    case 'rect':
      return <rect key={i} x={p.x} y={p.y} width={p.width} height={p.height} rx={p.rx} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case 'circle':
      return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case 'line':
      return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={stroke} strokeWidth={sw} />;
    case 'arc': {
      const r = p.r;
      const x1 = p.cx + r * Math.cos(p.startAngle);
      const y1 = p.cy + r * Math.sin(p.startAngle);
      const x2 = p.cx + r * Math.cos(p.endAngle);
      const y2 = p.cy + r * Math.sin(p.endAngle);
      const largeArc = Math.abs(p.endAngle - p.startAngle) > Math.PI ? 1 : 0;
      const sweep = p.endAngle > p.startAngle ? 1 : 0;
      return <path key={i} d={`M${x1},${y1} A${r},${r} 0 ${largeArc},${sweep} ${x2},${y2}`} fill="none" stroke={stroke} strokeWidth={sw} />;
    }
    case 'ellipse':
      return <ellipse key={i} cx={p.cx} cy={p.cy} rx={p.rx} ry={p.ry} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case 'polyline': {
      const pts = p.points.map(pt => `${pt.x},${pt.y}`).join(' ');
      if (p.closed) return <polygon key={i} points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
      return <polyline key={i} points={pts} fill={fill} stroke={stroke} strokeWidth={sw} />;
    }
    case 'text':
      return <text key={i} x={p.x} y={p.y} fontSize={p.fontSize ?? 20} fontWeight={p.fontWeight ?? 'bold'} fill="#00ff00" textAnchor={(p.textAnchor || 'middle') as 'start' | 'middle' | 'end'} dominantBaseline="central">{p.content}</text>;
    case 'path':
      return <path key={i} d={p.d} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
    default:
      return null;
  }
}

/**
 * Mini SVG preview of a symbol
 */
export function SymbolPreview({ symbol }: { symbol: SymbolDefinition }) {
  const { width, height } = symbol.geometry;
  const primitives = symbol.primitives;
  const paths = symbol.paths || [];

  // Calculate viewBox with padding
  const padding = 5;
  const viewBox = `${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}`;

  return (
    <svg
      viewBox={viewBox}
      className="symbol-preview-svg"
      style={{ width: '100%', height: '100%' }}
    >
      {primitives && primitives.length > 0
        ? primitives.map((p, i) => renderPrimitiveToSVG(p, i))
        : paths.map((path, i) => (
          <path
            key={i}
            d={path.d}
            fill={path.fill ? '#00ff00' : 'none'}
            stroke="#00ff00"
            strokeWidth={path.strokeWidth || 2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ))}
      {/* Draw pin indicators */}
      {symbol.pins.map(pin => (
        <circle
          key={pin.id}
          cx={pin.position.x}
          cy={pin.position.y}
          r={2}
          fill="#00ff00"
        />
      ))}
    </svg>
  );
}
