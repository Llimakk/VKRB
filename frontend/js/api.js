import { API_BASE } from "./config.js";

const API_BASES = Array.from(new Set([API_BASE, "http://127.0.0.1:8000", "http://localhost:8000"]));

async function request(path, options = {}) {
  let lastNetworkError = null;
  for (const base of API_BASES) {
    try {
      const res = await fetch(`${base}${path}`, options);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `Ошибка API: ${res.status}`);
      }
      if (res.status === 204) return null;
      return res.json();
    } catch (e) {
      if (e instanceof TypeError) {
        lastNetworkError = e;
        continue;
      }
      throw e;
    }
  }
  if (lastNetworkError) throw new Error("Нет подключения к API.");
  throw new Error("Не удалось выполнить запрос.");
}

export const api = {
  getCampuses: () => request("/admin/campuses"),
  createCampus: (payload) =>
    request("/admin/campuses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  createBuilding: (payload) =>
    request("/admin/buildings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  createStructure: (payload) =>
    request("/admin/structures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  createFloor: (payload) =>
    request("/admin/floors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateCampus: (id, payload) =>
    request(`/admin/campuses/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateBuilding: (id, payload) =>
    request(`/admin/buildings/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateStructure: (id, payload) =>
    request(`/admin/structures/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateFloor: (id, payload) =>
    request(`/admin/floors/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteCampus: (id) => request(`/admin/campuses/${id}`, { method: "DELETE" }),
  deleteBuilding: (id) => request(`/admin/buildings/${id}`, { method: "DELETE" }),
  deleteStructure: (id) => request(`/admin/structures/${id}`, { method: "DELETE" }),
  deleteFloor: (id) => request(`/admin/floors/${id}`, { method: "DELETE" }),
  getBuildings: (campusId) => request(`/admin/buildings?campus_id=${campusId}`),
  getStructures: (buildingId) => request(`/admin/structures?building_id=${buildingId}`),
  getFloors: (structureId) => request(`/admin/floors?structure_id=${structureId}`),
  getFloorPlan: (floorId) => request(`/admin/floors/${floorId}/plan`),
  getFloorContext: (floorId) => request(`/admin/floors/${floorId}/context`),
  getPlanDetail: (planId) => request(`/admin/plans/${planId}`),
  uploadEntityImage: async (modelName, id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request(`/admin/${modelName}/${id}/image`, { method: "PUT", body: fd });
  },
  deleteEntityImage: (modelName, id) => request(`/admin/${modelName}/${id}/image`, { method: "DELETE" }),
  uploadEntityDrawing: async (modelName, id, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request(`/admin/${modelName}/${id}/drawing`, { method: "PUT", body: fd });
  },
  deleteEntityDrawing: (modelName, id) => request(`/admin/${modelName}/${id}/drawing`, { method: "DELETE" }),
  getObjectTypes: () => request("/admin/object-types"),
  createObjectType: (payload) =>
    request("/admin/object-types", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateObjectType: (id, payload) =>
    request(`/admin/object-types/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteObjectType: (id) => request(`/admin/object-types/${id}`, { method: "DELETE" }),
  getObjectKinds: (objectTypeId = null) =>
    request(objectTypeId ? `/admin/object-kinds?object_type_id=${objectTypeId}` : "/admin/object-kinds"),
  createObjectKind: (payload) =>
    request("/admin/object-kinds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateObjectKind: (id, payload) =>
    request(`/admin/object-kinds/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteObjectKind: (id) => request(`/admin/object-kinds/${id}`, { method: "DELETE" }),
  createObject: (payload) =>
    request("/admin/objects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateObject: (id, payload) =>
    request(`/admin/objects/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteObject: (id) => request(`/admin/objects/${id}`, { method: "DELETE" }),
  createTransitionZone: (payload) =>
    request("/admin/transition-zones", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  updateTransitionZone: (id, payload) =>
    request(`/admin/transition-zones/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  deleteTransitionZone: (id) => request(`/admin/transition-zones/${id}`, { method: "DELETE" }),
  uploadPlanImage: async (planId, file) => {
    const fd = new FormData();
    fd.append("file", file);
    return request(`/admin/plans/${planId}/image`, {
      method: "PUT",
      body: fd,
    });
  },
  deletePlanImage: (planId) => request(`/admin/plans/${planId}/image`, { method: "DELETE" }),
  searchObjects: (q, filters = {}, signal) => {
    const { limit = 25, hierTypes = [], tzKindIds = [], roomKindIds = [] } = filters;
    const params = new URLSearchParams({ q, limit: String(limit) });
    for (const t of hierTypes) params.append("hier_types", t);
    for (const id of tzKindIds) params.append("tz_kind_ids", String(id));
    for (const id of roomKindIds) params.append("room_kind_ids", String(id));
    return request(`/admin/search?${params}`, signal ? { signal } : {});
  },
  checkDuplicateName: ({ entityKind, name, objectTypeId, planId, excludeEntityId }) => {
    const params = new URLSearchParams({
      entity_kind: entityKind,
      name,
      object_type_id: String(objectTypeId),
      plan_id: String(planId),
    });
    if (excludeEntityId != null) {
      params.set("exclude_entity_id", String(excludeEntityId));
    }
    return request(`/admin/duplicate-name-check?${params}`);
  },
};

