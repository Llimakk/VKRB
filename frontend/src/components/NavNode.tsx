import React from 'react';
import { Point } from '../types';

interface NavNodeProps {
  point: Point;
  r: number;
  fill: string;
  stroke: string;
  cursor: string;
  onClick: (e: React.MouseEvent) => void;
  onMouseDown: (e: React.MouseEvent) => void;
}

// Renders a nav-node icon whose shape matches the ModeSelector toolbar icon for the same type.
// fill   = type colour (or SELECT colour when selected)
// stroke = contrast colour (white by default, white when selected)
export function NavNode({ point, r, fill, stroke, cursor, onClick, onMouseDown }: NavNodeProps) {
  const { x, y } = point;
  const g = { cursor, onClick, onMouseDown } as React.SVGProps<SVGGElement>;

  switch (point.node_type) {

    case 'room': {
      // Rounded square with door gap at bottom
      return (
        <g {...g}>
          <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={r * 0.3}
            fill={fill} stroke={stroke} strokeWidth={1.5} />
          <line x1={x - r * 0.38} y1={y + r} x2={x + r * 0.38} y2={y + r}
            stroke={stroke} strokeWidth={r * 0.45} />
        </g>
      );
    }

    case 'corridor': {
      // Dashed ring + centre dot — waypoint / path node
      return (
        <g {...g}>
          <circle cx={x} cy={y} r={r} fill="transparent" />
          <circle cx={x} cy={y} r={r} fill="none"
            stroke={fill} strokeWidth={1.5}
            strokeDasharray={`${r * 0.6} ${r * 0.45}`} />
          <circle cx={x} cy={y} r={r * 0.32} fill={fill} />
        </g>
      );
    }

    case 'toilet': {
      // Top-down view: tank rectangle + bowl ellipse + water hole
      return (
        <g {...g}>
          <rect x={x - r * 0.5} y={y - r * 1.1} width={r} height={r * 0.65}
            rx={r * 0.15} fill={fill} />
          <ellipse cx={x} cy={y + r * 0.2} rx={r * 0.9} ry={r * 0.8} fill={fill} />
          <ellipse cx={x} cy={y + r * 0.25} rx={r * 0.55} ry={r * 0.5} fill={stroke} />
        </g>
      );
    }

    case 'stairs': {
      // 3-step staircase, bottom-left → top-right
      const step = (2 * r) / 3;
      const d = `M${x - r} ${y + r} h${step} v${-step} h${step} v${-step} h${step} v${-step}`;
      return (
        <g {...g}>
          <rect x={x - r} y={y - r} width={2 * r} height={2 * r} fill="transparent" />
          <path d={d} stroke={fill} strokeWidth={r * 0.35}
            strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      );
    }

    case 'elevator': {
      // Filled square + up/down chevrons
      return (
        <g {...g}>
          <rect x={x - r} y={y - r} width={2 * r} height={2 * r} rx={r * 0.2}
            fill={fill} stroke={stroke} strokeWidth={1.2} />
          <path d={`M${x - r * 0.35} ${y - r * 0.08} l${r * 0.35} ${-r * 0.44} l${r * 0.35} ${r * 0.44}`}
            stroke={stroke} strokeWidth={r * 0.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          <path d={`M${x - r * 0.35} ${y + r * 0.08} l${r * 0.35} ${r * 0.44} l${r * 0.35} ${-r * 0.44}`}
            stroke={stroke} strokeWidth={r * 0.3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      );
    }

    case 'exit': {
      // Circle + right-pointing arrow
      return (
        <g {...g}>
          <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={1.2} />
          <path d={`M${x - r * 0.42} ${y} h${r * 0.78}`}
            stroke={stroke} strokeWidth={r * 0.28} strokeLinecap="round" />
          <path d={`M${x + r * 0.18} ${y - r * 0.36} L${x + r * 0.52} ${y} L${x + r * 0.18} ${y + r * 0.36}`}
            stroke={stroke} strokeWidth={r * 0.28} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </g>
      );
    }

    case 'passage': {
      // Hexagon + dashed centre line
      const pts = Array.from({ length: 6 }, (_, i) => {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        return `${x + r * 1.1 * Math.cos(a)},${y + r * 1.1 * Math.sin(a)}`;
      }).join(' ');
      return (
        <g {...g}>
          <polygon points={pts} fill={fill} stroke={stroke} strokeWidth={1.2} />
          <path d={`M${x - r * 0.48} ${y} h${r * 0.96}`}
            stroke={stroke} strokeWidth={r * 0.22} strokeLinecap="round"
            strokeDasharray={`${r * 0.32} ${r * 0.26}`} />
        </g>
      );
    }

    default:
      return <circle cx={x} cy={y} r={r} fill={fill} stroke={stroke} strokeWidth={1.5}
        cursor={cursor} onClick={onClick} onMouseDown={onMouseDown} />;
  }
}
