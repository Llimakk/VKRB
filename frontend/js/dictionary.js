import { api } from "./api.js";

import { dom, fillSelect } from "./dom.js";

import {
  state,
  TRANSITION_ZONE_TYPE_LABEL,
  ROOM_DUPLICATE_MESSAGE,
  TRANSITION_ZONE_DUPLICATE_MESSAGE,
} from "./state.js";

import { renderGlobalSearchFilterPanel } from "./global-search.js";

import {
  askConfirmation,
  askGlobalDuplicateNameConfirmation,
  openEntityMetaDialog,
  pendingMetaContext,
} from "./modals.js";
import { run } from "./runner.js";



export function isTransitionZoneTypeName(name) {
  const n = (name || "").toLowerCase().trim();
  return (
    n === "зона перехода" ||
    n === "transition_zone" ||
    n === "transition zone" ||
    n.includes("коридор") ||
    n.includes("лестниц") ||
    n.includes("лифт") ||
    n.includes("переход")
  );
}

export function findTransitionZoneCatalogType() {
  const label = TRANSITION_ZONE_TYPE_LABEL.toLowerCase();
  return (
    state.objectTypes.find((t) => (t.name || "").trim().toLowerCase() === label) ||
    state.objectTypes.find((t) => isTransitionZoneTypeName(t.name)) ||
    null
  );
}

export function transitionZoneTypeIds() {
  const ids = state.objectTypes
    .filter((t) => isTransitionZoneTypeName(t.name))
    .map((t) => Number(t.id))
    .filter((id) => Number.isFinite(id));
  const catalogType = findTransitionZoneCatalogType();
  if (catalogType) ids.push(Number(catalogType.id));
  return new Set(ids);
}

