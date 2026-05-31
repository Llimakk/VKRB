import { api } from "./api.js";

import { dom, fillSelect } from "./dom.js";

import {

  state,

  getSelectedName,

  normalizeImageUrl,

  ADMIN_HOME_PAGE_TITLE,

  SELECT_CAMPUS_PLACEHOLDER,

  SELECT_BUILDING_PLACEHOLDER,

  SELECT_STRUCTURE_PLACEHOLDER,

  SELECT_FLOOR_PLACEHOLDER,

} from "./state.js";

import {

  refreshFloorTransitionZoneKinds,

  loadObjectDictionaries,

  syncKindSelects,

} from "./dictionary.js";

import {

  clearPlanView,

  loadFloorContext,

  focusRoomInCorridor,

  focusTransitionZoneInList,

  renderObjects,

  renderPlanMarkers,

  syncDownloadButton,

} from "./floor.js";

import { hideGlobalSearchDropdown, hideGlobalSearchFilterPanel } from "./global-search.js";
import { askConfirmation } from "./modals.js";
import { run } from "./runner.js";



export const DELETE_BRANCH_LABELS = {
  campus: "Удалить кампус",
  building: "Удалить корпус",
  structure: "Удалить строение",
  floor: "Удалить этаж",
};

export function syncDeleteBranchButton() {
  if (!dom.deleteBranchBtn) return;
  const hasCampus = Boolean(state.selected.campusId);
  dom.deleteBranchBtn.disabled = !hasCampus;
  dom.deleteBranchBtn.textContent = hasCampus
    ? DELETE_BRANCH_LABELS[getRenameLevel()] || "Удалить объект"
    : "Удалить объект";
}

