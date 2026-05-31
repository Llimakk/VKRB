/** Shared application state and constants. */

export const TRANSITION_ZONE_TYPE_LABEL = "Зона перехода";
export const ADMIN_HOME_PAGE_TITLE =
  "Панель администратора для заполнения информации об объектах университета";
export const SELECT_CAMPUS_PLACEHOLDER = "Выберите кампус";
export const SELECT_BUILDING_PLACEHOLDER = "Выберите корпус";
export const SELECT_STRUCTURE_PLACEHOLDER = "Выберите строение";
export const SELECT_FLOOR_PLACEHOLDER = "Выберите этаж";
export const PLAN_MARKER_SCALE_STORAGE_KEY = "vkrb_plan_marker_scale";
export const PLAN_LEGEND_HIDDEN_STORAGE_KEY = "vkrb_plan_legend_hidden";
export const PLAN_MARKER_SCALE_MIN = 0.6;
export const PLAN_MARKER_SCALE_MAX = 1.8;
export const PLAN_MARKER_SCALE_DEFAULT = 1;
export const ROOM_DUPLICATE_MESSAGE = "Помещение с таким названием уже существует на этом этаже.";
export const TRANSITION_ZONE_DUPLICATE_DETAIL = "transition_zone_name_exists_on_plan";
export const TRANSITION_ZONE_DUPLICATE_MESSAGE =
  "Зона перехода с таким названием уже существует на этом этаже.";
export const GLOBAL_DUPLICATE_NAME_TITLE = "Повтор названия";
export const GLOBAL_DUPLICATE_NAME_INTRO =
  "Объект с таким названием уже существует в другом месте университета:";
export const OBJECT_KIND_IN_USE_DETAIL = "Object kind is in use";
export const OBJECT_KIND_IN_USE_TITLE = "Удаление невозможно";
export const OBJECT_KIND_IN_USE_MESSAGE =
  "Этот вид объекта нельзя удалить: он уже используется в зонах перехода или помещениях на планах этажей.";

export const state = {
  campuses: [],
  buildings: [],
  structures: [],
  floors: [],
  objectTypes: [],
  objectKinds: [],
  selected: {
    campusId: null,
    buildingId: null,
    structureId: null,
    floorId: null,
    planId: null,
  },
  planDetail: null,
  placement: {
    transitionZoneId: null,
    objectId: null,
  },
  focusedTransitionZoneId: null,
  focusedObjectId: null,
  corridorSelectedRoomId: {},
  corridorAddRoomOpenId: null,
  uiMode: "none",
  planMarkerScale: PLAN_MARKER_SCALE_DEFAULT,
};

export function getSelectedName(items, id) {
  return items.find((i) => i.id === Number(id))?.name || "-";
}

export function appendSelectPlaceholder(select, text, { selected = true } = {}) {
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = text;
  opt.disabled = true;
  opt.selected = selected;
  opt.hidden = true;
  select.appendChild(opt);
}

export function apiErrorDetail(err) {
  const raw = err?.message || String(err);
  try {
    const parsed = JSON.parse(raw);
    return parsed?.detail || raw;
  } catch {
    return raw;
  }
}

export function normalizeImageUrl(url) {
  if (!url) return url;
  return url.replace("://minio:9000", "://localhost:9000");
}
