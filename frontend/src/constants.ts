import { NodeType } from './types';

export const NODE_TYPE_COLOR: Record<NodeType, string> = {
  room:     '#007AFF',
  toilet:   '#06B6D4',
  stairs:   '#AF52DE',
  elevator: '#34C759',
  exit:     '#FF3B30',
  corridor: '#5AC8FA',
  passage:  '#F59E0B',
};

export const CANVAS_COLORS = {
  MEASURE:       '#16A34A',  // measurement tool: lines, dots, labels
  ROUTE:         '#EF4444',  // route preview overlay
  DELETE:        '#DC2626',  // delete-mode highlight
  SELECT:        '#2563EB',  // connect-mode selection
  BIND_ACTIVE:   '#F59E0B',  // bind-mode: active/selected polygon or bound entry node
  BIND_HINT:     '#10B981',  // bind-mode: available-to-bind hint ring
  BIND_INACTIVE: '#94A3B8',  // bind-mode: inactive binding lines
} as const;

// Radial pixel offset of decorative rings drawn outside the node radius
export const NODE_RING_OFFSET = {
  SELECT: 6,  // connect-mode selection ring
  BOUND:  6,  // bind-mode: already-bound entry node ring
  HINT:   5,  // bind-mode: available-to-bind hint ring
} as const;

export const LABEL_FONT_SIZE = {
  POLYGON: 16,
  NODE:    14,
  MEASURE: 13,
} as const;

// Default floor-plan canvas dimensions (used when server returns no data)
export const CANVAS_DEFAULTS = {
  REAL_WIDTH:  55,  // metres — horizontal span
  REAL_HEIGHT: 26,  // metres — vertical span
  RESOLUTION:  30,  // pixels per metre
} as const;

// Max nearest corridors to auto-connect per room in autoConnectRoomsToCorridor
export const AUTO_CONNECT_NEAREST = 2;

// Pixel height of the app header — used to position floating panels below it
export const HEADER_HEIGHT = 48;
