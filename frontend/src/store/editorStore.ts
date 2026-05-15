import { create } from 'zustand';
import {
  EditorState, EditorMode, Point, Polygon, Connection,
  EditorSettings, PlanGraphData, SavePayload, DbObject,
  NodeType, PendingPolygon,
} from '../types';
import { getObjectTypes, createObjectType, createObject } from '../api';
import { CANVAS_DEFAULTS, AUTO_CONNECT_NEAREST } from '../constants';

const DEFAULT_SETTINGS: EditorSettings = {
  pointRadius: 6,
  pointColor: '#007AFF',
  pointStrokeColor: '#FFFFFF',
  lineWidth: 2,
  lineColor: '#4A90E2',
  askNames: true,
  polygonVertexRadius: 4,
  polygonVertexColor: '#8E8E93',
  polygonFillColor: '#F2F2F2',
  polygonStrokeColor: '#BDBDBD',
  polygonOpacity: 0.7,
};

// Fields captured in undo/redo snapshots.
// Image is intentionally excluded — it can be several MB and would bloat memory.
interface HistorySnapshot {
  points: EditorState['points'];
  connections: EditorState['connections'];
  polygons: EditorState['polygons'];
  measurementSegments: EditorState['measurementSegments'];
  polygonPoints: EditorState['polygonPoints'];
  settings: EditorSettings;
  realWidth: number;
  realHeight: number;
  resolution: number;
}

interface EditorStore extends EditorState {
  setMode: (mode: EditorMode) => void;

  // Points
  addPoint: (point: Omit<Point, 'id'>) => void;
  movePoint: (id: string, coords: { x: number; y: number }) => void;
  removePoint: (id: string) => void;
  renamePoint: (id: string, name: string) => void;
  updateNode: (id: string, updates: Partial<Pick<Point, 'name' | 'lat' | 'lon'>>) => void;

  // Connections
  addConnection: (from_id: string, to_id: string, weight?: number) => void;
  removeConnection: (from_id: string, to_id: string) => void;

  // Polygons
  addPolygon: (polygon: Polygon) => void;
  removePolygon: (index: number) => void;
  renamePolygon: (index: number, name: string) => void;
  updatePolygon: (index: number, updates: Partial<Polygon>) => void;
  movePolygonVertex: (polyIndex: number, vertexIndex: number, coords: { x: number; y: number }) => void;

  // Polygon edit dialog
  setEditingPolygonIndex: (index: number | null) => void;

  // Bind mode
  setBindingPolygonIndex: (index: number | null) => void;
  toggleEntryNode: (polygonIndex: number, nodeId: string) => void;

  // In-progress polygon drawing
  addPolygonPoint: (point: { x: number; y: number }) => void;
  clearPolygonPoints: () => void;

  // Canvas interaction
  setPreviewPoint: (point: { x: number; y: number } | null) => void;
  setSelectedPoints: (ids: string[]) => void;

  // Measurements (local only, never sent to server)
  addMeasurementSegment: (from: { x: number; y: number }, to: { x: number; y: number }) => void;
  clearMeasurements: () => void;

  // Canvas / image config
  setImage: (url: string | null) => void;
  setRealDimensions: (width: number, height: number) => void;
  setResolution: (resolution: number) => void;
  updateSettings: (settings: Partial<EditorSettings>) => void;

  // DB object list
  setDbObjects: (objects: DbObject[]) => void;

  // Plan id
  setPlanId: (id: number) => void;

  // Floor name (for suggestNodeName)
  setFloorName: (name: string) => void;

  // Node type selector (create mode)
  setNodeTypeToCreate: (type: NodeType) => void;

  // Pending polygon binding dialog
  setPendingPolygon: (data: PendingPolygon | null) => void;
  setAutoBindOnMatch: (v: boolean) => void;
  setAutoConnectCorridor: (v: boolean) => void;
  setAutoLinkCorridorToNonCorridor: (v: boolean) => void;
  setLastCorridorNodeId: (id: string | null) => void;

  // Finalize drawn polygon → opens binding dialog
  finishPolygon: (points: Array<{ x: number; y: number }>, name: string) => void;

  // Auto-connect
  autoConnectRoomsToCorridor: () => void;

  // History
  saveHistory: () => void;
  undo: () => void;
  redo: () => void;
  clear: () => void;

  // Server integration
  loadFromServer: (data: PlanGraphData) => void;
  exportForServer: () => SavePayload;
}

const createInitialState = (): EditorState => ({
  points: [],
  connections: [],
  polygons: [],
  measurementSegments: [],
  polygonPoints: [],
  previewPoint: null,
  selectedPoints: [],
  dbObjects: [],
  planId: null,
  nodeTypeToCreate: 'room',
  autoBindOnMatch: true,
  autoConnectCorridor: true,
  autoLinkCorridorToNonCorridor: false,
  lastCorridorNodeId: null,
  pendingPolygon: null,
  bindingPolygonIndex: null,
  editingPolygonIndex: null,
  floorName: '',
  mode: 'create',
  settings: DEFAULT_SETTINGS,
  history: [],
  historyIndex: -1,
  image: null,
  realWidth:  CANVAS_DEFAULTS.REAL_WIDTH,
  realHeight: CANVAS_DEFAULTS.REAL_HEIGHT,
  resolution: CANVAS_DEFAULTS.RESOLUTION,
});

