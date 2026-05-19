import { api } from "./api.js";
import { dom, fillSelect } from "./dom.js";

const TRANSITION_ZONE_TYPE_LABEL = "Зона перехода";
const ADMIN_HOME_PAGE_TITLE =
  "Панель администратора для заполнения информации об объектах университета";
const SELECT_CAMPUS_PLACEHOLDER = "Выберите кампус";
const SELECT_BUILDING_PLACEHOLDER = "Выберите корпус";
const SELECT_STRUCTURE_PLACEHOLDER = "Выберите строение";
const SELECT_FLOOR_PLACEHOLDER = "Выберите этаж";
const PLAN_MARKER_SCALE_STORAGE_KEY = "vkrb_plan_marker_scale";
const PLAN_LEGEND_HIDDEN_STORAGE_KEY = "vkrb_plan_legend_hidden";
const PLAN_MARKER_SCALE_MIN = 0.6;
const PLAN_MARKER_SCALE_MAX = 1.8;
const PLAN_MARKER_SCALE_DEFAULT = 1;
const ROOM_DUPLICATE_MESSAGE = "Помещение с таким названием уже существует на этом этаже.";

const state = {
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
  /** @type {Record<number, number>} corridor id -> selected room object id */
  corridorSelectedRoomId: {},
  /** corridor id with open inline «add room» form */
  corridorAddRoomOpenId: null,
  /** @type {"none"|"campus"|"building"|"structure"|"floor"} */
  uiMode: "none",
  planMarkerScale: PLAN_MARKER_SCALE_DEFAULT,
};

function getSelectedName(items, id) {
  return items.find((i) => i.id === Number(id))?.name || "-";
}

const DELETE_BRANCH_LABELS = {
  campus: "Удалить кампус",
  building: "Удалить корпус",
  structure: "Удалить строение",
  floor: "Удалить этаж",
};

function syncDeleteBranchButton() {
  if (!dom.deleteBranchBtn) return;
  const hasCampus = Boolean(state.selected.campusId);
  dom.deleteBranchBtn.disabled = !hasCampus;
  dom.deleteBranchBtn.textContent = hasCampus
    ? DELETE_BRANCH_LABELS[getRenameLevel()] || "Удалить объект"
    : "Удалить объект";
}

function getBreadcrumbSegments() {
  const segments = [];
  if (state.selected.campusId) {
    segments.push({
      level: "campus",
      name: getSelectedName(state.campuses, state.selected.campusId),
    });
  }
  if (state.selected.buildingId) {
    segments.push({
      level: "building",
      name: getSelectedName(state.buildings, state.selected.buildingId),
    });
  }
  if (state.selected.structureId) {
    segments.push({
      level: "structure",
      name: getSelectedName(state.structures, state.selected.structureId),
    });
  }
  if (state.selected.floorId) {
    segments.push({
      level: "floor",
      name: getSelectedName(state.floors, state.selected.floorId),
    });
  }
  return segments;
}

