import { PlanGraphData, SavePayload } from './types';

const API_BASE = '';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, init);
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${init?.method ?? 'GET'} ${path} → ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export interface FloorPlanMeta {
  id: number;        // plan_id
  floor_id: number;
  title: string;
  photo_url: string | null;
}

// GET /admin/floors/{floor_id}/plan — creates the plan if it doesn't exist yet
export async function getOrCreateFloorPlan(floorId: number): Promise<FloorPlanMeta> {
  return request<FloorPlanMeta>(`/admin/floors/${floorId}/plan`);
}

export async function loadPlanGraph(planId: number): Promise<PlanGraphData> {
  return request<PlanGraphData>(`/admin/plans/${planId}/graph`);
}

export async function savePlanGraph(planId: number, payload: SavePayload): Promise<PlanGraphData> {
  return request<PlanGraphData>(`/admin/plans/${planId}/graph`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

// GET /admin/plans/tree
export interface TreeFloor     { id: number; name: string; sort_order?: number; }
export interface TreeStructure { id: number; name: string; floors: TreeFloor[]; }
export interface TreeBuilding  { id: number; name: string; structures: TreeStructure[]; }
export interface TreeCampus    { id: number; name: string; buildings: TreeBuilding[]; }

export async function createCampus(name: string): Promise<{ id: number; name: string }> {
  return request('/admin/campuses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
}
export async function createBuilding(campus_id: number, name: string): Promise<{ id: number; name: string }> {
  return request('/admin/buildings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ campus_id, name }) });
}
export async function createStructure(building_id: number, name: string): Promise<{ id: number; name: string }> {
  return request('/admin/structures', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ building_id, name }) });
}
export async function createFloor(structure_id: number, name: string, sort_order?: number): Promise<{ id: number; name: string }> {
  return request('/admin/floors', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ structure_id, name, ...(sort_order !== undefined ? { sort_order } : {}) }) });
}

export type BreadcrumbLevel = 'campus' | 'building' | 'structure' | 'floor';
export interface Breadcrumb { id: number; name: string; level: BreadcrumbLevel; }

export async function getPlansTree(): Promise<TreeCampus[]> {
  return request<TreeCampus[]>('/admin/plans/tree');
}

/** Returns breadcrumbs with entity ids for a given floor_id, or null if not found */
export function findBreadcrumb(tree: TreeCampus[], floorId: number): Breadcrumb[] | null {
  for (const campus of tree) {
    for (const building of campus.buildings) {
      for (const structure of building.structures) {
        for (const floor of structure.floors) {
          if (floor.id === floorId) {
            return [
              { id: campus.id,    name: campus.name,    level: 'campus' },
              { id: building.id,  name: building.name,  level: 'building' },
              { id: structure.id, name: structure.name, level: 'structure' },
              { id: floor.id,     name: floor.name,     level: 'floor' },
            ];
          }
        }
      }
    }
  }
  return null;
}

const LEVEL_PATH: Record<BreadcrumbLevel, string> = {
  campus:    'campuses',
  building:  'buildings',
  structure: 'structures',
  floor:     'floors',
};

export async function renameBreadcrumb(level: BreadcrumbLevel, id: number, name: string): Promise<void> {
  await request(`/admin/${LEVEL_PATH[level]}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
}

export interface ObjectTypeOut {
  id: number;
  name: string;
}

export interface ObjectOut {
  id: number;
  plan_id: number;
  name: string;
  description: string | null;
  object_type: ObjectTypeOut;
}

export async function getObjectTypes(): Promise<ObjectTypeOut[]> {
  return request<ObjectTypeOut[]>('/admin/object-types');
}

export async function createObjectType(data: { name: string }): Promise<ObjectTypeOut> {
  return request<ObjectTypeOut>('/admin/object-types', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function createObject(data: {
  plan_id: number;
  object_type_id: number;
  name: string;
  description?: string | null;
}): Promise<ObjectOut> {
  return request<ObjectOut>('/admin/objects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

// ── Cross-floor edges ─────────────────────────────────────────────────────────

export interface CrossFloorNodeInfo {
  node_id: number;
  node_name: string | null;
  node_type: string;
  plan_id: number;
  floor_id: number;
  floor_name: string;
  x: number;
  y: number;
}

export interface CrossFloorEdge {
  id: number;
  cost: number;
  from_node: CrossFloorNodeInfo;
  to_node: CrossFloorNodeInfo;
  is_virtual: boolean;
}

export interface TransitionNode {
  id: number;
  x: number;
  y: number;
  name: string | null;
  node_type: string;
}

export interface PlanWithTransitions {
  plan_id: number;
  floor_id: number;
  floor_name: string;
  transition_nodes: TransitionNode[];
}

export async function getCrossFloorEdges(): Promise<CrossFloorEdge[]> {
  return request<CrossFloorEdge[]>('/admin/cross-floor-edges');
}

export async function createCrossFloorEdge(
  from_node_id: number,
  to_node_id: number,
  distance = 15.0,
  weight = 1.0,
): Promise<CrossFloorEdge> {
  return request<CrossFloorEdge>('/admin/cross-floor-edges', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_node_id, to_node_id, distance, weight }),
  });
}

export async function deleteCrossFloorEdge(id: number): Promise<void> {
  await request(`/admin/cross-floor-edges/${id}`, { method: 'DELETE' });
}

export async function getPlansWithTransitions(): Promise<PlanWithTransitions[]> {
  return request<PlanWithTransitions[]>('/admin/transition-plans');
}

export async function patchPlanDimensions(
  planId: number,
  data: { real_width: number; real_height: number; resolution: number }
): Promise<void> {
  await request(`/admin/plans/${planId}/dimensions`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}

export async function uploadPlanImage(
  planId: number,
  file: File
): Promise<{ photo_url: string }> {
  const form = new FormData();
  form.append('file', file);
  return request<{ photo_url: string }>(`/admin/plans/${planId}/image`, {
    method: 'PUT',
    body: form,
  });
}

// ── Route preview (no auth required) ─────────────────────────────────────────

export interface PreviewObject {
  id: number;
  name: string;
  floor_name: string;
  floor_id: number;
  building_name: string;
}

export interface RoutePreviewResponse {
  total_distance: number;
  segments: Array<{
    plan_id: number;
    floor_name: string;
    polyline: Array<{ x: number; y: number }>;
  }>;
  steps: Array<{
    step: number;
    instruction: string;
    plan_id: number;
    floor_name: string;
    x: number;
    y: number;
  }>;
}

export async function searchObjectsPreview(q: string): Promise<PreviewObject[]> {
  return request<PreviewObject[]>(`/mobile/objects/search?q=${encodeURIComponent(q)}`);
}

export async function buildRoutePreview(
  fromObjectId: number,
  toObjectId: number,
): Promise<RoutePreviewResponse> {
  return request<RoutePreviewResponse>('/mobile/route', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ from_object_id: fromObjectId, to_object_id: toObjectId }),
  });
}