export function transitionZoneKinds() {
  const typeIds = transitionZoneTypeIds();
  return state.objectKinds
    .filter((k) => {
      const typeId = Number(k.object_type_id);
      return Number.isFinite(typeId) && typeIds.has(typeId);
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
}

/** Палитра для новых видов зоны (синхронно с backend kind_marker_color.MARKER_COLOR_PALETTE). */
export const MARKER_COLOR_PALETTE = [
  "#7b1fa2",
  "#c2185b",
  "#00838f",
  "#6d4c41",
  "#5d4037",
  "#455a64",
  "#ad1457",
  "#6a1b9a",
];

export const ROOM_MARKER_COLOR = "#64b5f6";
export const UNKNOWN_ZONE_MARKER_COLOR = "#9e9e9e";

export function legacyKindMarkerColorByName(name) {
  const n = (name || "").toLowerCase();
  if (n.includes("коридор")) return "#5b21b6";
  if (n.includes("лестниц")) return "#e65100";
  if (n.includes("лифт")) return "#2e7d32";
  return null;
}

/** Цвет маркера для видов зоны перехода (не для помещений). */
export function kindMarkerColor(kind) {
  if (!kind) return UNKNOWN_ZONE_MARKER_COLOR;
  if (kind.marker_color) return kind.marker_color;
  const legacy = legacyKindMarkerColorByName(kind.name);
  if (legacy) return legacy;
  return UNKNOWN_ZONE_MARKER_COLOR;
}

export function findRoomObjectType() {
  return state.objectTypes.find((t) => isRoomObjectTypeName(t.name)) || null;
}

/** Единый цвет всех помещений на плане — с типа «Помещение». */
export function roomMarkerColor(objectType) {
  let t = objectType || findRoomObjectType();
  if (t?.id) {
    const fromState = state.objectTypes.find((row) => Number(row.id) === Number(t.id));
    if (fromState) t = fromState;
  } else {
    t = findRoomObjectType();
  }
  if (t?.marker_color) return t.marker_color;
  return ROOM_MARKER_COLOR;
}

export function objectTypeIdSupportsKindMarkerColor(objectTypeId) {
  const t = state.objectTypes.find((row) => Number(row.id) === Number(objectTypeId));
  if (!t) return false;
  return isTransitionZoneTypeName(t.name);
}

/** Справочник видов: можно добавлять для зон перехода и помещений. */
export function objectTypeIdAllowsDictionaryKindManage(objectTypeId) {
  const t = state.objectTypes.find((row) => Number(row.id) === Number(objectTypeId));
  if (!t) return false;
  return isTransitionZoneTypeName(t.name) || isRoomObjectTypeName(t.name);
}

export function predictDefaultMarkerColor(objectTypeId) {
  const typeId = Number(objectTypeId);
  const parentType = state.objectTypes.find((t) => Number(t.id) === typeId);
  if (!parentType) return UNKNOWN_ZONE_MARKER_COLOR;
  if (!isTransitionZoneTypeName(parentType.name)) return UNKNOWN_ZONE_MARKER_COLOR;
  const used = new Set(
    state.objectKinds
      .filter((k) => Number(k.object_type_id) === typeId && k.marker_color)
      .map((k) => String(k.marker_color).toLowerCase()),
  );
  for (const color of MARKER_COLOR_PALETTE) {
    if (!used.has(color.toLowerCase())) return color;
  }
  return UNKNOWN_ZONE_MARKER_COLOR;
}

export function renderPlanMarkerLegend() {
  if (!dom.planMarkerLegend) return;
  dom.planMarkerLegend.innerHTML = "";
  for (const k of transitionZoneKinds()) {
    const li = document.createElement("li");
    const swatch = document.createElement("span");
    swatch.className = "plan-marker-legend-swatch";
    swatch.setAttribute("aria-hidden", "true");
    swatch.style.backgroundColor = kindMarkerColor(k);
    li.appendChild(swatch);
    li.appendChild(document.createTextNode(k.name || "—"));
    dom.planMarkerLegend.appendChild(li);
  }
  const roomLi = document.createElement("li");
  const roomSwatch = document.createElement("span");
  roomSwatch.className = "plan-marker-legend-swatch";
  roomSwatch.setAttribute("aria-hidden", "true");
  roomSwatch.style.backgroundColor = roomMarkerColor();
  roomLi.appendChild(roomSwatch);
  roomLi.appendChild(document.createTextNode("помещение"));
  dom.planMarkerLegend.appendChild(roomLi);
}

export function objectTypeNameById(id) {
  return state.objectTypes.find((t) => t.id === id)?.name || "—";
}

export function isCorridorKindName(name) {
  return (name || "").toLowerCase().includes("коридор");
}

export function isCorridorZone(zone) {
  return isCorridorKindName(zone.object_kind?.name);
}

export function isHierarchyObjectTypeName(name) {
  const n = (name || "").toLowerCase();
  return (
    n.includes("кампус") ||
    n.includes("корпус") ||
    n.includes("строен") ||
    n.includes("этаж")
  );
}

export function isHierarchyObjectKindTypeId(objectTypeId) {
  return isHierarchyObjectTypeName(objectTypeNameById(objectTypeId));
}

/** Типы справочника «Помещение» (не зона перехода, не иерархия). */
export function isRoomObjectTypeName(name) {
  const n = (name || "").toLowerCase().trim();
  if (isTransitionZoneTypeName(name) || isHierarchyObjectTypeName(name)) return false;
  return n.includes("помещен") || n === "room";
}

export function roomObjectTypeIds() {
  const ids = state.objectTypes.filter((t) => isRoomObjectTypeName(t.name)).map((t) => t.id);
  if (ids.length) return new Set(ids);
  return new Set(
    state.objectTypes
      .filter((t) => !isTransitionZoneTypeName(t.name) && !isHierarchyObjectTypeName(t.name))
      .map((t) => t.id),
  );
}

/** Типы, для которых в справочнике можно добавлять/удалять виды (зона перехода, помещение). */
export function dictionaryKindTypeOptions() {
  return state.objectTypes.filter(
    (t) => isTransitionZoneTypeName(t.name) || isRoomObjectTypeName(t.name),
  );
}

export function canDeleteObjectKind(kind) {
  if (isCorridorKindName(kind.name)) return false;
  const typeName = objectTypeNameById(kind.object_type_id);
  return isTransitionZoneTypeName(typeName) || isRoomObjectTypeName(typeName);
}

let lastObjectKindDeleteAttemptName = null;

export function setLastObjectKindDeleteAttemptName(name) {
  lastObjectKindDeleteAttemptName = name || null;
}

export async function showObjectKindInUseFromApiError() {
  const { showObjectKindInUseDialog } = await import("./modals.js");
  await showObjectKindInUseDialog(lastObjectKindDeleteAttemptName);
  lastObjectKindDeleteAttemptName = null;
}

export function roomKinds() {
  const typeIds = roomObjectTypeIds();
  return state.objectKinds.filter((k) => {
    const typeId = Number(k.object_type_id);
    return Number.isFinite(typeId) && typeIds.has(typeId);
  });
}

export function roomNameComparisonKey(name) {
  return (name || "").trim().toLocaleLowerCase("ru");
}

export function isRoomObjectRecord(obj) {
  return isRoomObjectTypeName(obj?.object_type?.name);
}

export function roomNameExistsOnFloor(name, objectTypeId, excludeObjectId = null) {
  const key = roomNameComparisonKey(name);
  if (!key) return false;
  const typeId = Number(objectTypeId);
  if (!Number.isFinite(typeId)) return false;
  for (const o of state.planDetail?.objects || []) {
    if (excludeObjectId != null && o.id === excludeObjectId) continue;
    if (Number(o.object_type?.id) !== typeId) continue;
    if (!isRoomObjectRecord(o)) continue;
    if (roomNameComparisonKey(o.name) === key) return true;
  }
  return false;
}

export function fillRoomKindSelect(selectEl, selectedKindId) {
  if (!selectEl) return;
  selectEl.innerHTML = "";
  const kinds = roomKinds();
  if (!kinds.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "Нет видов помещения";
    selectEl.appendChild(opt);
    selectEl.disabled = true;
    return;
  }
  for (const k of kinds) {
    const opt = document.createElement("option");
    opt.value = String(k.id);
    opt.textContent = k.name;
    if (Number(k.id) === Number(selectedKindId)) opt.selected = true;
    selectEl.appendChild(opt);
  }
  selectEl.disabled = false;
}

function setFormInlineError(el, visible, message) {
  if (!el) return;
  if (visible) {
    el.textContent = message;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

export function setRoomDuplicateHint(el, visible) {
  setFormInlineError(el, visible, ROOM_DUPLICATE_MESSAGE);
}

export function setTransitionZoneDuplicateHint(el, visible) {
  setFormInlineError(el, visible, TRANSITION_ZONE_DUPLICATE_MESSAGE);
}

export function transitionZoneNameExistsOnPlan(name, objectTypeId, excludeZoneId = null) {
  const key = roomNameComparisonKey(name);
  if (!key || !objectTypeId) return false;
  return (state.planDetail?.transition_zones || []).some((z) => {
    if (excludeZoneId != null && Number(z.id) === Number(excludeZoneId)) return false;
    if (Number(z.object_type?.id) !== Number(objectTypeId)) return false;
    return roomNameComparisonKey(z.name) === key;
  });
}

/** Same-floor block + global duplicate dialog before create/rename on plan. */
export async function ensurePlanObjectNameAllowed({
  entityKind,
  name,
  objectTypeId,
  planId,
  excludeEntityId = null,
  sameFloorHintEl = null,
  onRejectFocus = null,
  skipGlobalDuplicateCheck = false,
}) {
  const trimmed = (name || "").trim();
  if (!trimmed || !planId || !objectTypeId) return true;

  if (entityKind === "transition_zone") {
    if (transitionZoneNameExistsOnPlan(trimmed, objectTypeId, excludeEntityId)) {
      if (sameFloorHintEl) setTransitionZoneDuplicateHint(sameFloorHintEl, true);
      onRejectFocus?.();
      return false;
    }
    if (sameFloorHintEl) setTransitionZoneDuplicateHint(sameFloorHintEl, false);
  } else if (entityKind === "room") {
    if (roomNameExistsOnFloor(trimmed, objectTypeId, excludeEntityId)) {
      if (sameFloorHintEl) setRoomDuplicateHint(sameFloorHintEl, true);
      onRejectFocus?.();
      return false;
    }
    if (sameFloorHintEl) setRoomDuplicateHint(sameFloorHintEl, false);
  }

  if (skipGlobalDuplicateCheck) return true;

  const result = await api.checkDuplicateName({
    entityKind,
    name: trimmed,
    objectTypeId,
    planId,
    excludeEntityId,
  });
  const matches = result?.matches || [];
  if (!matches.length) return true;

  const entityLabel = entityKind === "transition_zone" ? "Зона перехода" : "Помещение";
  const proceed = await askGlobalDuplicateNameConfirmation({
    entityLabel,
    name: trimmed,
    matches,
  });
  if (!proceed) {
    onRejectFocus?.();
    return false;
  }
  return true;
}

export function showRoomDuplicateFromApiError() {
  if (!dom.entityMetaOverlay?.hidden && pendingMetaContext?.kind === "room") {
    setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, true);
    return;
  }
  const inline = document.querySelector(".corridor-room-duplicate-hint");
  setRoomDuplicateHint(inline, true);
}

export function showTransitionZoneDuplicateFromApiError() {
  if (!dom.entityMetaOverlay?.hidden && pendingMetaContext?.kind === "transition_zone") {
    setTransitionZoneDuplicateHint(dom.entityMetaZoneDuplicateHint, true);
    return;
  }
  setTransitionZoneDuplicateHint(dom.zoneNameDuplicateHint, true);
}


export function roomsForCorridor(corridorId) {
  return (state.planDetail?.objects || []).filter((o) => o.transition_zone_id === corridorId);
}

export function findRoomById(roomId) {
  return (state.planDetail?.objects || []).find((o) => o.id === roomId);
}

export function getSelectedRoomIdForCorridor(corridorId) {
  const rooms = roomsForCorridor(corridorId);
  const stored = state.corridorSelectedRoomId[corridorId];
  if (stored && rooms.some((r) => r.id === stored)) return stored;
  return null;
}


export function renderObjectTypesDictionary() {
  dom.objectTypesTbody.innerHTML = "";
  for (const t of state.objectTypes) {
    const tr = document.createElement("tr");
    const nameCell = document.createElement("td");
    nameCell.textContent = t.name;

    const actionCell = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--outline";
    editBtn.textContent = "Редактировать";
    editBtn.onclick = () => {
      openEntityMetaDialog({
        kind: "object_type",
        id: t.id,
        number: t.number,
        parentObjectTypeId: t.parent_object_type_id ?? null,
        markerColor: t.marker_color ?? null,
        shortName: t.name,
        fullName: t.full_name ?? "",
        description: t.description ?? "",
        title: "Тип объекта",
      });
    };

    wrap.append(editBtn);
    actionCell.appendChild(wrap);
    tr.append(nameCell, actionCell);
    dom.objectTypesTbody.appendChild(tr);
  }
}

export function renderObjectKindsDictionary() {
  dom.objectKindsTbody.innerHTML = "";
  for (const k of state.objectKinds) {
    const tr = document.createElement("tr");
    const typeCell = document.createElement("td");
    typeCell.textContent = objectTypeNameById(k.object_type_id);
    const nameCell = document.createElement("td");
    nameCell.textContent = k.name;

    const actionCell = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn btn--outline";
    editBtn.textContent = "Редактировать";
    editBtn.onclick = () => {
      openEntityMetaDialog({
        kind: "object_kind",
        id: k.id,
        objectTypeId: k.object_type_id,
        number: k.number,
        markerColor: k.marker_color || kindMarkerColor(k),
        shortName: k.name,
        fullName: k.full_name ?? "",
        description: k.description ?? "",
        title: "Вид объекта",
      });
    };

    if (canDeleteObjectKind(k)) {
      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.className = "btn btn--danger";
      deleteBtn.textContent = "Удалить";
      deleteBtn.onclick = () =>
        void run(async () => {
          const ok = await askConfirmation({
            title: "Удаление вида",
            message: `Удалить вид «${k.name}»?`,
            okText: "Удалить",
            cancelText: "Отмена",
            destructive: true,
          });
          if (!ok) return;
          setLastObjectKindDeleteAttemptName(k.name);
          await api.deleteObjectKind(k.id);
          lastObjectKindDeleteAttemptName = null;
          await loadObjectDictionaries();
        });
      wrap.append(deleteBtn);
    }
    wrap.prepend(editBtn);
    actionCell.appendChild(wrap);
    tr.append(typeCell, nameCell, actionCell);
    dom.objectKindsTbody.appendChild(tr);
  }
}

export function syncKindSelects() {
  fillSelect(dom.kindSelect, transitionZoneKinds(), "Вид зоны перехода");
  fillSelect(dom.objectKindTypeSelect, dictionaryKindTypeOptions(), "Тип объекта");
  const tzType = findTransitionZoneCatalogType();
  if (tzType && dom.objectKindTypeSelect && state.uiMode === "none") {
    dom.objectKindTypeSelect.value = String(tzType.id);
  }
}

export async function loadObjectDictionaries() {
  const [types, kinds] = await Promise.all([api.getObjectTypes(), api.getObjectKinds()]);
  state.objectTypes = types;
  state.objectKinds = kinds;
  syncKindSelects();
  renderObjectTypesDictionary();
  renderObjectKindsDictionary();
  renderPlanMarkerLegend();
  renderGlobalSearchFilterPanel();
}

/** Актуальный список видов зоны перехода для формы этажа (после правок справочника). */
export async function refreshFloorTransitionZoneKinds() {
  const catalogType = findTransitionZoneCatalogType();
  if (catalogType) {
    const kindsForType = await api.getObjectKinds(catalogType.id);
    const byId = new Map(state.objectKinds.map((k) => [Number(k.id), k]));
    for (const k of kindsForType) byId.set(Number(k.id), k);
    state.objectKinds = Array.from(byId.values());
  } else {
    state.objectKinds = await api.getObjectKinds();
  }
  syncKindSelects();
}