function renderBreadcrumbInto(container) {
  if (!container) return;
  container.innerHTML = "";
  const segments = getBreadcrumbSegments();
  if (!segments.length) {
    container.hidden = true;
    return;
  }
  container.hidden = false;
  const activeLevel = state.uiMode === "none" ? null : state.uiMode;
  const isSidebarPath = container.classList.contains("tree-breadcrumb--sidebar");

  if (isSidebarPath) {
    const list = document.createElement("ol");
    list.className = "tree-path-list";
    segments.forEach((seg) => {
      const li = document.createElement("li");
      li.className = "tree-path-list__item";
      if (activeLevel === seg.level) {
        li.classList.add("is-active");
      }
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "tree-path-list__btn";
      btn.textContent = seg.name;
      btn.dataset.level = seg.level;
      btn.title = seg.name;
      if (activeLevel === seg.level) {
        btn.setAttribute("aria-current", "location");
      }
      btn.addEventListener("click", () => {
        void run(() => navigateToLevel(seg.level));
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
    container.appendChild(list);
    return;
  }

  segments.forEach((seg, index) => {
    if (index > 0) {
      const sep = document.createElement("span");
      sep.className = "tree-breadcrumb-sep";
      sep.setAttribute("aria-hidden", "true");
      sep.textContent = "›";
      container.appendChild(sep);
    }
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "tree-breadcrumb-seg";
    btn.textContent = seg.name;
    btn.dataset.level = seg.level;
    btn.title = seg.name;
    if (activeLevel === seg.level) {
      btn.classList.add("is-active");
      btn.setAttribute("aria-current", "location");
    }
    btn.addEventListener("click", () => {
      void run(() => navigateToLevel(seg.level));
    });
    container.appendChild(btn);
  });
}

function renderPath() {
  renderBreadcrumbInto(dom.treeBreadcrumb);
  renderBreadcrumbInto(dom.pathText);
}

function syncSelectsFromState() {
  if (state.selected.campusId) {
    dom.campusSelect.value = String(state.selected.campusId);
  } else {
    dom.campusSelect.value = "";
  }

  const hasCampus = !!state.selected.campusId;
  dom.buildingSelect.disabled = !hasCampus || !state.buildings.length;
  if (state.selected.buildingId && state.buildings.some((b) => b.id === state.selected.buildingId)) {
    dom.buildingSelect.value = String(state.selected.buildingId);
  } else if (!state.selected.buildingId) {
    dom.buildingSelect.value = "";
  }

  const hasBuilding = !!state.selected.buildingId;
  dom.structureSelect.disabled = !hasBuilding || !state.structures.length;
  if (state.selected.structureId && state.structures.some((s) => s.id === state.selected.structureId)) {
    dom.structureSelect.value = String(state.selected.structureId);
  } else if (!state.selected.structureId) {
    dom.structureSelect.value = "";
  }

  const hasStructure = !!state.selected.structureId;
  dom.floorSelect.disabled = !hasStructure || !state.floors.length;
  if (state.selected.floorId && state.floors.some((f) => f.id === state.selected.floorId)) {
    dom.floorSelect.value = String(state.selected.floorId);
  } else if (!state.selected.floorId) {
    dom.floorSelect.value = "";
  }
}

async function ensureBranchListsLoaded() {
  if (state.selected.campusId && !state.buildings.length) {
    state.buildings = await api.getBuildings(state.selected.campusId);
    fillSelect(
      dom.buildingSelect,
      state.buildings,
      SELECT_BUILDING_PLACEHOLDER,
      false,
      state.selected.buildingId,
    );
  }
  if (state.selected.buildingId && !state.structures.length) {
    state.structures = await api.getStructures(state.selected.buildingId);
    fillSelect(
      dom.structureSelect,
      state.structures,
      SELECT_STRUCTURE_PLACEHOLDER,
      false,
      state.selected.structureId,
    );
  }
  if (state.selected.structureId && !state.floors.length) {
    state.floors = await api.getFloors(state.selected.structureId);
    fillSelect(
      dom.floorSelect,
      state.floors,
      SELECT_FLOOR_PLACEHOLDER,
      false,
      state.selected.floorId,
    );
  }
  syncSelectsFromState();
}

async function navigateToLevel(level) {
  if (level === "campus" && !state.selected.campusId) return;
  if (level === "building" && !state.selected.buildingId) return;
  if (level === "structure" && !state.selected.structureId) return;
  if (level === "floor" && !state.selected.floorId) return;

  await ensureBranchListsLoaded();
  syncSelectsFromState();

  if (level !== "floor") {
    clearPlanView();
  }

  if (level === "campus") {
    dom.pageTitle.textContent = getSelectedName(state.campuses, state.selected.campusId);
    setMode("campus");
    loadEntityImage("campus", state.selected.campusId);
  } else if (level === "building") {
    dom.pageTitle.textContent = getSelectedName(state.buildings, state.selected.buildingId);
    setMode("building");
    loadEntityImage("building", state.selected.buildingId);
  } else if (level === "structure") {
    dom.pageTitle.textContent = getSelectedName(state.structures, state.selected.structureId);
    setMode("structure");
    loadEntityImage("structure", state.selected.structureId);
  } else if (level === "floor") {
    dom.pageTitle.textContent = getSelectedName(state.floors, state.selected.floorId);
    setMode("floor");
    await refreshFloorTransitionZoneKinds();
    await loadFloorContext(state.selected.floorId);
  }

  renderPath();
  syncDeleteBranchButton();
  syncEntityEditCard();
}

async function navigateToHome() {
  if (!state.selected.campusId) {
    await loadInitialLists();
    return;
  }
  await ensureBranchListsLoaded();
  syncSelectsFromState();
  clearPlanView();
  dom.pageTitle.textContent = ADMIN_HOME_PAGE_TITLE;
  setMode("none");
  renderPath();
  syncDeleteBranchButton();
  syncEntityEditCard();
}

function clearPlanView() {
  dom.planImage.removeAttribute("src");
  dom.planImage.style.display = "none";
  dom.planHint.textContent = "Изображение не загружено.";
  syncDownloadButton(false);
  if (dom.zonesList) dom.zonesList.innerHTML = "";
  dom.planMarkers.innerHTML = "";
  state.placement.transitionZoneId = null;
  state.placement.objectId = null;
  state.focusedTransitionZoneId = null;
  state.focusedObjectId = null;
  state.corridorSelectedRoomId = {};
  state.corridorAddRoomOpenId = null;
  state.planDetail = null;
  state.selected.planId = null;
}

let confirmResolver = null;
let entityMetaSaving = false;
/** @type {null | { kind: string; id?: number; number?: number | null; shortName?: string; fullName?: string; description?: string; objectTypeId?: number; objectKindId?: number; objectTypeName?: string; objectKindName?: string; parentId?: number | null; title?: string; isNewCreate?: boolean; startPlacementAfterSave?: boolean }} */
let pendingMetaContext = null;

const HIERARCHY_META_KINDS = new Set(["campus", "building", "structure", "floor"]);

function isHierarchyMetaKind(kind) {
  return HIERARCHY_META_KINDS.has(kind);
}

const CREATE_LABELS = {
  none: { title: "Создать новый кампус", placeholder: "Введите название кампуса" },
  campus: { title: "Создать новый корпус", placeholder: "Введите название корпуса" },
  building: { title: "Создать новое строение", placeholder: "Введите название строения" },
  structure: { title: "Создать новый этаж", placeholder: "Введите название этажа" },
};

const ENTITY_EDIT_TITLES = {
  campus: "Кампус",
  building: "Корпус",
  structure: "Строение",
  floor: "Этаж",
};

const HIER_TYPE_KIND = {
  campus: { type: "Кампус", kind: "Кампус" },
  building: { type: "Корпус", kind: "Корпус" },
  structure: { type: "Строение", kind: "Строение" },
  floor: { type: "Этаж", kind: "Этаж" },
};

const ENTITY_EDIT_EXPANDED_KEY = "vkrb_entity_edit_expanded";

/** Снимок полей формы для текущего объекта в карточке (level:id). */
let entityEditBaseline = null;

/** Объект карточки редактирования — по текущему режиму просмотра (uiMode), не по самому глубокому select. */
function pickEntityEditCardRow() {
  const level = state.uiMode;
  if (level === "none" || !state.selected.campusId) {
    return { level: null, row: null };
  }
  if (level === "floor") {
    if (!state.selected.floorId) return { level: null, row: null };
    return {
      level,
      row: state.floors.find((f) => f.id === state.selected.floorId) ?? null,
    };
  }
  if (level === "structure") {
    if (!state.selected.structureId) return { level: null, row: null };
    return {
      level,
      row: state.structures.find((s) => s.id === state.selected.structureId) ?? null,
    };
  }
  if (level === "building") {
    if (!state.selected.buildingId) return { level: null, row: null };
    return {
      level,
      row: state.buildings.find((b) => b.id === state.selected.buildingId) ?? null,
    };
  }
  return {
    level: "campus",
    row: state.campuses.find((c) => c.id === state.selected.campusId) ?? null,
  };
}

function resolveEntityEditCardTarget() {
  const { level, row } = pickEntityEditCardRow();
  if (!level || !row) {
    return { visible: false, key: null, level: null, row: null };
  }
  return { visible: true, key: `${level}:${row.id}`, level, row };
}

function readEntityEditFormValues() {
  return {
    shortName: dom.entityEditShortName?.value ?? "",
    fullName: dom.entityEditFullName?.value ?? "",
    description: dom.entityEditDescription?.value ?? "",
    address: dom.entityEditAddress?.value ?? "",
  };
}

function entityEditFormDirty() {
  if (!entityEditBaseline) return false;
  const v = readEntityEditFormValues();
  return (
    v.shortName !== entityEditBaseline.shortName ||
    v.fullName !== entityEditBaseline.fullName ||
    v.description !== entityEditBaseline.description ||
    v.address !== entityEditBaseline.address
  );
}

function commitEntityEditBaselineFromRow(level, row) {
  entityEditBaseline = {
    key: `${level}:${row.id}`,
    shortName: row.name || "",
    fullName: row.full_name || "",
    description: row.description || "",
    address: row.address || "",
  };
}

function syncEntityEditUnsavedBanner() {
  const banner = dom.entityEditUnsavedBanner;
  if (!banner) return;
  banner.hidden = Boolean(dom.entityEditCard?.hidden) || !entityEditFormDirty();
}

function isEntityEditExpanded() {
  return localStorage.getItem(ENTITY_EDIT_EXPANDED_KEY) !== "0";
}

function applyEntityEditCollapsedUi() {
  if (!dom.entityEditToggleBtn || !dom.entityEditCardBody) return;
  const expanded = isEntityEditExpanded();
  dom.entityEditCardBody.hidden = !expanded;
  if (dom.entityEditCard) {
    dom.entityEditCard.classList.toggle("entity-edit-card--collapsed", !expanded);
  }
  dom.entityEditToggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  dom.entityEditToggleBtn.textContent = expanded ? "Свернуть" : "Развернуть";
}

function getRenameLevel() {
  if (state.selected.floorId) return "floor";
  if (state.selected.structureId) return "structure";
  if (state.selected.buildingId) return "building";
  return "campus";
}

function pickHierEntityRow() {
  return pickEntityEditCardRow();
}

function photoUrlForEntityEdit(level, row) {
  if (!row) return "";
  if (level === "floor") {
    const fromCtx =
      state.selected.floorId === row.id && state.planDetail?.plan?.photo_url
        ? state.planDetail.plan.photo_url
        : null;
    const u = fromCtx || row.plan_photo_url;
    return u ? normalizeImageUrl(u) : "";
  }
  const u = row.photo_url;
  return u ? normalizeImageUrl(u) : "";
}

function syncContentGridLayout() {
  const grid = dom.contentGrid;
  if (!grid) return;
  grid.className = "content-grid";
  if (state.uiMode === "none") {
    grid.classList.add("content-grid--dict");
    return;
  }
  if (state.uiMode === "floor") {
    grid.classList.add("content-grid--floor");
    return;
  }
  grid.classList.add("content-grid--split");
}

function syncEntityEditCard() {
  if (!dom.entityEditCard) return;

  const target = resolveEntityEditCardTarget();

  if (!target.visible) {
    dom.entityEditCard.hidden = true;
    entityEditBaseline = null;
    syncEntityEditUnsavedBanner();
    syncContentGridLayout();
    return;
  }

  const { level, row } = target;
  dom.entityEditCard.hidden = false;
  dom.entityEditTitle.textContent = ENTITY_EDIT_TITLES[level] || "Объект";
  dom.entityEditReadId.textContent = String(row.id);
  dom.entityEditReadType.textContent = HIER_TYPE_KIND[level]?.type || "—";
  dom.entityEditReadKind.textContent = HIER_TYPE_KIND[level]?.kind || "—";
  const purl = photoUrlForEntityEdit(level, row);
  if (purl) {
    dom.entityEditPhotoLink.href = purl;
    const show = purl.length > 72 ? `${purl.slice(0, 44)}…${purl.slice(-22)}` : purl;
    dom.entityEditPhotoLink.textContent = show;
    dom.entityEditPhotoLink.hidden = false;
    dom.entityEditPhotoEmpty.hidden = true;
  } else {
    dom.entityEditPhotoLink.hidden = true;
    dom.entityEditPhotoEmpty.hidden = false;
    dom.entityEditPhotoEmpty.textContent = "—";
  }
  dom.entityEditShortName.value = row.name || "";
  dom.entityEditFullName.value = row.full_name || "";
  dom.entityEditDescription.value = row.description || "";
  dom.entityEditAddress.value = row.address || "";
  commitEntityEditBaselineFromRow(level, row);
  applyEntityEditCollapsedUi();
  syncEntityEditUnsavedBanner();
  syncContentGridLayout();
}

function applyCreateFormsVisibility(mode) {
  const showForm = (formEl, on) => {
    formEl.style.display = on ? "grid" : "none";
  };
  dom.createCampusBlock.style.display = mode === "none" ? "block" : "none";
  dom.photoBlock.style.display = mode === "none" ? "none" : "block";
  showForm(dom.createBuildingForm, mode === "campus");
  showForm(dom.createStructureForm, mode === "building");
  showForm(dom.createFloorForm, mode === "structure");
  const showChildBlock = mode === "campus" || mode === "building" || mode === "structure";
  dom.createChildBlock.style.display = showChildBlock ? "block" : "none";

  if (mode !== "floor") {
    const lab = CREATE_LABELS[mode];
    dom.createEntityTitle.textContent = lab.title;
    dom.createCampusName.placeholder = mode === "none" ? lab.placeholder : "";
    dom.createBuildingName.placeholder = mode === "campus" ? lab.placeholder : "";
    dom.createStructureName.placeholder = mode === "building" ? lab.placeholder : "";
    dom.createFloorName.placeholder = mode === "structure" ? lab.placeholder : "";
  }
}

function setMode(mode) {
  state.uiMode = mode;
  if (mode === "none") {
    dom.photoCard.style.display = "none";
    if (dom.planFloorTools) dom.planFloorTools.hidden = true;
    dom.createEntityCard.style.display = "block";
    dom.rightCard.style.display = "none";
    dom.zoneManagement.hidden = true;
    if (dom.dictCardsRow) dom.dictCardsRow.hidden = false;
    if (dom.objectTypesCard) dom.objectTypesCard.hidden = false;
    if (dom.objectKindsCard) dom.objectKindsCard.hidden = false;
    dom.emptyStateText.style.display = "block";
    dom.emptyStateText.textContent =
      "Создайте кампус или выберите существующий в дереве.";
    applyCreateFormsVisibility("none");
    syncEntityEditCard();
    return;
  }
  dom.photoCard.style.display = "block";
  dom.createEntityCard.style.display = mode === "floor" ? "none" : "block";
  if (mode === "floor") {
    dom.photoCardTitle.textContent = "План";
    if (dom.planFloorTools) dom.planFloorTools.hidden = false;
    dom.rightCardTitle.textContent = "Зоны перехода";
    dom.rightCard.style.display = "block";
    dom.objectForm.style.display = "grid";
    dom.zoneManagement.hidden = false;
    if (dom.dictCardsRow) dom.dictCardsRow.hidden = true;
    if (dom.objectTypesCard) dom.objectTypesCard.hidden = true;
    if (dom.objectKindsCard) dom.objectKindsCard.hidden = true;
    dom.emptyStateText.style.display = "none";
    applyCreateFormsVisibility("floor");
    syncKindSelects();
    syncEntityEditCard();
    return;
  }
  if (dom.planFloorTools) dom.planFloorTools.hidden = true;
  dom.photoCardTitle.textContent = "Фото";
  dom.rightCardTitle.textContent = "";
  dom.rightCard.style.display = "none";
  dom.objectForm.style.display = "none";
  if (dom.zonesList) dom.zonesList.innerHTML = "";
  if (dom.dictCardsRow) dom.dictCardsRow.hidden = true;
  if (dom.objectTypesCard) dom.objectTypesCard.hidden = true;
  if (dom.objectKindsCard) dom.objectKindsCard.hidden = true;
  dom.emptyStateText.style.display = "none";
  applyCreateFormsVisibility(mode);
  syncEntityEditCard();
}

function pickEntityPhotoUrl(modelName, id) {
  const lists = {
    campus: state.campuses,
    building: state.buildings,
    structure: state.structures,
  };
  const list = lists[modelName];
  return list?.find((i) => i.id === id)?.photo_url;
}

function setEntityPhotoUrl(modelName, id, photoUrl) {
  const lists = { campus: state.campuses, building: state.buildings, structure: state.structures };
  const row = lists[modelName]?.find((i) => i.id === id);
  if (row) row.photo_url = photoUrl ?? null;
}

function loadEntityImage(modelName, id) {
  const url = pickEntityPhotoUrl(modelName, id);
  if (url) {
    dom.planImage.src = normalizeImageUrl(url);
    dom.planImage.style.display = "block";
    dom.planHint.textContent = "";
    syncDownloadButton(true);
  } else {
    dom.planImage.removeAttribute("src");
    dom.planImage.style.display = "none";
    dom.planHint.textContent = "Изображение не загружено.";
    syncDownloadButton(false);
  }
}

function isTransitionZoneTypeName(name) {
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

function findTransitionZoneCatalogType() {
  const label = TRANSITION_ZONE_TYPE_LABEL.toLowerCase();
  return (
    state.objectTypes.find((t) => (t.name || "").trim().toLowerCase() === label) ||
    state.objectTypes.find((t) => isTransitionZoneTypeName(t.name)) ||
    null
  );
}

function transitionZoneTypeIds() {
  const ids = state.objectTypes
    .filter((t) => isTransitionZoneTypeName(t.name))
    .map((t) => Number(t.id))
    .filter((id) => Number.isFinite(id));
  const catalogType = findTransitionZoneCatalogType();
  if (catalogType) ids.push(Number(catalogType.id));
  return new Set(ids);
}

function transitionZoneKinds() {
  const typeIds = transitionZoneTypeIds();
  return state.objectKinds
    .filter((k) => {
      const typeId = Number(k.object_type_id);
      return Number.isFinite(typeId) && typeIds.has(typeId);
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "ru"));
}

function objectTypeNameById(id) {
  return state.objectTypes.find((t) => t.id === id)?.name || "—";
}

function isCorridorZone(zone) {
  return (zone.object_kind?.name || "").toLowerCase().includes("коридор");
}

function isHierarchyObjectTypeName(name) {
  const n = (name || "").toLowerCase();
  return (
    n.includes("кампус") ||
    n.includes("корпус") ||
    n.includes("строен") ||
    n.includes("этаж")
  );
}

/** Типы справочника «Помещение» (не зона перехода, не иерархия). */
function isRoomObjectTypeName(name) {
  const n = (name || "").toLowerCase().trim();
  if (isTransitionZoneTypeName(name) || isHierarchyObjectTypeName(name)) return false;
  return n.includes("помещен") || n === "room";
}

function roomObjectTypeIds() {
  const ids = state.objectTypes.filter((t) => isRoomObjectTypeName(t.name)).map((t) => t.id);
  if (ids.length) return new Set(ids);
  return new Set(
    state.objectTypes
      .filter((t) => !isTransitionZoneTypeName(t.name) && !isHierarchyObjectTypeName(t.name))
      .map((t) => t.id),
  );
}

function roomKinds() {
  const typeIds = roomObjectTypeIds();
  return state.objectKinds.filter((k) => {
    const typeId = Number(k.object_type_id);
    return Number.isFinite(typeId) && typeIds.has(typeId);
  });
}

function roomNameComparisonKey(name) {
  return (name || "").trim().toLocaleLowerCase("ru");
}

function isRoomObjectRecord(obj) {
  return isRoomObjectTypeName(obj?.object_type?.name);
}

function roomNameExistsOnFloor(name, objectTypeId, excludeObjectId = null) {
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

function fillRoomKindSelect(selectEl, selectedKindId) {
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

function setRoomDuplicateHint(el, visible) {
  if (!el) return;
  if (visible) {
    el.textContent = ROOM_DUPLICATE_MESSAGE;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function showRoomDuplicateFromApiError() {
  if (!dom.entityMetaOverlay?.hidden && pendingMetaContext?.kind === "room") {
    setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, true);
    return;
  }
  const inline = document.querySelector(".corridor-room-duplicate-hint");
  setRoomDuplicateHint(inline, true);
}

function apiErrorDetail(err) {
  if (!(err instanceof Error) || !err.message) return null;
  try {
    const parsed = JSON.parse(err.message);
    return parsed?.detail ?? null;
  } catch {
    return null;
  }
}

function roomsForCorridor(corridorId) {
  return (state.planDetail?.objects || []).filter((o) => o.transition_zone_id === corridorId);
}

function findRoomById(roomId) {
  return (state.planDetail?.objects || []).find((o) => o.id === roomId);
}

function getSelectedRoomIdForCorridor(corridorId) {
  const rooms = roomsForCorridor(corridorId);
  const stored = state.corridorSelectedRoomId[corridorId];
  if (stored && rooms.some((r) => r.id === stored)) return stored;
  return null;
}

/** Подпись в закрытом select; в развёрнутом списке не показывается (hidden). */
function appendSelectPlaceholder(select, text, { selected = true } = {}) {
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = text;
  opt.disabled = true;
  opt.hidden = true;
  if (selected) opt.selected = true;
  select.appendChild(opt);
}

function renderObjects() {
  const zones = state.planDetail?.transition_zones || [];
  if (!dom.zonesList) return;
  dom.zonesList.innerHTML = "";
  if (!zones.length) {
    const empty = document.createElement("p");
    empty.className = "muted zones-list-empty";
    empty.textContent = "Зон перехода пока нет. Добавьте зону формой выше.";
    dom.zonesList.appendChild(empty);
    return;
  }
  for (const zone of zones) {
    dom.zonesList.appendChild(buildZoneSection(zone));
  }
}

function buildZoneSection(zone) {
  const accentKey = getZoneAccentKey(zone);
  const section = document.createElement("article");
  section.className = `zone-section zone-section--${accentKey}`;
  section.dataset.transitionZoneId = String(zone.id);
  if (state.focusedTransitionZoneId === zone.id) {
    section.classList.add("is-focused");
  }

  const kindName = zone.object_kind?.name || zone.object_type?.name || "—";

  const header = document.createElement("div");
  header.className = "zone-section__header";

  const titleWrap = document.createElement("div");
  titleWrap.className = "zone-section__title-wrap";

  const mark = document.createElement("span");
  mark.className = `mark-dot zone-section__mark${zone.pos_x != null && zone.pos_y != null ? " is-on" : " is-off"}`;
  mark.title =
    zone.pos_x != null && zone.pos_y != null ? "Отметка на плане есть" : "Отметки на плане нет";

  const badge = document.createElement("span");
  badge.className = "zone-section__badge";
  badge.textContent = kindName;

  const nameEl = document.createElement("h4");
  nameEl.className = "zone-section__name";
  nameEl.textContent = zone.name;

  titleWrap.append(mark, badge, nameEl);

  const actions = document.createElement("div");
  actions.className = "zone-section__actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn--outline";
  editBtn.textContent = "Редактировать";
  editBtn.onclick = () => openTransitionZoneMetaDialog(zone);

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "btn btn--danger";
  deleteBtn.textContent = "Удалить";
  deleteBtn.onclick = () =>
    void run(async () => {
      const roomCount = roomsForCorridor(zone.id).length;
      const roomNote = roomCount ? ` Также будут удалены ${roomCount} помещений.` : "";
      const confirmed = await askConfirmation({
        title: "Удаление зоны перехода",
        message: `Удалить зону «${zone.name}»?${roomNote}`,
        okText: "Удалить",
        cancelText: "Отмена",
        destructive: true,
      });
      if (!confirmed) return;
      await api.deleteTransitionZone(zone.id);
      delete state.corridorSelectedRoomId[zone.id];
      await loadFloorContext(state.selected.floorId);
    });

  const placeBtn = document.createElement("button");
  placeBtn.type = "button";
  placeBtn.className = `btn btn--outline${state.placement.transitionZoneId === zone.id ? " is-active" : ""}`;
  placeBtn.textContent =
    zone.pos_x != null && zone.pos_y != null ? "Переставить на плане" : "Указать на плане";
  placeBtn.onclick = () => startPlacementForTransitionZone(zone.id);

  const clearMarkBtn = document.createElement("button");
  clearMarkBtn.type = "button";
  clearMarkBtn.className = "btn btn--ghost";
  clearMarkBtn.textContent = "Снять отметку";
  clearMarkBtn.disabled = zone.pos_x == null || zone.pos_y == null;
  clearMarkBtn.onclick = () =>
    void run(async () => {
      await api.updateTransitionZone(zone.id, {
        object_kind_id: zone.object_kind.id,
        name: zone.name,
        pos_x: null,
        pos_y: null,
      });
      if (state.placement.transitionZoneId === zone.id) {
        state.placement.transitionZoneId = null;
      }
      await loadFloorContext(state.selected.floorId);
      syncPlanHintStatus();
    });

  actions.append(editBtn, placeBtn, clearMarkBtn, deleteBtn);
  header.append(titleWrap, actions);
  section.appendChild(header);

  if (isCorridorZone(zone)) {
    const body = document.createElement("div");
    body.className = "zone-section__body";
    body.appendChild(buildCorridorRoomsPanel(zone));
    section.appendChild(body);
  }

  return section;
}

function buildCorridorRoomsPanel(corridor) {
  const rooms = roomsForCorridor(corridor.id);
  const selectedRoomId = getSelectedRoomIdForCorridor(corridor.id);
  if (selectedRoomId) state.corridorSelectedRoomId[corridor.id] = selectedRoomId;
  const selRoom = selectedRoomId ? findRoomById(selectedRoomId) : null;

  const panel = document.createElement("div");
  panel.className = "corridor-rooms-panel";

  const header = document.createElement("div");
  header.className = "corridor-rooms-header";

  const badge = document.createElement("span");
  badge.className = "corridor-rooms-badge";
  badge.textContent = "Помещения";

  const count = document.createElement("span");
  count.className = "corridor-rooms-count";
  count.textContent = String(rooms.length);

  const body = document.createElement("div");
  body.className = "corridor-rooms-body";

  const picker = document.createElement("div");
  picker.className = "corridor-rooms-picker";

  const pickerLabel = document.createElement("label");
  pickerLabel.className = "corridor-rooms-picker-label";
  pickerLabel.textContent = "Список";

  const select = document.createElement("select");
  select.className = "corridor-rooms-select";
  select.id = `corridor-room-select-${corridor.id}`;
  pickerLabel.htmlFor = select.id;

  if (!rooms.length) {
    const emptyOpt = document.createElement("option");
    emptyOpt.value = "";
    emptyOpt.textContent = "Пока нет помещений";
    emptyOpt.selected = true;
    select.appendChild(emptyOpt);
  } else {
    appendSelectPlaceholder(select, "Выберите помещение", {
      selected: selectedRoomId == null,
    });
    for (const room of rooms) {
      const opt = document.createElement("option");
      opt.value = String(room.id);
      const kindName = room.object_kind?.name || "—";
      opt.textContent = `${kindName} · ${room.name}`;
      if (room.id === selectedRoomId) opt.selected = true;
      select.appendChild(opt);
    }
  }
  select.onchange = () => {
    const id = Number(select.value) || null;
    if (id) {
      state.corridorSelectedRoomId[corridor.id] = id;
      focusRoomInCorridor(corridor.id, id);
    }
  };

  select.disabled = !rooms.length;

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn--primary";
  addBtn.textContent =
    state.corridorAddRoomOpenId === corridor.id ? "Скрыть" : "+ Помещение";
  addBtn.onclick = () => {
    state.corridorAddRoomOpenId =
      state.corridorAddRoomOpenId === corridor.id ? null : corridor.id;
    renderObjects();
  };

  const titleWrap = document.createElement("div");
  titleWrap.className = "corridor-rooms-title-wrap";
  titleWrap.append(badge, count);
  header.append(titleWrap, addBtn);

  const actions = document.createElement("div");
  actions.className = "corridor-rooms-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "btn btn--outline";
  editBtn.textContent = "Подробнее";
  editBtn.disabled = !selectedRoomId;
  editBtn.onclick = () => {
    const room = findRoomById(getSelectedRoomIdForCorridor(corridor.id));
    if (room) openRoomMetaDialog(room, { corridorId: corridor.id });
  };

  const placeBtn = document.createElement("button");
  placeBtn.type = "button";
  placeBtn.className = `btn btn--outline${state.placement.objectId === selectedRoomId ? " is-active" : ""}`;
  placeBtn.textContent =
    selRoom?.pos_x != null && selRoom?.pos_y != null ? "На плане ✓" : "Отметить";
  placeBtn.disabled = !selectedRoomId;
  placeBtn.onclick = () => {
    const rid = getSelectedRoomIdForCorridor(corridor.id);
    if (rid) startPlacementForObject(rid);
  };

  const clearMarkBtn = document.createElement("button");
  clearMarkBtn.type = "button";
  clearMarkBtn.className = "btn btn--ghost";
  clearMarkBtn.textContent = "Снять отметку";
  clearMarkBtn.disabled = !selRoom || selRoom.pos_x == null || selRoom.pos_y == null;
  clearMarkBtn.onclick = () =>
    void run(async () => {
      const room = findRoomById(getSelectedRoomIdForCorridor(corridor.id));
      if (!room) return;
      await api.updateObject(room.id, {
        transition_zone_id: room.transition_zone_id,
        object_type_id: room.object_type.id,
        object_kind_id: room.object_kind.id,
        name: room.name,
        pos_x: null,
        pos_y: null,
      });
      if (state.placement.objectId === room.id) state.placement.objectId = null;
      await loadFloorContext(state.selected.floorId);
      syncPlanHintStatus();
    });

  const deleteRoomBtn = document.createElement("button");
  deleteRoomBtn.type = "button";
  deleteRoomBtn.className = "btn btn--danger";
  deleteRoomBtn.textContent = "Удалить";
  deleteRoomBtn.disabled = !selectedRoomId;
  deleteRoomBtn.onclick = () =>
    void run(async () => {
      const room = findRoomById(getSelectedRoomIdForCorridor(corridor.id));
      if (!room) return;
      const confirmed = await askConfirmation({
        title: "Удаление помещения",
        message: `Удалить помещение «${room.name}»?`,
        okText: "Удалить",
        cancelText: "Отмена",
        destructive: true,
      });
      if (!confirmed) return;
      await api.deleteObject(room.id);
      delete state.corridorSelectedRoomId[corridor.id];
      await loadFloorContext(state.selected.floorId);
    });

  picker.append(pickerLabel, select);
  actions.append(editBtn, placeBtn, clearMarkBtn, deleteRoomBtn);

  body.append(picker, actions);
  panel.append(header, body);

  if (state.corridorAddRoomOpenId === corridor.id) {
    const addCard = document.createElement("div");
    addCard.className = "corridor-room-add-card";

    const addTitle = document.createElement("p");
    addTitle.className = "corridor-room-add-title";
    addTitle.textContent = "Новое помещение";

    const addForm = document.createElement("div");
    addForm.className = "corridor-room-add-form";

    const kindField = document.createElement("div");
    kindField.className = "corridor-room-field";
    const kindLabel = document.createElement("label");
    kindLabel.textContent = "Вид";
    const kindSelect = document.createElement("select");
    kindSelect.required = true;
    const kinds = roomKinds();
    if (!kinds.length) {
      kindSelect.disabled = true;
      appendSelectPlaceholder(
        kindSelect,
        "Добавьте виды к типу «Помещение» в справочнике",
      );
    } else {
      appendSelectPlaceholder(kindSelect, "Выберите вид");
    }
    for (const k of kinds) {
      const opt = document.createElement("option");
      opt.value = String(k.id);
      opt.textContent = k.name;
      kindSelect.appendChild(opt);
    }
    kindField.append(kindLabel, kindSelect);

    const nameField = document.createElement("div");
    nameField.className = "corridor-room-field";
    const nameLabel = document.createElement("label");
    nameLabel.textContent = "Название";
    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.placeholder = "Введите наименование";
    nameInput.autocomplete = "off";
    nameInput.required = true;
    const duplicateHint = document.createElement("p");
    duplicateHint.className = "form-inline-error corridor-room-duplicate-hint";
    duplicateHint.hidden = true;
    nameField.append(nameLabel, nameInput, duplicateHint);
    nameInput.addEventListener("input", () => setRoomDuplicateHint(duplicateHint, false));

    const addActions = document.createElement("div");
    addActions.className = "corridor-room-add-actions";

    const createBtn = document.createElement("button");
    createBtn.type = "button";
    createBtn.className = "btn btn--primary";
    createBtn.textContent = "Создать";
    createBtn.disabled = !kinds.length;
    createBtn.onclick = () =>
      void run(async () => {
        const object_kind_id = Number(kindSelect.value);
        const name = nameInput.value.trim();
        if (!object_kind_id || !name || !state.selected.planId) return;
        const kind = state.objectKinds.find((k) => k.id === object_kind_id);
        if (!kind) return;
        if (roomNameExistsOnFloor(name, kind.object_type_id)) {
          setRoomDuplicateHint(duplicateHint, true);
          nameInput.focus();
          return;
        }
        setRoomDuplicateHint(duplicateHint, false);
        const created = await api.createObject({
          plan_id: state.selected.planId,
          transition_zone_id: corridor.id,
          object_type_id: kind.object_type_id,
          object_kind_id,
          name,
        });
        state.corridorAddRoomOpenId = null;
        state.corridorSelectedRoomId[corridor.id] = created.id;
        const startPlacement = !!dom.planImage.getAttribute("src");
        await loadFloorContext(state.selected.floorId);
        openRoomMetaDialog(created, {
          corridorId: corridor.id,
          isNewCreate: true,
          startPlacementAfterSave: startPlacement,
        });
      });

    const cancelAddBtn = document.createElement("button");
    cancelAddBtn.type = "button";
    cancelAddBtn.className = "btn btn--ghost";
    cancelAddBtn.textContent = "Отмена";
    cancelAddBtn.onclick = () => {
      state.corridorAddRoomOpenId = null;
      renderObjects();
    };

    addActions.append(createBtn, cancelAddBtn);
    addForm.append(kindField, nameField, addActions);
    addCard.append(addTitle, addForm);
    panel.appendChild(addCard);
  }

  return panel;
}

/** Цвет маркера по русскому названию типа (без полей в БД). */
function markerClassByTypeName(obj) {
  const n = (obj.object_kind?.name || obj.object_type?.name || "").toLowerCase();
  if (n.includes("коридор")) return "plan-marker--corridor";
  if (n.includes("лестниц")) return "plan-marker--stair";
  if (n.includes("лифт")) return "plan-marker--lift";
  return "plan-marker--room";
}

function getZoneAccentKey(obj) {
  const n = (obj.object_kind?.name || obj.object_type?.name || "").toLowerCase();
  if (n.includes("коридор")) return "corridor";
  if (n.includes("лестниц")) return "stair";
  if (n.includes("лифт")) return "lift";
  return "default";
}

function isPlanLegendHidden() {
  return localStorage.getItem(PLAN_LEGEND_HIDDEN_STORAGE_KEY) === "1";
}

function applyPlanLegendVisibility() {
  if (!dom.planMarkerLegend || !dom.planMarkerLegendToggle) return;
  const hidden = isPlanLegendHidden();
  dom.planMarkerLegend.hidden = hidden;
  dom.planMarkerLegendToggle.textContent = hidden ? "Показать подсказку" : "Скрыть подсказку";
}

function setImageModalPlacementUi(active) {
  if (dom.imageModalStage) {
    dom.imageModalStage.classList.toggle("image-modal-stage--placement", active);
  }
}

function updatePlacementCursorHint(event) {
  if (!dom.imageModalHint) return;
  const zoneId = state.placement.transitionZoneId;
  const objectId = state.placement.objectId;
  if (zoneId == null && objectId == null) return;

  const label =
    zoneId != null
      ? (state.planDetail?.transition_zones || []).find((z) => z.id === zoneId)?.name || "зона"
      : findRoomById(objectId)?.name || "помещение";

  const coords = getNormalizedImageCoordsFromEvent(event, dom.imageModalImg);
  if (!coords) {
    dom.imageModalHint.textContent = `Установка точки: ${label}. Курсор вне изображения.`;
    return;
  }
  const xPct = (coords.x * 100).toFixed(1);
  const yPct = (coords.y * 100).toFixed(1);
  dom.imageModalHint.textContent = `Установка точки: ${label}. X: ${xPct}%, Y: ${yPct}% — кликните для сохранения.`;
}

function askConfirmation({
  title,
  message,
  okText = "Подтвердить",
  cancelText = "Закрыть",
  destructive = false,
}) {
  dom.confirmTitle.textContent = title || "Подтверждение";
  dom.confirmMessage.textContent = message || "";
  dom.confirmOkBtn.textContent = okText;
  dom.confirmCancelBtn.textContent = cancelText;
  dom.confirmOkBtn.className = destructive ? "btn btn--danger" : "btn btn--primary";
  dom.confirmCancelBtn.className = "btn btn--secondary";
  dom.confirmOverlay.hidden = false;
  dom.confirmOkBtn.focus();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

/** Pixel box of the bitmap as laid out with object-fit:contain inside the img element. */
function getObjectFitContainMetrics(img) {
  const rect = img.getBoundingClientRect();
  const elW = rect.width;
  const elH = rect.height;
  if (!elW || !elH) return null;
  const natW = img.naturalWidth;
  const natH = img.naturalHeight;
  if (!natW || !natH) {
    return { elW, elH, offX: 0, offY: 0, dispW: elW, dispH: elH };
  }
  const scale = Math.min(elW / natW, elH / natH);
  const dispW = natW * scale;
  const dispH = natH * scale;
  const offX = (elW - dispW) / 2;
  const offY = (elH - dispH) / 2;
  return { elW, elH, offX, offY, dispW, dispH };
}

function appendPlanMarker(container, imgEl, m, item, className, title, onClick) {
  if (item.pos_x == null || item.pos_y == null) return;
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = `plan-marker ${className}`;
  if (m) {
    const leftPct = ((m.offX + item.pos_x * m.dispW) / m.elW) * 100;
    const topPct = ((m.offY + item.pos_y * m.dispH) / m.elH) * 100;
    marker.style.left = `${leftPct}%`;
    marker.style.top = `${topPct}%`;
  } else {
    marker.style.left = `${item.pos_x * 100}%`;
    marker.style.top = `${item.pos_y * 100}%`;
  }
  marker.title = title;
  marker.setAttribute("aria-label", title);
  marker.style.pointerEvents = "auto";
  marker.onclick = onClick;
  container.appendChild(marker);
}

function renderPlanMarkersIn(container, imgEl) {
  container.innerHTML = "";
  const zones = state.planDetail?.transition_zones || [];
  const rooms = state.planDetail?.objects || [];
  const m = getObjectFitContainMetrics(imgEl);

  for (const obj of zones) {
    appendPlanMarker(
      container,
      imgEl,
      m,
      obj,
      markerClassByTypeName(obj),
      `${obj.object_type.name}: ${obj.name}`,
      (e) => {
        e.stopPropagation();
        if (state.placement.transitionZoneId != null) {
          startPlacementForTransitionZone(obj.id);
          return;
        }
        if (state.placement.objectId != null) return;
        focusTransitionZoneInList(obj.id);
      },
    );
  }

  for (const room of rooms) {
    if (room.transition_zone_id == null) continue;
    const kindName = room.object_kind?.name || "Помещение";
    appendPlanMarker(
      container,
      imgEl,
      m,
      room,
      "plan-marker--room",
      `${kindName}: ${room.name}`,
      (e) => {
        e.stopPropagation();
        if (state.placement.objectId != null) {
          startPlacementForObject(room.id);
          return;
        }
        if (state.placement.transitionZoneId != null) return;
        focusRoomInCorridor(room.transition_zone_id, room.id);
      },
    );
  }
}

function renderPlanMarkers() {
  if (
    state.planDetail &&
    dom.planImage.style.display !== "none" &&
    dom.planImage.getAttribute("src")
  ) {
    renderPlanMarkersIn(dom.planMarkers, dom.planImage);
  } else {
    dom.planMarkers.innerHTML = "";
  }
  if (
    state.planDetail &&
    !dom.imageModalOverlay.hidden &&
    dom.imageModalImg.getAttribute("src")
  ) {
    renderPlanMarkersIn(dom.imageModalMarkers, dom.imageModalImg);
  }
}

function startPlacementForTransitionZone(zoneId) {
  if (!state.selected.floorId || !dom.planImage.getAttribute("src")) return;
  state.placement.transitionZoneId = zoneId;
  state.placement.objectId = null;
  const obj = (state.planDetail?.transition_zones || []).find((x) => x.id === zoneId);
  const zoneName = obj?.name || "зона";
  dom.planHint.textContent = `Режим установки точки: ${zoneName}. Кликните по зоне на плане.`;
  openImageModal(dom.planImage.getAttribute("src"), {
    placementMode: true,
    objectName: zoneName,
  });
  renderObjects();
  renderPlanMarkers();
}

function startPlacementForObject(objectId) {
  if (!state.selected.floorId || !dom.planImage.getAttribute("src")) return;
  state.placement.objectId = objectId;
  state.placement.transitionZoneId = null;
  const room = findRoomById(objectId);
  const roomName = room?.name || "помещение";
  dom.planHint.textContent = `Режим установки точки: ${roomName}. Кликните по плану.`;
  openImageModal(dom.planImage.getAttribute("src"), {
    placementMode: true,
    objectName: roomName,
  });
  renderObjects();
  renderPlanMarkers();
}

function focusRoomInCorridor(corridorId, roomId) {
  state.focusedObjectId = roomId;
  state.focusedTransitionZoneId = null;
  state.corridorSelectedRoomId[corridorId] = roomId;
  if (!dom.imageModalOverlay.hidden) {
    closeImageModal();
  } else {
    renderPlanMarkers();
  }
  renderObjects();
  const section = dom.zonesList?.querySelector(
    `.zone-section[data-transition-zone-id="${corridorId}"]`,
  );
  if (section) section.scrollIntoView({ behavior: "smooth", block: "center" });
}

function focusTransitionZoneInList(zoneId) {
  state.focusedTransitionZoneId = zoneId;
  if (!dom.imageModalOverlay.hidden) {
    closeImageModal();
  } else {
    renderPlanMarkers();
  }
  renderObjects();
  const section = dom.zonesList?.querySelector(
    `.zone-section[data-transition-zone-id="${zoneId}"]`,
  );
  if (section) {
    section.scrollIntoView({ behavior: "smooth", block: "center" });
  }
}

function getNormalizedImageCoordsFromEvent(event, targetImage) {
  const m = getObjectFitContainMetrics(targetImage);
  if (!m) return null;
  const rect = targetImage.getBoundingClientRect();
  const cx = event.clientX - rect.left;
  const cy = event.clientY - rect.top;
  const x = (cx - m.offX) / m.dispW;
  const y = (cy - m.offY) / m.dispH;
  const nx = Math.max(0, Math.min(1, x));
  const ny = Math.max(0, Math.min(1, y));
  return { x: nx, y: ny };
}

function openRoomMetaDialog(room, options = {}) {
  const kind = room.object_kind;
  openEntityMetaDialog({
    kind: "room",
    id: room.id,
    shortName: room.name,
    fullName: room.full_name ?? "",
    description: room.description ?? "",
    objectKindId: kind?.id,
    objectTypeId: kind?.object_type_id ?? room.object_type?.id,
    objectKindName: kind?.name || "",
    parentId: options.corridorId ?? room.transition_zone_id,
    title: "Помещение",
    isNewCreate: !!options.isNewCreate,
    startPlacementAfterSave: !!options.startPlacementAfterSave,
  });
}

function openTransitionZoneMetaDialog(zone, options = {}) {
  const kind = zone.object_kind;
  openEntityMetaDialog({
    kind: "transition_zone",
    id: zone.id,
    shortName: zone.name,
    fullName: zone.full_name ?? "",
    description: zone.description ?? "",
    objectKindId: kind?.id,
    objectTypeName: zone.object_type?.name || TRANSITION_ZONE_TYPE_LABEL,
    objectKindName: kind?.name || "",
    parentId: state.selected.floorId,
    title: "Зона перехода",
    isNewCreate: !!options.isNewCreate,
    startPlacementAfterSave: !!options.startPlacementAfterSave,
  });
}

function openImageModal(src, options = {}) {
  if (!src) return;
  dom.imageModalImg.src = normalizeImageUrl(src);
  const placing = !!options.placementMode;
  setImageModalPlacementUi(placing);
  dom.imageModalHint.textContent = placing
    ? `Установка точки для: ${options.objectName}. Наведите курсор для координат, кликните для сохранения.`
    : "";
  dom.closeImageModalBtn.textContent = placing ? "Закрыть (отмена)" : "Закрыть";
  renderPlanMarkers();
  dom.imageModalOverlay.hidden = false;
}

function closeImageModal() {
  if (state.placement.transitionZoneId != null || state.placement.objectId != null) {
    state.placement.transitionZoneId = null;
    state.placement.objectId = null;
    syncPlanHintStatus();
    renderObjects();
    renderPlanMarkers();
  }
  setImageModalPlacementUi(false);
  dom.imageModalOverlay.hidden = true;
  dom.imageModalImg.removeAttribute("src");
  dom.imageModalHint.textContent = "";
  dom.imageModalMarkers.innerHTML = "";
  dom.closeImageModalBtn.textContent = "Закрыть";
}

function closeConfirmModal(result = false) {
  if (!dom.confirmOverlay || dom.confirmOverlay.hidden) return;
  dom.confirmOverlay.hidden = true;
  const resolve = confirmResolver;
  confirmResolver = null;
  if (resolve) resolve(result);
}

function openEntityMetaDialog(ctx) {
  pendingMetaContext = ctx;
  dom.entityMetaTitle.textContent = ctx.title || "Дополнительные поля";
  if (dom.entityMetaParentWrap) dom.entityMetaParentWrap.hidden = true;
  const isDictNew = ctx.kind === "object_type_new" || ctx.kind === "object_kind_new";
  if (ctx.kind === "object_type_new") {
    if (dom.entityMetaNumberLabel) dom.entityMetaNumberLabel.textContent = "Номер";
    const n = predictedNextObjectTypeId();
    dom.entityMetaNumber.value = String(n);
    dom.entityMetaNumber.title =
      "Номер совпадает с id записи; до сохранения показано ожидаемое следующее значение.";
  } else if (ctx.kind === "object_kind_new") {
    const n = predictedNextObjectKindId();
    dom.entityMetaNumber.value = String(n);
    dom.entityMetaNumber.title =
      "Номер совпадает с id записи; до сохранения показано ожидаемое следующее значение.";
  } else if (ctx.kind === "object_type" || ctx.kind === "object_kind") {
    if (dom.entityMetaNumberLabel) dom.entityMetaNumberLabel.textContent = "Номер";
    const num = ctx.number != null ? ctx.number : ctx.id;
    dom.entityMetaNumber.value = num != null ? String(num) : "";
    dom.entityMetaNumber.title = "Только просмотр, изменить нельзя.";
  } else if (ctx.kind === "transition_zone" || ctx.kind === "room") {
    dom.entityMetaNumber.value = ctx.id != null ? String(ctx.id) : "";
    dom.entityMetaNumber.title = "Присваивается автоматически при создании.";
    if (dom.entityMetaNumberLabel) dom.entityMetaNumberLabel.textContent = "Код (id)";
  } else if (isHierarchyMetaKind(ctx.kind)) {
    dom.entityMetaNumber.value = ctx.id != null ? String(ctx.id) : "";
    dom.entityMetaNumber.title = "Присваивается автоматически при создании.";
    if (dom.entityMetaNumberLabel) dom.entityMetaNumberLabel.textContent = "Код (id)";
  } else {
    dom.entityMetaNumber.value = ctx.id != null ? String(ctx.id) : "";
    dom.entityMetaNumber.title = "";
    if (dom.entityMetaNumberLabel) dom.entityMetaNumberLabel.textContent = "Номер";
  }
  if (dom.entityMetaParentWrap) {
    const showParent =
      (isHierarchyMetaKind(ctx.kind) ||
        ctx.kind === "transition_zone" ||
        ctx.kind === "room") &&
      ctx.parentId != null;
    dom.entityMetaParentWrap.hidden = !showParent;
    if (dom.entityMetaParentId) {
      dom.entityMetaParentId.value = showParent ? String(ctx.parentId) : "";
    }
  }
  const isTz = ctx.kind === "transition_zone";
  const isRoom = ctx.kind === "room";
  if (dom.entityMetaTypeWrap) {
    dom.entityMetaTypeWrap.hidden = !isTz;
    if (dom.entityMetaReadType) {
      dom.entityMetaReadType.value = isTz ? ctx.objectTypeName || TRANSITION_ZONE_TYPE_LABEL : "";
    }
  }
  if (dom.entityMetaKindReadWrap) {
    dom.entityMetaKindReadWrap.hidden = !isTz;
    if (dom.entityMetaReadKind) {
      dom.entityMetaReadKind.value = isTz ? ctx.objectKindName || "—" : "";
    }
  }
  if (dom.entityMetaKindEditWrap) {
    dom.entityMetaKindEditWrap.hidden = !isRoom;
    if (isRoom && dom.entityMetaKindSelect) {
      fillRoomKindSelect(dom.entityMetaKindSelect, ctx.objectKindId);
    }
  }
  dom.entityMetaShortName.value = ctx.shortName || "";
  setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, false);
  dom.entityMetaFullName.value = ctx.fullName ?? "";
  dom.entityMetaDescription.value = ctx.description ?? "";
  dom.entityMetaAddress.value = "";
  const noLoc =
    ctx.kind === "object_type" ||
    ctx.kind === "object_kind" ||
    ctx.kind === "object_type_new" ||
    ctx.kind === "object_kind_new" ||
    ctx.kind === "transition_zone" ||
    ctx.kind === "room";
  dom.entityMetaAddressWrap.hidden = noLoc;
  dom.entityMetaOverlay.hidden = false;
  dom.entityMetaShortName.focus();
}

function closeEntityMetaDialog() {
  dom.entityMetaOverlay.hidden = true;
  pendingMetaContext = null;
  dom.entityMetaForm.reset();
  setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, false);
}

async function rollbackHierarchyCreateCancel(ctx) {
  if (!ctx?.id) return;

  if (ctx.kind === "floor") {
    await api.deleteFloor(ctx.id);
    state.selected.floorId = null;
    clearPlanView();
    state.floors = await api.getFloors(state.selected.structureId);
    fillSelect(dom.floorSelect, state.floors, SELECT_FLOOR_PLACEHOLDER);
    dom.createFloorName.value = ctx.shortName || "";
    dom.pageTitle.textContent = getSelectedName(state.structures, state.selected.structureId);
    setMode("structure");
    if (state.selected.structureId) loadEntityImage("structure", state.selected.structureId);
    renderPath();
    syncEntityEditCard();
    syncDeleteBranchButton();
    return;
  }
  if (ctx.kind === "structure") {
    await api.deleteStructure(ctx.id);
    state.selected.structureId = null;
    state.selected.floorId = null;
    clearPlanView();
    state.structures = await api.getStructures(state.selected.buildingId);
    fillSelect(dom.structureSelect, state.structures, SELECT_STRUCTURE_PLACEHOLDER);
    fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);
    dom.createStructureName.value = ctx.shortName || "";
    dom.pageTitle.textContent = getSelectedName(state.buildings, state.selected.buildingId);
    setMode("building");
    loadEntityImage("building", state.selected.buildingId);
    renderPath();
    syncEntityEditCard();
    syncDeleteBranchButton();
    return;
  }
  if (ctx.kind === "building") {
    await api.deleteBuilding(ctx.id);
    state.selected.buildingId = null;
    state.selected.structureId = null;
    state.selected.floorId = null;
    clearPlanView();
    state.buildings = await api.getBuildings(state.selected.campusId);
    fillSelect(dom.buildingSelect, state.buildings, SELECT_BUILDING_PLACEHOLDER);
    fillSelect(dom.structureSelect, [], SELECT_STRUCTURE_PLACEHOLDER, true);
    fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);
    dom.createBuildingName.value = ctx.shortName || "";
    dom.pageTitle.textContent = getSelectedName(state.campuses, state.selected.campusId);
    setMode("campus");
    loadEntityImage("campus", state.selected.campusId);
    renderPath();
    syncEntityEditCard();
    syncDeleteBranchButton();
    return;
  }
  if (ctx.kind === "campus") {
    await api.deleteCampus(ctx.id);
    dom.createCampusName.value = ctx.shortName || "";
    await loadInitialLists();
  }
}

async function rollbackTransitionZoneCreateCancel(ctx) {
  if (!ctx?.id) return;
  await api.deleteTransitionZone(ctx.id);
  dom.nameInput.value = ctx.shortName || "";
  if (ctx.objectKindId && dom.kindSelect) {
    dom.kindSelect.value = String(ctx.objectKindId);
  }
  await loadFloorContext(state.selected.floorId);
}

async function rollbackRoomCreateCancel(ctx) {
  if (!ctx?.id) return;
  await api.deleteObject(ctx.id);
  if (ctx.parentId) delete state.corridorSelectedRoomId[ctx.parentId];
  await loadFloorContext(state.selected.floorId);
}

async function refreshListsAfterMetaCancel(ctx) {
  if (!ctx) return;
  if (ctx.isNewCreate && ctx.kind === "transition_zone") {
    await rollbackTransitionZoneCreateCancel(ctx);
    return;
  }
  if (ctx.isNewCreate && ctx.kind === "room") {
    await rollbackRoomCreateCancel(ctx);
    return;
  }
  if (ctx.isNewCreate && isHierarchyMetaKind(ctx.kind)) {
    await rollbackHierarchyCreateCancel(ctx);
    return;
  }
  if (ctx.kind === "object_type_new") {
    dom.objectTypeNameInput.value = ctx.shortName || "";
    return;
  }
  if (ctx.kind === "object_kind_new") {
    dom.objectKindNameInput.value = ctx.shortName || "";
    return;
  }
  if (ctx.kind === "object_type" || ctx.kind === "object_kind") {
    await loadObjectDictionaries();
    return;
  }
}

function syncDownloadButton(enabled) {
  if (!dom.downloadImageBtn) return;
  dom.downloadImageBtn.disabled = !enabled;
}

/** Без всплывающих «сохранено» — только пусто или «нет изображения». */
function syncPlanHintStatus() {
  if (!dom.planHint) return;
  if (state.placement.transitionZoneId != null || state.placement.objectId != null) return;
  if (dom.planImage.getAttribute("src")) {
    dom.planHint.textContent = "";
  } else {
    dom.planHint.textContent = "Изображение не загружено.";
  }
}

function applyPlanMarkerScale(scale) {
  const n = Number(scale);
  const clamped = Math.min(
    PLAN_MARKER_SCALE_MAX,
    Math.max(PLAN_MARKER_SCALE_MIN, Number.isFinite(n) ? n : PLAN_MARKER_SCALE_DEFAULT),
  );
  state.planMarkerScale = clamped;
  if (dom.planMarkerScale) dom.planMarkerScale.value = String(clamped);
  for (const el of [dom.planMarkers, dom.imageModalMarkers]) {
    if (el) el.style.setProperty("--plan-marker-scale", String(clamped));
  }
  try {
    localStorage.setItem(PLAN_MARKER_SCALE_STORAGE_KEY, String(clamped));
  } catch {
    /* ignore */
  }
  if (state.planDetail) renderPlanMarkers();
}

function initPlanMarkerScale() {
  let initial = PLAN_MARKER_SCALE_DEFAULT;
  try {
    const stored = localStorage.getItem(PLAN_MARKER_SCALE_STORAGE_KEY);
    if (stored != null) initial = Number(stored);
  } catch {
    /* ignore */
  }
  applyPlanMarkerScale(initial);
  if (dom.planMarkerScale) {
    dom.planMarkerScale.addEventListener("input", () => {
      applyPlanMarkerScale(dom.planMarkerScale.value);
    });
  }
}

async function downloadCurrentPhoto() {
  const url = dom.planImage.getAttribute("src");
  if (!url) return;

  const hierarchyFilename = (() => {
    const extFromUrl = (() => {
      try {
        const u = new URL(url);
        const last = u.pathname.split("/").filter(Boolean).at(-1) || "";
        const m = last.match(/\.([a-z0-9]+)$/i);
        return m ? `.${m[1].toLowerCase()}` : ".jpg";
      } catch {
        return ".jpg";
      }
    })();

    const parts = [];
    if (state.selected.campusId) parts.push(getSelectedName(state.campuses, state.selected.campusId));
    if (state.selected.buildingId) parts.push(getSelectedName(state.buildings, state.selected.buildingId));
    if (state.selected.structureId) parts.push(getSelectedName(state.structures, state.selected.structureId));
    if (state.selected.floorId) parts.push(getSelectedName(state.floors, state.selected.floorId));

    const label = (parts.filter(Boolean).join(" / ") || "photo").trim();
    // Windows filename safety: replace invalid chars, keep unicode.
    const safe = label
      .replace(/\s\/\s/g, " - ")
      .replace(/[<>:"/\\|?*]/g, "_");
    return `${safe}${extFromUrl}`;
  })();

  try {
    const res = await fetch(url, { mode: "cors" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = objectUrl;
    a.download = hierarchyFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(objectUrl);
  } catch {
    const a = document.createElement("a");
    a.href = url;
    a.download = hierarchyFilename;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
}

async function loadFloorContext(floorId) {
  const ctx = await api.getFloorContext(floorId);
  state.selected.planId = ctx.plan.id;
  state.planDetail = {
    plan: ctx.plan,
    objects: ctx.objects ?? [],
    transition_zones: ctx.transition_zones ?? [],
  };
  const floorRow = state.floors.find((f) => f.id === floorId);
  if (floorRow) floorRow.plan_photo_url = ctx.plan.photo_url ?? null;

  if (ctx.plan.photo_url) {
    dom.planImage.src = normalizeImageUrl(ctx.plan.photo_url);
    dom.planImage.style.display = "block";
    dom.planHint.textContent = "";
    syncDownloadButton(true);
  } else {
    dom.planImage.removeAttribute("src");
    dom.planImage.style.display = "none";
    dom.planHint.textContent = "Изображение не загружено.";
    syncDownloadButton(false);
  }

  renderObjects();
  renderPlanMarkers();
  syncEntityEditCard();
}

async function onCampusChange() {
  const newId = Number(dom.campusSelect.value) || null;
  if (newId === state.selected.campusId) return;
  if (!newId) {
    await loadInitialLists();
    return;
  }

  state.selected.campusId = newId;
  state.selected.buildingId = null;
  state.selected.structureId = null;
  state.selected.floorId = null;
  clearPlanView();

  state.buildings = await api.getBuildings(state.selected.campusId);
  state.structures = [];
  state.floors = [];
  fillSelect(dom.buildingSelect, state.buildings, SELECT_BUILDING_PLACEHOLDER);
  fillSelect(dom.structureSelect, [], SELECT_STRUCTURE_PLACEHOLDER, true);
  fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);
  dom.pageTitle.textContent = getSelectedName(state.campuses, state.selected.campusId);
  setMode("campus");
  loadEntityImage("campus", state.selected.campusId);
  renderPath();
  syncDeleteBranchButton();
  syncEntityEditCard();
}

async function onBuildingChange() {
  const newId = Number(dom.buildingSelect.value) || null;
  if (newId === state.selected.buildingId) return;

  state.selected.buildingId = newId;
  state.selected.structureId = null;
  state.selected.floorId = null;
  clearPlanView();

  if (!newId) {
    state.structures = [];
    state.floors = [];
    fillSelect(dom.structureSelect, [], SELECT_STRUCTURE_PLACEHOLDER, true);
    fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);
    await navigateToLevel("campus");
    return;
  }

  state.structures = await api.getStructures(state.selected.buildingId);
  state.floors = [];
  fillSelect(dom.structureSelect, state.structures, SELECT_STRUCTURE_PLACEHOLDER);
  fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);
  dom.pageTitle.textContent = getSelectedName(state.buildings, state.selected.buildingId);
  setMode("building");
  loadEntityImage("building", state.selected.buildingId);
  renderPath();
  syncDeleteBranchButton();
  syncEntityEditCard();
}

async function onStructureChange() {
  const newId = Number(dom.structureSelect.value) || null;
  if (newId === state.selected.structureId) return;

  state.selected.structureId = newId;
  state.selected.floorId = null;
  clearPlanView();

  if (!newId) {
    state.floors = [];
    fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);
    await navigateToLevel("building");
    return;
  }

  state.floors = await api.getFloors(state.selected.structureId);
  fillSelect(dom.floorSelect, state.floors, SELECT_FLOOR_PLACEHOLDER);
  dom.pageTitle.textContent = getSelectedName(state.structures, state.selected.structureId);
  setMode("structure");
  loadEntityImage("structure", state.selected.structureId);
  renderPath();
  syncDeleteBranchButton();
  syncEntityEditCard();
}

async function onFloorChange() {
  const newId = Number(dom.floorSelect.value) || null;
  if (newId === state.selected.floorId) return;

  state.selected.floorId = newId;
  if (!newId) {
    clearPlanView();
    await navigateToLevel("structure");
    return;
  }

  dom.pageTitle.textContent = getSelectedName(state.floors, state.selected.floorId);
  setMode("floor");
  await refreshFloorTransitionZoneKinds();
  await loadFloorContext(state.selected.floorId);
  renderPath();
  syncDeleteBranchButton();
  syncEntityEditCard();
}

async function loadInitialLists() {
  state.campuses = await api.getCampuses();
  fillSelect(dom.campusSelect, state.campuses, SELECT_CAMPUS_PLACEHOLDER);
  fillSelect(dom.buildingSelect, [], SELECT_BUILDING_PLACEHOLDER, true);
  fillSelect(dom.structureSelect, [], SELECT_STRUCTURE_PLACEHOLDER, true);
  fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);

  state.selected = { campusId: null, buildingId: null, structureId: null, floorId: null, planId: null };
  clearPlanView();
  dom.pageTitle.textContent = ADMIN_HOME_PAGE_TITLE;
  setMode("none");
  renderPath();
  syncDeleteBranchButton();
  syncEntityEditCard();
}

async function deleteSelectedBranch() {
  if (!state.selected.campusId) return;
  if (confirmResolver) return;
  let branchKind = "campus";
  if (state.selected.floorId) branchKind = "floor";
  else if (state.selected.structureId) branchKind = "structure";
  else if (state.selected.buildingId) branchKind = "building";

  const ok = await askConfirmation({
    title: "Удаление объекта",
    message:
      "Будут удалены выбранный объект и все уровни ниже по дереву. Удалить или вернуться?",
    okText: "Удалить",
    cancelText: "Вернуться",
    destructive: true,
  });
  if (!ok) return;

  if (branchKind === "floor") {
    await api.deleteFloor(state.selected.floorId);
    state.selected.floorId = null;
    clearPlanView();
    state.floors = await api.getFloors(state.selected.structureId);
    fillSelect(dom.floorSelect, state.floors, SELECT_FLOOR_PLACEHOLDER);
    dom.pageTitle.textContent = getSelectedName(state.structures, state.selected.structureId);
    setMode("structure");
    loadEntityImage("structure", state.selected.structureId);
    renderPath();
    syncDeleteBranchButton();
    return;
  }
  if (branchKind === "structure") {
    await api.deleteStructure(state.selected.structureId);
    state.selected.structureId = null;
    state.selected.floorId = null;
    clearPlanView();
    state.structures = await api.getStructures(state.selected.buildingId);
    fillSelect(dom.structureSelect, state.structures, SELECT_STRUCTURE_PLACEHOLDER);
    fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);
    dom.pageTitle.textContent = getSelectedName(state.buildings, state.selected.buildingId);
    setMode("building");
    loadEntityImage("building", state.selected.buildingId);
    renderPath();
    syncDeleteBranchButton();
    return;
  }
  if (branchKind === "building") {
    await api.deleteBuilding(state.selected.buildingId);
    state.selected.buildingId = null;
    state.selected.structureId = null;
    state.selected.floorId = null;
    clearPlanView();
    state.buildings = await api.getBuildings(state.selected.campusId);
    fillSelect(dom.buildingSelect, state.buildings, SELECT_BUILDING_PLACEHOLDER);
    fillSelect(dom.structureSelect, [], SELECT_STRUCTURE_PLACEHOLDER, true);
    fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);
    dom.pageTitle.textContent = getSelectedName(state.campuses, state.selected.campusId);
    setMode("campus");
    loadEntityImage("campus", state.selected.campusId);
    renderPath();
    syncDeleteBranchButton();
    return;
  }
  await api.deleteCampus(state.selected.campusId);
  await loadInitialLists();
}

function renderObjectTypesDictionary() {
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
        shortName: t.name,
        fullName: t.full_name ?? "",
        description: t.description ?? "",
        title: "Тип объекта",
      });
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn btn--danger";
    deleteBtn.textContent = "Удалить";
    deleteBtn.onclick = () =>
      void run(async () => {
        const ok = await askConfirmation({
          title: "Удаление типа",
          message: `Удалить тип «${t.name}»?`,
          okText: "Удалить",
          cancelText: "Отмена",
          destructive: true,
        });
        if (!ok) return;
        await api.deleteObjectType(t.id);
        await loadObjectDictionaries();
      });

    wrap.append(editBtn, deleteBtn);
    actionCell.appendChild(wrap);
    tr.append(nameCell, actionCell);
    dom.objectTypesTbody.appendChild(tr);
  }
}