export function getBreadcrumbSegments() {
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

export function renderBreadcrumbInto(container) {
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

export function renderPath() {
  renderBreadcrumbInto(dom.treeBreadcrumb);
  renderBreadcrumbInto(dom.pathText);
}

export function syncSelectsFromState() {
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

export async function ensureBranchListsLoaded() {
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

export async function navigateToLevel(level) {
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

export async function navigateToHome() {
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


export async function navigateToSearchResult(hit) {
  if (!hit?.campus_id) return;

  if (!state.campuses.length) {
    state.campuses = await api.getCampuses();
    fillSelect(dom.campusSelect, state.campuses, SELECT_CAMPUS_PLACEHOLDER);
  }

  state.selected.campusId = hit.campus_id;
  state.selected.buildingId = hit.building_id ?? null;
  state.selected.structureId = hit.structure_id ?? null;
  state.selected.floorId = hit.floor_id ?? null;

  state.buildings = await api.getBuildings(hit.campus_id);
  fillSelect(
    dom.buildingSelect,
    state.buildings,
    SELECT_BUILDING_PLACEHOLDER,
    false,
    hit.building_id,
  );

  if (hit.building_id) {
    state.structures = await api.getStructures(hit.building_id);
    fillSelect(
      dom.structureSelect,
      state.structures,
      SELECT_STRUCTURE_PLACEHOLDER,
      false,
      hit.structure_id,
    );
  } else {
    state.structures = [];
    fillSelect(dom.structureSelect, [], SELECT_STRUCTURE_PLACEHOLDER, true);
  }

  if (hit.structure_id) {
    state.floors = await api.getFloors(hit.structure_id);
    fillSelect(dom.floorSelect, state.floors, SELECT_FLOOR_PLACEHOLDER, false, hit.floor_id);
  } else {
    state.floors = [];
    fillSelect(dom.floorSelect, [], SELECT_FLOOR_PLACEHOLDER, true);
  }

  dom.campusSelect.value = String(hit.campus_id);
  syncSelectsFromState();

  const entityType = hit.entity_type;
  if (entityType === "campus") {
    clearPlanView();
    dom.pageTitle.textContent = getSelectedName(state.campuses, hit.campus_id);
    setMode("campus");
    loadEntityImage("campus", hit.entity_id);
  } else if (entityType === "building") {
    clearPlanView();
    dom.pageTitle.textContent = getSelectedName(state.buildings, hit.entity_id);
    setMode("building");
    loadEntityImage("building", hit.entity_id);
  } else if (entityType === "structure") {
    clearPlanView();
    dom.pageTitle.textContent = getSelectedName(state.structures, hit.entity_id);
    setMode("structure");
    loadEntityImage("structure", hit.entity_id);
  } else if (entityType === "floor") {
    state.selected.floorId = hit.entity_id;
    dom.pageTitle.textContent = getSelectedName(state.floors, hit.entity_id);
    setMode("floor");
    await refreshFloorTransitionZoneKinds();
    await loadFloorContext(hit.entity_id);
  } else if (entityType === "transition_zone") {
    dom.pageTitle.textContent = getSelectedName(state.floors, hit.floor_id);
    setMode("floor");
    await refreshFloorTransitionZoneKinds();
    await loadFloorContext(hit.floor_id);
    focusTransitionZoneInList(hit.entity_id);
  } else if (entityType === "plan_object") {
    dom.pageTitle.textContent = getSelectedName(state.floors, hit.floor_id);
    setMode("floor");
    await refreshFloorTransitionZoneKinds();
    await loadFloorContext(hit.floor_id);
    if (hit.transition_zone_id) {
      focusRoomInCorridor(hit.transition_zone_id, hit.entity_id);
    } else {
      state.focusedObjectId = hit.entity_id;
      state.focusedTransitionZoneId = null;
      renderObjects();
      renderPlanMarkers();
    }
  }

  renderPath();
  syncDeleteBranchButton();
  syncEntityEditCard();
}

export const HIERARCHY_META_KINDS = new Set(["campus", "building", "structure", "floor"]);

export function isHierarchyMetaKind(kind) {
  return HIERARCHY_META_KINDS.has(kind);
}

export const CREATE_LABELS = {
  none: { title: "Создать новый кампус", placeholder: "Введите название кампуса" },
  campus: { title: "Создать новый корпус", placeholder: "Введите название корпуса" },
  building: { title: "Создать новое строение", placeholder: "Введите название строения" },
  structure: { title: "Создать новый этаж", placeholder: "Введите название этажа" },
};

export const ENTITY_EDIT_TITLES = {
  campus: "Кампус",
  building: "Корпус",
  structure: "Строение",
  floor: "Этаж",
};

export const HIER_TYPE_KIND = {
  campus: { type: "Кампус", kind: "Кампус" },
  building: { type: "Корпус", kind: "Корпус" },
  structure: { type: "Строение", kind: "Строение" },
  floor: { type: "Этаж", kind: "Этаж" },
};

export const ENTITY_EDIT_EXPANDED_KEY = "vkrb_entity_edit_expanded";

/** Снимок полей формы для текущего объекта в карточке (level:id). */
let entityEditBaseline = null;

/** Объект карточки редактирования — по текущему режиму просмотра (uiMode), не по самому глубокому select. */
export function pickEntityEditCardRow() {
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

export function resolveEntityEditCardTarget() {
  const { level, row } = pickEntityEditCardRow();
  if (!level || !row) {
    return { visible: false, key: null, level: null, row: null };
  }
  return { visible: true, key: `${level}:${row.id}`, level, row };
}

export function readEntityEditFormValues() {
  return {
    shortName: dom.entityEditShortName?.value ?? "",
    fullName: dom.entityEditFullName?.value ?? "",
    description: dom.entityEditDescription?.value ?? "",
    address: dom.entityEditAddress?.value ?? "",
  };
}

export function entityEditFormDirty() {
  if (!entityEditBaseline) return false;
  const v = readEntityEditFormValues();
  return (
    v.shortName !== entityEditBaseline.shortName ||
    v.fullName !== entityEditBaseline.fullName ||
    v.description !== entityEditBaseline.description ||
    v.address !== entityEditBaseline.address
  );
}

export function commitEntityEditBaselineFromRow(level, row) {
  entityEditBaseline = {
    key: `${level}:${row.id}`,
    shortName: row.name || "",
    fullName: row.full_name || "",
    description: row.description || "",
    address: row.address || "",
  };
}

/** После успешного PATCH — снять «несохранённые изменения» по текущим полям формы. */
export function commitEntityEditBaselineFromForm() {
  const { level, row } = pickEntityEditCardRow();
  if (!level || !row) return;
  const v = readEntityEditFormValues();
  entityEditBaseline = {
    key: `${level}:${row.id}`,
    shortName: v.shortName,
    fullName: v.fullName,
    description: v.description,
    address: v.address,
  };
}

export function syncEntityEditUnsavedBanner() {
  const banner = dom.entityEditUnsavedBanner;
  if (!banner) return;
  banner.hidden = Boolean(dom.entityEditCard?.hidden) || !entityEditFormDirty();
}

export function isEntityEditExpanded() {
  return localStorage.getItem(ENTITY_EDIT_EXPANDED_KEY) !== "0";
}

export function applyEntityEditCollapsedUi() {
  if (!dom.entityEditToggleBtn || !dom.entityEditCardBody) return;
  const expanded = isEntityEditExpanded();
  dom.entityEditCardBody.hidden = !expanded;
  if (dom.entityEditCard) {
    dom.entityEditCard.classList.toggle("entity-edit-card--collapsed", !expanded);
  }
  dom.entityEditToggleBtn.setAttribute("aria-expanded", expanded ? "true" : "false");
  dom.entityEditToggleBtn.textContent = expanded ? "Свернуть" : "Развернуть";
}

/** Уровень объекта в карточке редактирования — по uiMode, не по самому глубокому select. */
export function getRenameLevel() {
  const mode = state.uiMode;
  if (mode === "campus" || mode === "building" || mode === "structure" || mode === "floor") {
    return mode;
  }
  return "campus";
}

export function pickHierEntityRow() {
  return pickEntityEditCardRow();
}

export function photoUrlForEntityEdit(level, row) {
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

export function syncGlobalSearchVisibility() {
  if (!dom.globalSearchSection) return;
  const show = state.uiMode === "none";
  dom.globalSearchSection.hidden = !show;
  if (!show) {
    hideGlobalSearchDropdown();
    hideGlobalSearchFilterPanel();
  }
}

export function syncContentGridLayout() {
  const grid = dom.contentGrid;
  if (!grid) return;
  grid.className = "content-grid";
  syncGlobalSearchVisibility();
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

export function syncEntityEditCard() {
  if (!dom.entityEditCard) return;

  const target = resolveEntityEditCardTarget();

  if (!target.visible) {
    dom.entityEditCard.hidden = true;
    entityEditBaseline = null;
    syncEntityEditUnsavedBanner();
    syncDeleteBranchButton();
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
  syncDeleteBranchButton();
  syncContentGridLayout();
}

export function applyCreateFormsVisibility(mode) {
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

export function setMode(mode) {
  state.uiMode = mode;
  syncGlobalSearchVisibility();
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
    renderPath();
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
    renderPath();
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
  renderPath();
}

export function pickEntityPhotoUrl(modelName, id) {
  const lists = {
    campus: state.campuses,
    building: state.buildings,
    structure: state.structures,
  };
  const list = lists[modelName];
  return list?.find((i) => i.id === id)?.photo_url;
}

export function setEntityPhotoUrl(modelName, id, photoUrl) {
  const lists = { campus: state.campuses, building: state.buildings, structure: state.structures };
  const row = lists[modelName]?.find((i) => i.id === id);
  if (row) row.photo_url = photoUrl ?? null;
}

export function loadEntityImage(modelName, id) {
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

function ensureListIncludesCreated(list, created, id) {
  if (list.some((row) => Number(row.id) === id)) return list;
  return [...list, { ...created, id }];
}

/** После POST: обновить списки, выбрать объект в дереве, перейти на его уровень. */
export async function completeHierarchyCreate(level, created) {
  const id = Number(created?.id);
  if (!Number.isFinite(id)) {
    throw new Error("Ответ сервера не содержит id созданного объекта.");
  }

  if (level === "campus") {
    state.campuses = await api.getCampuses();
    state.campuses = ensureListIncludesCreated(state.campuses, created, id);
    fillSelect(dom.campusSelect, state.campuses, SELECT_CAMPUS_PLACEHOLDER);
    dom.campusSelect.value = String(id);
    await onCampusChange({ force: true });
    return;
  }
  if (level === "building") {
    if (!state.selected.campusId) throw new Error("Не выбран кампус.");
    state.buildings = await api.getBuildings(state.selected.campusId);
    state.buildings = ensureListIncludesCreated(state.buildings, created, id);
    fillSelect(dom.buildingSelect, state.buildings, SELECT_BUILDING_PLACEHOLDER);
    dom.buildingSelect.value = String(id);
    await onBuildingChange({ force: true });
    return;
  }
  if (level === "structure") {
    if (!state.selected.buildingId) throw new Error("Не выбран корпус.");
    state.structures = await api.getStructures(state.selected.buildingId);
    state.structures = ensureListIncludesCreated(state.structures, created, id);
    fillSelect(dom.structureSelect, state.structures, SELECT_STRUCTURE_PLACEHOLDER);
    dom.structureSelect.value = String(id);
    await onStructureChange({ force: true });
    return;
  }
  if (level === "floor") {
    if (!state.selected.structureId) throw new Error("Не выбрано строение.");
    state.floors = await api.getFloors(state.selected.structureId);
    state.floors = ensureListIncludesCreated(state.floors, created, id);
    fillSelect(dom.floorSelect, state.floors, SELECT_FLOOR_PLACEHOLDER);
    dom.floorSelect.value = String(id);
    await onFloorChange({ force: true });
  }
}

export async function onCampusChange(options = {}) {
  const force = options?.force === true;
  const newId = Number(dom.campusSelect.value) || null;
  if (!force && newId === state.selected.campusId) return;
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

export async function onBuildingChange(options = {}) {
  const force = options?.force === true;
  const newId = Number(dom.buildingSelect.value) || null;
  if (!force && newId === state.selected.buildingId) return;

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

export async function onStructureChange(options = {}) {
  const force = options?.force === true;
  const newId = Number(dom.structureSelect.value) || null;
  if (!force && newId === state.selected.structureId) return;

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

export async function onFloorChange(options = {}) {
  const force = options?.force === true;
  const newId = Number(dom.floorSelect.value) || null;
  if (!force && newId === state.selected.floorId) return;

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

export async function loadInitialLists() {
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

export async function deleteSelectedBranch() {
  if (!state.selected.campusId) return;
  if (dom.confirmOverlay && !dom.confirmOverlay.hidden) return;
  const branchKind = getRenameLevel();

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

export function nextFloorSortOrder() {
  if (!state.floors.length) return 0;
  return Math.max(...state.floors.map((f) => f.sort_order)) + 1;
}

