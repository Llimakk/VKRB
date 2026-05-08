// Types for Floor Plan Editor

export type NodeType = 'room' | 'stairs' | 'elevator' | 'exit' | 'corridor' | 'toilet' | 'passage';

export interface Point {
  id: string;        // UUID (client) or stringified DB id after save
  x: number;
  y: number;
  name?: string;
  node_type: NodeType;
  lat?: number;
  lon?: number;
}

export interface Connection {
  from_id: string;
  to_id: string;
  weight: number;    // routing cost: 1.0 = normal, >1 = slower (stairs, elevator)
}

export interface Polygon {
  object_id?: number;                       // DB Object.id (bound via dialog)
  points: { x: number; y: number }[];
  name?: string;                            // cached from DB for display
  description?: string | null;             // cached description, sent on save
  nav_node_client_ids: string[];            // Point.ids of entry nav-nodes (one per entrance)
}

export interface EditorSettings {
  pointRadius: number;
  pointColor: string;
  pointStrokeColor: string;
  lineWidth: number;
  lineColor: string;
  askNames: boolean;
  polygonVertexRadius: number;
  polygonVertexColor: string;
  polygonFillColor: string;
  polygonStrokeColor: string;
  polygonOpacity: number;
}

export type EditorMode = 'create' | 'edit' | 'connect' | 'polygon' | 'measure' | 'delete' | 'bind';

export interface MeasurementSegment {
  from: { x: number; y: number };
  to: { x: number; y: number };
}

export interface DbObject {
  id: number;
  name: string;
  description: string | null;
  object_type_id: number;
  object_type_name: string;
  polygon_points: Array<{ x: number; y: number }> | null;
  nav_node_ids: number[];        // DB ids of entry nav-nodes
}

// Server response: GET /admin/plans/{id}/graph  (also returned by PUT)
export interface PlanGraphData {
  plan_id: number;
  real_width: number;
  real_height: number;
  resolution: number;
  editor_settings: EditorSettings;
  image_url: string | null;
  nav_nodes: Array<{
    id: number;
    x: number;
    y: number;
    name: string | null;
    node_type: string;
    lat?: number | null;
    lon?: number | null;
  }>;
  nav_edges: Array<{
    id: number;
    from_node_id: number;
    to_node_id: number;
    distance: number;   // computed by backend, metres
    weight: number;
  }>;
  objects: DbObject[];
}

// Request body: PUT /admin/plans/{id}/graph
export interface SavePayload {
  real_width: number;
  real_height: number;
  resolution: number;
  editor_settings: EditorSettings;
  nav_nodes: Array<{
    client_id: string;
    x: number;
    y: number;
    name: string | null;
    node_type: string;
    lat?: number | null;
    lon?: number | null;
  }>;
  nav_edges: Array<{
    from_client_id: string;
    to_client_id: string;
    weight: number;
  }>;
  object_polygons: Array<{
    object_id: number;
    description?: string | null;           // omit or null = don't overwrite existing
    polygon_points: Array<{ x: number; y: number }>;
    nav_node_client_ids: string[];
  }>;
}

// Polygon drawn but not yet bound to a DB object
export interface PendingPolygon {
  points: Array<{ x: number; y: number }>;
  suggestedName: string;
}

export interface EditorState {
  // Data
  points: Point[];
  connections: Connection[];
  polygons: Polygon[];
  measurementSegments: MeasurementSegment[];
  polygonPoints: Array<{ x: number; y: number }>;
  previewPoint: { x: number; y: number } | null;
  selectedPoints: string[];
  dbObjects: DbObject[];
  planId: number | null;

  // UI / creation helpers
  nodeTypeToCreate: NodeType;            // type used when placing the next point
  pendingPolygon: PendingPolygon | null; // polygon waiting for object binding
  editingPolygonIndex: number | null;    // polygon open in edit dialog
  bindingPolygonIndex: number | null;    // polygon selected in bind mode
  floorName: string;                     // used by suggestNodeName to extract floor number
  autoBindOnMatch: boolean;              // auto-create object and bind nav-node when name matches
  autoConnectCorridor: boolean;          // auto-connect new corridor node to the previous one
  lastCorridorNodeId: string | null;     // id of the last placed corridor node (for auto-connect chain)

  mode: EditorMode;
  settings: EditorSettings;
  history: string[];
  historyIndex: number;

  image: string | null;
  realWidth: number;
  realHeight: number;
  resolution: number;
}