function renderObjectKindsDictionary() {
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
        shortName: k.name,
        fullName: k.full_name ?? "",
        description: k.description ?? "",
        title: "Вид объекта",
      });
    };

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
        await api.deleteObjectKind(k.id);
        await loadObjectDictionaries();
      });
    wrap.append(editBtn, deleteBtn);
    actionCell.appendChild(wrap);
    tr.append(typeCell, nameCell, actionCell);
    dom.objectKindsTbody.appendChild(tr);
  }
}

function syncKindSelects() {
  fillSelect(dom.kindSelect, transitionZoneKinds(), "Вид зоны перехода");
  fillSelect(dom.objectKindTypeSelect, state.objectTypes, "Тип объекта");
  const tzType = findTransitionZoneCatalogType();
  if (tzType && dom.objectKindTypeSelect && state.uiMode === "none") {
    dom.objectKindTypeSelect.value = String(tzType.id);
  }
}

async function loadObjectDictionaries() {
  const [types, kinds] = await Promise.all([api.getObjectTypes(), api.getObjectKinds()]);
  state.objectTypes = types;
  state.objectKinds = kinds;
  syncKindSelects();
  renderObjectTypesDictionary();
  renderObjectKindsDictionary();
}

/** Актуальный список видов зоны перехода для формы этажа (после правок справочника). */
async function refreshFloorTransitionZoneKinds() {
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

function nextFloorSortOrder() {
  if (!state.floors.length) return 0;
  return Math.max(...state.floors.map((f) => f.sort_order)) + 1;
}

/** Ожидаемый следующий id (на бэкенде number выставляется равным id). До сохранения — только подсказка. */
function predictedNextObjectTypeId() {
  if (!state.objectTypes.length) return 1;
  return Math.max(...state.objectTypes.map((t) => t.id)) + 1;
}

function predictedNextObjectKindId() {
  if (!state.objectKinds.length) return 1;
  return Math.max(...state.objectKinds.map((k) => k.id)) + 1;
}

function entityMetaHasOptionalGaps(kind, full, desc, addr) {
  if (
    kind === "object_type" ||
    kind === "object_kind" ||
    kind === "object_type_new" ||
    kind === "object_kind_new" ||
    kind === "transition_zone" ||
    kind === "room"
  ) {
    return !full || !desc;
  }
  return !full || !desc || !addr;
}

async function submitEntityMetaDialog(e) {
  e.preventDefault();
  if (confirmResolver) return;
  if (entityMetaSaving) return;
  if (!pendingMetaContext) return;
  const ctx = pendingMetaContext;
  const short = dom.entityMetaShortName.value.trim();
  if (!short) return;
  const full = dom.entityMetaFullName.value.trim();
  const desc = dom.entityMetaDescription.value.trim();
  const addr = dom.entityMetaAddress.value.trim();

  if (entityMetaHasOptionalGaps(ctx.kind, full, desc, addr)) {
    entityMetaSaving = true;
    let ok = false;
    try {
      ok = await askConfirmation({
        title: "Внимание",
        message:
          "У вас остались незаполненные поля. Вернитесь к заполнению или сохраните с пустыми полями.",
        okText: "Сохранить",
        cancelText: "Вернуться",
      });
    } finally {
      entityMetaSaving = false;
    }
    if (!ok) return;
  }

  entityMetaSaving = true;
  try {
  if (ctx.kind === "object_type_new") {
    await api.createObjectType({
      name: short,
      full_name: full || null,
      description: desc || null,
    });
    closeEntityMetaDialog();
    dom.objectTypeNameInput.value = "";
    await loadObjectDictionaries();
    return;
  }
  if (ctx.kind === "object_kind_new") {
    const created = await api.createObjectKind({
      object_type_id: ctx.objectTypeId,
      name: short,
      full_name: full || null,
      description: desc || null,
    });
    const createdId = Number(created?.id);
    if (Number.isFinite(createdId) && !state.objectKinds.some((k) => Number(k.id) === createdId)) {
      state.objectKinds.push(created);
    }
    closeEntityMetaDialog();
    dom.objectKindNameInput.value = "";
    await loadObjectDictionaries();
    return;
  }

  const id = ctx.id;
  const numVal = Number(dom.entityMetaNumber.value) || id;

  if (ctx.kind === "object_type") {
    await api.updateObjectType(id, {
      name: short,
      number: numVal,
      full_name: full || null,
      description: desc || null,
    });
    closeEntityMetaDialog();
    await loadObjectDictionaries();
    return;
  }
  if (ctx.kind === "object_kind") {
    await api.updateObjectKind(id, {
      object_type_id: ctx.objectTypeId,
      name: short,
      number: numVal,
      full_name: full || null,
      description: desc || null,
    });
    closeEntityMetaDialog();
    await loadObjectDictionaries();
    return;
  }
  if (ctx.kind === "campus") {
    await api.updateCampus(id, {
      name: short,
      number: numVal,
      full_name: full || null,
      description: desc || null,
      address: addr || null,
    });
    closeEntityMetaDialog();
    state.campuses = await api.getCampuses();
    fillSelect(dom.campusSelect, state.campuses, SELECT_CAMPUS_PLACEHOLDER);
    dom.campusSelect.value = String(id);
    await onCampusChange();
    return;
  }
  if (ctx.kind === "building") {
    await api.updateBuilding(id, {
      name: short,
      number: numVal,
      full_name: full || null,
      description: desc || null,
      address: addr || null,
    });
    closeEntityMetaDialog();
    state.buildings = await api.getBuildings(state.selected.campusId);
    fillSelect(dom.buildingSelect, state.buildings, SELECT_BUILDING_PLACEHOLDER);
    dom.buildingSelect.value = String(id);
    await onBuildingChange();
    return;
  }
  if (ctx.kind === "structure") {
    await api.updateStructure(id, {
      name: short,
      number: numVal,
      full_name: full || null,
      description: desc || null,
      address: addr || null,
    });
    closeEntityMetaDialog();
    state.structures = await api.getStructures(state.selected.buildingId);
    fillSelect(dom.structureSelect, state.structures, SELECT_STRUCTURE_PLACEHOLDER);
    dom.structureSelect.value = String(id);
    await onStructureChange();
    return;
  }
  if (ctx.kind === "floor") {
    await api.updateFloor(id, {
      name: short,
      number: numVal,
      full_name: full || null,
      description: desc || null,
      address: addr || null,
    });
    closeEntityMetaDialog();
    state.floors = await api.getFloors(state.selected.structureId);
    fillSelect(dom.floorSelect, state.floors, SELECT_FLOOR_PLACEHOLDER);
    dom.floorSelect.value = String(id);
    await onFloorChange();
    return;
  }
  if (ctx.kind === "transition_zone") {
    const object_kind_id = ctx.objectKindId;
    if (!object_kind_id) return;
    const zone = (state.planDetail?.transition_zones || []).find((z) => z.id === id);
    await api.updateTransitionZone(id, {
      object_kind_id,
      name: short,
      number: numVal,
      full_name: full || null,
      description: desc || null,
      pos_x: zone?.pos_x ?? null,
      pos_y: zone?.pos_y ?? null,
    });
    closeEntityMetaDialog();
    await loadFloorContext(state.selected.floorId);
    if (ctx.startPlacementAfterSave) {
      startPlacementForTransitionZone(id);
    } else if (!dom.planImage.getAttribute("src")) {
      dom.planHint.textContent =
        "Зона добавлена. Загрузите изображение плана этажа, чтобы отметить точку на чертеже.";
    }
    return;
  }
  if (ctx.kind === "room") {
    const object_kind_id = Number(dom.entityMetaKindSelect?.value) || ctx.objectKindId;
    const object_type_id = ctx.objectTypeId;
    const transition_zone_id = ctx.parentId;
    if (!object_kind_id || !object_type_id || !transition_zone_id) return;
    const kind = state.objectKinds.find((k) => k.id === object_kind_id);
    const resolvedTypeId = kind?.object_type_id ?? object_type_id;
    if (roomNameExistsOnFloor(short, resolvedTypeId, id)) {
      setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, true);
      dom.entityMetaShortName.focus();
      return;
    }
    setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, false);
    const room = findRoomById(id);
    await api.updateObject(id, {
      transition_zone_id,
      object_type_id: resolvedTypeId,
      object_kind_id,
      name: short,
      number: numVal,
      full_name: full || null,
      description: desc || null,
      pos_x: room?.pos_x ?? null,
      pos_y: room?.pos_y ?? null,
    });
    closeEntityMetaDialog();
    await loadFloorContext(state.selected.floorId);
    if (ctx.startPlacementAfterSave) {
      startPlacementForObject(id);
    } else if (!dom.planImage.getAttribute("src")) {
      dom.planHint.textContent =
        "Помещение добавлено. Загрузите изображение плана этажа, чтобы отметить точку на чертеже.";
    }
    return;
  }
  } finally {
    entityMetaSaving = false;
  }
}