export const useEditorStore = create<EditorStore>((set, get) => ({
  ...createInitialState(),

  setMode: (mode) => set({ mode, lastCorridorNodeId: null }),

  addPoint: (point) => {
    const { points } = get();
    const newPoint: Point = { ...point, id: crypto.randomUUID() };
    set({ points: [...points, newPoint] });
    get().saveHistory();
  },

  // No saveHistory here — called on mouseup after drag via stopDrag
  movePoint: (id, coords) => {
    const { points } = get();
    set({ points: points.map(p => p.id === id ? { ...p, ...coords } : p) });
  },

  removePoint: (id) => {
    const state = get();
    const points = state.points.filter(p => p.id !== id);
    const connections = state.connections.filter(
      c => c.from_id !== id && c.to_id !== id
    );
    set({ points, connections });
    get().saveHistory();
  },

  renamePoint: (id, name) => {
    const { points } = get();
    set({ points: points.map(p => p.id === id ? { ...p, name } : p) });
    get().saveHistory();
  },

  updateNode: (id, updates) => {
    const { points } = get();
    set({ points: points.map(p => p.id === id ? { ...p, ...updates } : p) });
    get().saveHistory();
  },

  addConnection: (from_id, to_id, weight = 1.0) => {
    const { connections } = get();
    const duplicate = connections.some(
      c => (c.from_id === from_id && c.to_id === to_id) ||
           (c.from_id === to_id   && c.to_id === from_id)
    );
    if (!duplicate) {
      set({ connections: [...connections, { from_id, to_id, weight }] });
      get().saveHistory();
    }
  },

  removeConnection: (from_id, to_id) => {
    const { connections } = get();
    set({
      connections: connections.filter(
        c => !(c.from_id === from_id && c.to_id === to_id) &&
             !(c.from_id === to_id   && c.to_id === from_id)
      ),
    });
    get().saveHistory();
  },

  addPolygon: (polygon) => {
    const { polygons } = get();
    set({ polygons: [...polygons, polygon] });
    get().saveHistory();
  },

  removePolygon: (index) => {
    const { polygons } = get();
    set({ polygons: polygons.filter((_, i) => i !== index) });
    get().saveHistory();
  },

  renamePolygon: (index, name) => {
    const { polygons } = get();
    const updated = [...polygons];
    updated[index] = { ...updated[index], name };
    set({ polygons: updated });
    get().saveHistory();
  },

  updatePolygon: (index, updates) => {
    const { polygons } = get();
    const updated = [...polygons];
    updated[index] = { ...updated[index], ...updates };
    set({ polygons: updated });
    get().saveHistory();
  },

  movePolygonVertex: (polyIndex, vertexIndex, coords) => {
    const { polygons } = get();
    const updated = [...polygons];
    const pts = [...updated[polyIndex].points];
    pts[vertexIndex] = coords;
    updated[polyIndex] = { ...updated[polyIndex], points: pts };
    set({ polygons: updated });
  },

  addPolygonPoint: (point) => {
    const { polygonPoints } = get();
    set({ polygonPoints: [...polygonPoints, point] });
  },

  clearPolygonPoints: () => set({ polygonPoints: [] }),

  setPreviewPoint: (point) => set({ previewPoint: point }),

  setSelectedPoints: (ids) => set({ selectedPoints: ids }),

  setImage: (url) => set({ image: url }),

  setRealDimensions: (width, height) => {
    set({ realWidth: width, realHeight: height });
    get().saveHistory();
  },

  setResolution: (resolution) => {
    set({ resolution });
    get().saveHistory();
  },

  updateSettings: (newSettings) => {
    const { settings } = get();
    set({ settings: { ...settings, ...newSettings } });
    get().saveHistory();
  },

  addMeasurementSegment: (from, to) => {
    const { measurementSegments } = get();
    set({ measurementSegments: [...measurementSegments, { from, to }] });
    get().saveHistory();
  },

  clearMeasurements: () => {
    set({ measurementSegments: [] });
    get().saveHistory();
  },

  setDbObjects: (objects) => set({ dbObjects: objects }),

  setPlanId: (id) => set({ planId: id }),

  setFloorName: (name) => set({ floorName: name }),

  setNodeTypeToCreate: (type) => set({ nodeTypeToCreate: type, lastCorridorNodeId: null }),

  setPendingPolygon: (data) => set({ pendingPolygon: data }),
  setAutoBindOnMatch: (v) => set({ autoBindOnMatch: v }),
  setAutoConnectCorridor: (v) => set({ autoConnectCorridor: v }),
  setAutoLinkCorridorToNonCorridor: (v) => set({ autoLinkCorridorToNonCorridor: v }),
  setLastCorridorNodeId: (id) => set({ lastCorridorNodeId: id }),
  setBindingPolygonIndex: (index) => set({ bindingPolygonIndex: index }),
  toggleEntryNode: (polygonIndex, nodeId) => {
    const { polygons } = get();
    const poly = polygons[polygonIndex];
    const ids = poly.nav_node_client_ids ?? [];
    const newIds = ids.includes(nodeId)
      ? ids.filter(id => id !== nodeId)
      : [...ids, nodeId];
    const updated = [...polygons];
    updated[polygonIndex] = { ...poly, nav_node_client_ids: newIds };
    set({ polygons: updated });
    get().saveHistory();
  },

  setEditingPolygonIndex: (index) => set({ editingPolygonIndex: index }),

  // Finalising a drawn polygon just opens the binding dialog.
  // Actual object creation happens in PolygonBindDialog.
  finishPolygon: (points, name) => {
    get().clearPolygonPoints();
    set({ pendingPolygon: { points, suggestedName: name } });
  },

  autoConnectRoomsToCorridor: () => {
    const { points, connections } = get();
    const corridors = points.filter(p => p.node_type === 'corridor');
    const rooms     = points.filter(p => p.node_type === 'room');
    if (corridors.length < 1) return;

    const updated = [...connections];
    for (const room of rooms) {
      const nearest = corridors
        .map(c => ({ id: c.id, dist: Math.hypot(c.x - room.x, c.y - room.y) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, AUTO_CONNECT_NEAREST);
      for (const { id: cid } of nearest) {
        const exists = updated.some(
          c => (c.from_id === room.id && c.to_id === cid) ||
               (c.from_id === cid     && c.to_id === room.id)
        );
        if (!exists) updated.push({ from_id: room.id, to_id: cid, weight: 1.0 });
      }
    }
    set({ connections: updated });
    get().saveHistory();
  },

  saveHistory: () => {
    const state = get();
    const snapshot: HistorySnapshot = {
      points: state.points,
      connections: state.connections,
      polygons: state.polygons,
      measurementSegments: state.measurementSegments,
      polygonPoints: state.polygonPoints,
      settings: state.settings,
      realWidth: state.realWidth,
      realHeight: state.realHeight,
      resolution: state.resolution,
    };
    const newHistory = state.history.slice(0, state.historyIndex + 1);
    newHistory.push(JSON.stringify(snapshot));
    set({ history: newHistory, historyIndex: newHistory.length - 1 });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      const snap: HistorySnapshot = JSON.parse(history[newIndex]);
      set({ ...snap, historyIndex: newIndex });
    }
  },

  redo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      const snap: HistorySnapshot = JSON.parse(history[newIndex]);
      set({ ...snap, historyIndex: newIndex });
    }
  },

  clear: () => set(createInitialState()),

  loadFromServer: (data) => {
    const initial = createInitialState();

    const points: Point[] = data.nav_nodes.map(n => ({
      id: String(n.id),
      x: n.x,
      y: n.y,
      name: n.name ?? undefined,
      node_type: (n.node_type as NodeType) ?? 'room',
      lat: n.lat ?? undefined,
      lon: n.lon ?? undefined,
    }));

    const connections: Connection[] = data.nav_edges.map(e => ({
      from_id: String(e.from_node_id),
      to_id:   String(e.to_node_id),
      weight:  e.weight,
    }));

    const polygons: Polygon[] = data.objects
      .filter(o => o.polygon_points && o.polygon_points.length >= 3)
      .map(o => ({
        object_id: o.id,
        points: o.polygon_points!,
        name: o.name,
        description: o.description,
        nav_node_client_ids: o.nav_node_ids.map(String),
      }));

    set({
      ...initial,
      points,
      connections,
      polygons,
      dbObjects:  data.objects,
      planId:     data.plan_id,
      realWidth:  data.real_width  ?? initial.realWidth,
      realHeight: data.real_height ?? initial.realHeight,
      resolution: data.resolution  ?? initial.resolution,
      settings:   data.editor_settings ?? initial.settings,
      image:      data.image_url,
    });
    get().saveHistory();
  },

  exportForServer: () => {
    const s = get();

    const nav_nodes = s.points.map(p => ({
      client_id: p.id,
      x: p.x,
      y: p.y,
      name: p.name ?? null,
      node_type: p.node_type,
      lat: p.lat ?? null,
      lon: p.lon ?? null,
    }));

    const nav_edges = s.connections.map(c => ({
      from_client_id: c.from_id,
      to_client_id:   c.to_id,
      weight:         c.weight,
    }));

    const object_polygons = s.polygons
      .filter(p => p.object_id != null && (p.points.length >= 3 || p.nav_node_client_ids.length > 0))
      .map(p => ({
        object_id:           p.object_id!,
        ...(p.description !== undefined ? { description: p.description } : {}),
        polygon_points:      p.points,
        nav_node_client_ids: p.nav_node_client_ids ?? [],
      }));

    return {
      real_width:      s.realWidth,
      real_height:     s.realHeight,
      resolution:      s.resolution,
      editor_settings: s.settings,
      nav_nodes,
      nav_edges,
      object_polygons,
    };
  },
}));