dom.entityMetaForm.addEventListener("submit", (e) =>
  run(async () => {
    await submitEntityMetaDialog(e);
  }),
);
dom.entityMetaCancelBtn.addEventListener("click", () =>
  run(async () => {
    const ctx = pendingMetaContext;
    closeEntityMetaDialog();
    await refreshListsAfterMetaCancel(ctx);
  }),
);
dom.entityMetaOverlay.addEventListener("click", (e) => {
  if (e.target === dom.entityMetaOverlay) {
    run(async () => {
      const ctx = pendingMetaContext;
      closeEntityMetaDialog();
      await refreshListsAfterMetaCancel(ctx);
    });
  }
});

dom.createCampusForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    const name = dom.createCampusName.value.trim();
    if (!name) return;
    const created = await api.createCampus({ name });
    dom.createCampusName.value = "";
    state.campuses = await api.getCampuses();
    fillSelect(dom.campusSelect, state.campuses, SELECT_CAMPUS_PLACEHOLDER);
    dom.campusSelect.value = String(created.id);
    await onCampusChange();
    openEntityMetaDialog({
      kind: "campus",
      id: created.id,
      shortName: created.name,
      title: "Кампус",
      isNewCreate: true,
    });
  }),
);

dom.createBuildingForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (!state.selected.campusId) return;
    const campusId = state.selected.campusId;
    const name = dom.createBuildingName.value.trim();
    if (!name) return;
    const created = await api.createBuilding({
      campus_id: campusId,
      name,
    });
    dom.createBuildingName.value = "";
    state.buildings = await api.getBuildings(state.selected.campusId);
    fillSelect(dom.buildingSelect, state.buildings, SELECT_BUILDING_PLACEHOLDER);
    dom.buildingSelect.value = String(created.id);
    await onBuildingChange();
    openEntityMetaDialog({
      kind: "building",
      id: created.id,
      shortName: created.name,
      parentId: campusId,
      title: "Корпус",
      isNewCreate: true,
    });
  }),
);

dom.createStructureForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (!state.selected.buildingId) return;
    const buildingId = state.selected.buildingId;
    const name = dom.createStructureName.value.trim();
    if (!name) return;
    const created = await api.createStructure({
      building_id: buildingId,
      name,
    });
    dom.createStructureName.value = "";
    state.structures = await api.getStructures(state.selected.buildingId);
    fillSelect(dom.structureSelect, state.structures, SELECT_STRUCTURE_PLACEHOLDER);
    dom.structureSelect.value = String(created.id);
    await onStructureChange();
    openEntityMetaDialog({
      kind: "structure",
      id: created.id,
      shortName: created.name,
      parentId: buildingId,
      title: "Строение",
      isNewCreate: true,
    });
  }),
);

dom.createFloorForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (!state.selected.structureId) return;
    const structureId = state.selected.structureId;
    const name = dom.createFloorName.value.trim();
    if (!name) return;
    const created = await api.createFloor({
      structure_id: structureId,
      name,
      sort_order: nextFloorSortOrder(),
    });
    dom.createFloorName.value = "";
    state.floors = await api.getFloors(state.selected.structureId);
    fillSelect(dom.floorSelect, state.floors, SELECT_FLOOR_PLACEHOLDER);
    dom.floorSelect.value = String(created.id);
    await onFloorChange();
    openEntityMetaDialog({
      kind: "floor",
      id: created.id,
      shortName: created.name,
      parentId: structureId,
      title: "Этаж",
      isNewCreate: true,
    });
  }),
);

dom.objectTypeForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    const name = dom.objectTypeNameInput.value.trim();
    if (!name) return;
    openEntityMetaDialog({
      kind: "object_type_new",
      shortName: name,
      title: "Тип объекта",
    });
  }),
);

dom.objectKindForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    const object_type_id = Number(dom.objectKindTypeSelect.value);
    const name = dom.objectKindNameInput.value.trim();
    if (!object_type_id || !name) return;
    openEntityMetaDialog({
      kind: "object_kind_new",
      objectTypeId: object_type_id,
      shortName: name,
      title: "Вид объекта",
    });
  }),
);

dom.entityEditToggleBtn?.addEventListener("click", () => {
  const nextExpanded = !isEntityEditExpanded();
  localStorage.setItem(ENTITY_EDIT_EXPANDED_KEY, nextExpanded ? "1" : "0");
  applyEntityEditCollapsedUi();
});

dom.entityEditForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    const { level, row } = pickEntityEditCardRow();
    if (!level || !row) return;
    const short = dom.entityEditShortName.value.trim();
    if (!short) return;
    const full = dom.entityEditFullName.value.trim() || null;
    const desc = dom.entityEditDescription.value.trim() || null;
    const addr = dom.entityEditAddress.value.trim() || null;

    const payload = {
      name: short,
      full_name: full,
      description: desc,
      address: addr,
    };
    if (level === "campus") {
      const id = state.selected.campusId;
      await api.updateCampus(id, payload);
      state.campuses = await api.getCampuses();
      fillSelect(dom.campusSelect, state.campuses, SELECT_CAMPUS_PLACEHOLDER);
      dom.campusSelect.value = String(id);
      dom.pageTitle.textContent = getSelectedName(state.campuses, id);
    } else if (level === "building") {
      const bid = state.selected.buildingId;
      await api.updateBuilding(bid, payload);
      state.buildings = await api.getBuildings(state.selected.campusId);
      fillSelect(dom.buildingSelect, state.buildings, SELECT_BUILDING_PLACEHOLDER);
      dom.buildingSelect.value = String(bid);
      dom.pageTitle.textContent = getSelectedName(state.buildings, bid);
    } else if (level === "structure") {
      const sid = state.selected.structureId;
      await api.updateStructure(sid, payload);
      state.structures = await api.getStructures(state.selected.buildingId);
      fillSelect(dom.structureSelect, state.structures, SELECT_STRUCTURE_PLACEHOLDER);
      dom.structureSelect.value = String(sid);
      dom.pageTitle.textContent = getSelectedName(state.structures, sid);
    } else {
      const fid = state.selected.floorId;
      await api.updateFloor(fid, payload);
      state.floors = await api.getFloors(state.selected.structureId);
      fillSelect(dom.floorSelect, state.floors, SELECT_FLOOR_PLACEHOLDER);
      dom.floorSelect.value = String(fid);
      dom.pageTitle.textContent = getSelectedName(state.floors, fid);
      await loadFloorContext(fid);
    }
    renderPath();
    syncEntityEditCard();
  }),
);

for (const el of [
  dom.entityEditShortName,
  dom.entityEditFullName,
  dom.entityEditDescription,
  dom.entityEditAddress,
]) {
  el?.addEventListener("input", () => syncEntityEditUnsavedBanner());
}

dom.closeImageModalBtn.addEventListener("click", () => closeImageModal());

dom.imageModalOverlay.addEventListener("click", (e) => {
  if (e.target === dom.imageModalOverlay) closeImageModal();
});

dom.planImage.addEventListener("click", () => {
  const src = dom.planImage.getAttribute("src");
  if (!src) return;
  openImageModal(src, { placementMode: false });
});

dom.imageModalStage.addEventListener("mousemove", (e) => {
  if (state.placement.transitionZoneId == null && state.placement.objectId == null) return;
  updatePlacementCursorHint(e);
});

dom.imageModalStage.addEventListener("click", (e) =>
  run(async () => {
    if (state.placement.transitionZoneId == null && state.placement.objectId == null) return;
    const coords = getNormalizedImageCoordsFromEvent(e, dom.imageModalImg);
    if (!coords) return;

    if (state.placement.transitionZoneId != null) {
      const obj = (state.planDetail?.transition_zones || []).find(
        (x) => x.id === state.placement.transitionZoneId,
      );
      if (!obj) return;
      await api.updateTransitionZone(obj.id, {
        object_kind_id: obj.object_kind.id,
        name: obj.name,
        pos_x: coords.x,
        pos_y: coords.y,
      });
      state.placement.transitionZoneId = null;
      closeImageModal();
      await loadFloorContext(state.selected.floorId);
      syncPlanHintStatus();
      return;
    }

    if (state.placement.objectId != null) {
      const room = findRoomById(state.placement.objectId);
      if (!room) return;
      await api.updateObject(room.id, {
        transition_zone_id: room.transition_zone_id,
        object_type_id: room.object_type.id,
        object_kind_id: room.object_kind.id,
        name: room.name,
        pos_x: coords.x,
        pos_y: coords.y,
      });
      state.placement.objectId = null;
      closeImageModal();
      await loadFloorContext(state.selected.floorId);
      syncPlanHintStatus();
    }
  }),
);

dom.downloadImageBtn.addEventListener("click", () => run(downloadCurrentPhoto));

dom.confirmOkBtn.addEventListener("click", () => closeConfirmModal(true));
dom.confirmCancelBtn.addEventListener("click", () => closeConfirmModal(false));
dom.confirmOverlay.addEventListener("click", (e) => {
  if (e.target === dom.confirmOverlay) closeConfirmModal(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  if (!dom.confirmOverlay.hidden) closeConfirmModal(false);
  else if (!dom.entityMetaOverlay.hidden) {
    run(async () => {
      const ctx = pendingMetaContext;
      closeEntityMetaDialog();
      await refreshListsAfterMetaCancel(ctx);
    });
  } else if (!dom.imageModalOverlay.hidden) closeImageModal();
});

dom.campusSelect.addEventListener("change", () => run(onCampusChange));
dom.buildingSelect.addEventListener("change", () => run(onBuildingChange));
dom.structureSelect.addEventListener("change", () => run(onStructureChange));
dom.floorSelect.addEventListener("change", () => run(onFloorChange));
if (dom.treeHomeBtn) {
  dom.treeHomeBtn.addEventListener("click", () => run(navigateToHome));
}

dom.deleteBranchBtn.addEventListener("click", () =>
  run(async () => {
    await deleteSelectedBranch();
  }),
);

dom.objectForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (!state.selected.planId) return;
    const object_kind_id = Number(dom.kindSelect.value);
    const name = dom.nameInput.value.trim();
    if (!object_kind_id || !name) return;
    const created = await api.createTransitionZone({
      plan_id: state.selected.planId,
      object_kind_id,
      name,
    });
    const startPlacement = !!dom.planImage.getAttribute("src");
    dom.nameInput.value = "";
    await loadFloorContext(state.selected.floorId);
    openTransitionZoneMetaDialog(created, {
      isNewCreate: true,
      startPlacementAfterSave: startPlacement,
    });
  }),
);

dom.imageForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    const file = dom.imageInput.files?.[0];
    if (!file) return;
    if (state.selected.floorId) {
      await api.uploadPlanImage(state.selected.planId, file);
      dom.imageInput.value = "";
      await loadFloorContext(state.selected.floorId);
      return;
    }
    if (state.selected.structureId) {
      const res = await api.uploadEntityImage("structure", state.selected.structureId, file);
      setEntityPhotoUrl("structure", state.selected.structureId, res?.photo_url);
      dom.imageInput.value = "";
      loadEntityImage("structure", state.selected.structureId);
      syncEntityEditCard();
      return;
    }
    if (state.selected.buildingId) {
      const res = await api.uploadEntityImage("building", state.selected.buildingId, file);
      setEntityPhotoUrl("building", state.selected.buildingId, res?.photo_url);
      dom.imageInput.value = "";
      loadEntityImage("building", state.selected.buildingId);
      syncEntityEditCard();
      return;
    }
    if (state.selected.campusId) {
      const res = await api.uploadEntityImage("campus", state.selected.campusId, file);
      setEntityPhotoUrl("campus", state.selected.campusId, res?.photo_url);
      dom.imageInput.value = "";
      loadEntityImage("campus", state.selected.campusId);
      syncEntityEditCard();
    }
  }),
);

dom.deleteImageBtn.addEventListener("click", () =>
  run(async () => {
    if (state.selected.floorId) {
      await api.deletePlanImage(state.selected.planId);
      await loadFloorContext(state.selected.floorId);
      return;
    }
    if (state.selected.structureId) {
      const res = await api.deleteEntityImage("structure", state.selected.structureId);
      setEntityPhotoUrl("structure", state.selected.structureId, res?.photo_url);
      loadEntityImage("structure", state.selected.structureId);
      syncEntityEditCard();
      return;
    }
    if (state.selected.buildingId) {
      const res = await api.deleteEntityImage("building", state.selected.buildingId);
      setEntityPhotoUrl("building", state.selected.buildingId, res?.photo_url);
      loadEntityImage("building", state.selected.buildingId);
      syncEntityEditCard();
      return;
    }
    if (state.selected.campusId) {
      const res = await api.deleteEntityImage("campus", state.selected.campusId);
      setEntityPhotoUrl("campus", state.selected.campusId, res?.photo_url);
      loadEntityImage("campus", state.selected.campusId);
      syncEntityEditCard();
    }
  }),
);

async function run(fn) {
  try {
    await fn();
  } catch (e) {
    console.error("[VKRB]", e);
    if (apiErrorDetail(e) === "room_name_exists_on_floor") {
      showRoomDuplicateFromApiError();
    }
  }
}

function initPlanMarkerLegend() {
  applyPlanLegendVisibility();
  if (!dom.planMarkerLegendToggle) return;
  dom.planMarkerLegendToggle.addEventListener("click", () => {
    const nextHidden = !isPlanLegendHidden();
    localStorage.setItem(PLAN_LEGEND_HIDDEN_STORAGE_KEY, nextHidden ? "1" : "0");
    applyPlanLegendVisibility();
  });
}

function initPlanMarkerLayoutListeners() {
  const refresh = () => {
    if (state.planDetail) renderPlanMarkers();
  };
  dom.planImage.addEventListener("load", refresh);
  dom.imageModalImg.addEventListener("load", refresh);
  const ro = new ResizeObserver(refresh);
  ro.observe(dom.planStage);
  ro.observe(dom.imageModalStage);
}

dom.entityMetaShortName?.addEventListener("input", () => {
  setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, false);
});

run(async () => {
  await Promise.all([loadInitialLists(), loadObjectDictionaries()]);
  initPlanMarkerScale();
  initPlanMarkerLegend();
  initPlanMarkerLayoutListeners();
  applyEntityEditCollapsedUi();
});

function normalizeImageUrl(url) {
  if (!url) return url;
  return url.replace("://minio:9000", "://localhost:9000");
}

