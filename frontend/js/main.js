import { api } from "./api.js";
import { dom, fillSelect } from "./dom.js";

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
  },
  focusedTransitionZoneId: null,
  /** @type {"none"|"campus"|"building"|"structure"|"floor"} */
  uiMode: "none",
};

function getSelectedName(items, id) {
  return items.find((i) => i.id === Number(id))?.name || "-";
}

function syncDeleteBranchButton() {
  dom.deleteBranchBtn.disabled = !state.selected.campusId;
}

function renderPath() {
  const campus = getSelectedName(state.campuses, state.selected.campusId);
  const building = getSelectedName(state.buildings, state.selected.buildingId);
  const structure = getSelectedName(state.structures, state.selected.structureId);
  const floor = getSelectedName(state.floors, state.selected.floorId);
  if (!state.selected.campusId) {
    dom.pathText.textContent = "Выберите кампус.";
    return;
  }
  if (state.selected.campusId && !state.selected.buildingId) {
    dom.pathText.textContent = campus;
    return;
  }
  if (state.selected.buildingId && !state.selected.structureId) {
    dom.pathText.textContent = `${campus} / ${building}`;
    return;
  }
  if (state.selected.structureId && !state.selected.floorId) {
    dom.pathText.textContent = `${campus} / ${building} / ${structure}`;
    return;
  }
  dom.pathText.textContent = `${campus} / ${building} / ${structure} / ${floor}`;
}

function clearPlanView() {
  dom.planImage.removeAttribute("src");
  dom.planImage.style.display = "none";
  dom.planHint.textContent = "Изображение не загружено.";
  syncDownloadButton(false);
  dom.objectsTbody.innerHTML = "";
  dom.planMarkers.innerHTML = "";
  state.placement.transitionZoneId = null;
  state.focusedTransitionZoneId = null;
  state.planDetail = null;
  state.selected.planId = null;
}

let editingTransitionZoneId = null;
let confirmResolver = null;
let entityMetaSaving = false;
/** @type {null | { kind: string; id?: number; number?: number | null; shortName?: string; fullName?: string; description?: string; objectTypeId?: number; title?: string }} */
let pendingMetaContext = null;

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
  const level = getRenameLevel();
  if (level === "floor") {
    return { level, row: state.floors.find((f) => f.id === state.selected.floorId) ?? null };
  }
  if (level === "structure") {
    return { level, row: state.structures.find((s) => s.id === state.selected.structureId) ?? null };
  }
  if (level === "building") {
    return { level, row: state.buildings.find((b) => b.id === state.selected.buildingId) ?? null };
  }
  return { level: "campus", row: state.campuses.find((c) => c.id === state.selected.campusId) ?? null };
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
  if (state.uiMode === "none") {
    dom.entityEditCard.hidden = true;
    syncContentGridLayout();
    return;
  }
  if (!state.selected.campusId) {
    dom.entityEditCard.hidden = true;
    syncContentGridLayout();
    return;
  }
  const { level, row } = pickHierEntityRow();
  if (!row) {
    dom.entityEditCard.hidden = true;
    syncContentGridLayout();
    return;
  }
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
  dom.entityEditNumber.value = row.number != null ? String(row.number) : "";
  dom.entityEditShortName.value = row.name || "";
  dom.entityEditFullName.value = row.full_name || "";
  dom.entityEditDescription.value = row.description || "";
  dom.entityEditAddress.value = row.address || "";
  applyEntityEditCollapsedUi();
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
    dom.planMarkerLegend.hidden = true;
    dom.createEntityCard.style.display = "block";
    dom.rightCard.style.display = "block";
    dom.rightCardTitle.textContent = "Типы и виды объектов";
    dom.zoneManagement.hidden = true;
    dom.dictionariesManagement.hidden = false;
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
    dom.planMarkerLegend.hidden = false;
    dom.rightCardTitle.textContent = "Зоны перехода";
    dom.rightCard.style.display = "block";
    dom.objectForm.style.display = "grid";
    dom.zoneManagement.hidden = false;
    dom.dictionariesManagement.hidden = true;
    dom.emptyStateText.style.display = "none";
    applyCreateFormsVisibility("floor");
    syncEntityEditCard();
    return;
  }
  dom.planMarkerLegend.hidden = true;
  dom.photoCardTitle.textContent = "Фото";
  dom.rightCardTitle.textContent = "";
  dom.rightCard.style.display = "none";
  dom.objectForm.style.display = "none";
  dom.objectsTbody.innerHTML = "";
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

function transitionZoneTypeIds() {
  const ids = state.objectTypes.filter((t) => isTransitionZoneTypeName(t.name)).map((t) => t.id);
  return new Set(ids);
}

function transitionZoneKinds() {
  const typeIds = transitionZoneTypeIds();
  return state.objectKinds.filter((k) => typeIds.has(k.object_type_id));
}

function objectTypeNameById(id) {
  return state.objectTypes.find((t) => t.id === id)?.name || "—";
}

function renderObjects() {
  const zones = state.planDetail?.transition_zones || [];
  dom.objectsTbody.innerHTML = "";
  for (const obj of zones) {
    const tr = document.createElement("tr");
    tr.dataset.transitionZoneId = String(obj.id);
    if (state.focusedTransitionZoneId === obj.id) {
      tr.classList.add("object-row-selected");
    }

    const markCell = document.createElement("td");
    markCell.className = "mark-cell";
    const mark = document.createElement("span");
    mark.className = `mark-dot${obj.pos_x != null && obj.pos_y != null ? " is-on" : " is-off"}`;
    mark.title = obj.pos_x != null && obj.pos_y != null ? "Отметка на плане есть" : "Отметки на плане нет";
    markCell.appendChild(mark);

    const typeCell = document.createElement("td");
    typeCell.textContent = obj.object_kind?.name || obj.object_type.name;

    const nameCell = document.createElement("td");
    nameCell.textContent = obj.name;

    const actionCell = document.createElement("td");
    const wrap = document.createElement("div");
    wrap.className = "actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Редактировать";
    editBtn.onclick = () => openEditObjectModal(obj);

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Удалить";
    deleteBtn.onclick = () =>
      void run(async () => {
        const confirmed = await askConfirmation({
          title: "Удаление зоны перехода",
          message: `Удалить зону «${obj.name}»?`,
          okText: "Удалить",
          cancelText: "Отмена",
        });
        if (!confirmed) return;
        await api.deleteTransitionZone(obj.id);
        await loadFloorContext(state.selected.floorId);
      });

    const placeBtn = document.createElement("button");
    placeBtn.type = "button";
    placeBtn.textContent = obj.pos_x != null && obj.pos_y != null ? "Переставить на плане" : "Указать на плане";
    placeBtn.className = state.placement.transitionZoneId === obj.id ? "is-active" : "";
    placeBtn.onclick = () => startPlacementForTransitionZone(obj.id);

    const clearMarkBtn = document.createElement("button");
    clearMarkBtn.type = "button";
    clearMarkBtn.textContent = "Удалить отметку на плане";
    clearMarkBtn.disabled = obj.pos_x == null || obj.pos_y == null;
    clearMarkBtn.onclick = () =>
      void run(async () => {
        await api.updateTransitionZone(obj.id, {
          object_kind_id: obj.object_kind.id,
          name: obj.name,
          pos_x: null,
          pos_y: null,
        });
        if (state.placement.transitionZoneId === obj.id) {
          state.placement.transitionZoneId = null;
        }
        await loadFloorContext(state.selected.floorId);
        dom.planHint.textContent = "Отметка зоны удалена.";
      });

    wrap.append(editBtn, deleteBtn);
    wrap.append(placeBtn);
    wrap.append(clearMarkBtn);
    actionCell.appendChild(wrap);
    tr.append(markCell, typeCell, nameCell, actionCell);
    dom.objectsTbody.appendChild(tr);
  }
}

/** Цвет маркера по русскому названию типа (без полей в БД). */
function markerClassByTypeName(obj) {
  const n = (obj.object_kind?.name || obj.object_type?.name || "").toLowerCase();
  if (n.includes("коридор")) return "plan-marker--corridor";
  if (n.includes("лестниц")) return "plan-marker--stair";
  if (n.includes("лифт")) return "plan-marker--lift";
  return "plan-marker--room";
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

function renderPlanMarkersIn(container, imgEl, selectedTransitionZoneId = null) {
  container.innerHTML = "";
  const zones = state.planDetail?.transition_zones || [];
  const m = getObjectFitContainMetrics(imgEl);
  for (const obj of zones) {
    if (obj.pos_x == null || obj.pos_y == null) continue;
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `plan-marker ${markerClassByTypeName(obj)}${
      selectedTransitionZoneId === obj.id ? " is-selected" : ""
    }`;
    if (m) {
      const leftPct = ((m.offX + obj.pos_x * m.dispW) / m.elW) * 100;
      const topPct = ((m.offY + obj.pos_y * m.dispH) / m.elH) * 100;
      marker.style.left = `${leftPct}%`;
      marker.style.top = `${topPct}%`;
    } else {
      marker.style.left = `${obj.pos_x * 100}%`;
      marker.style.top = `${obj.pos_y * 100}%`;
    }
    marker.title = `${obj.object_type.name}: ${obj.name}`;
    marker.setAttribute("aria-label", marker.title);
    marker.style.pointerEvents = "auto";
    marker.onclick = (e) => {
      e.stopPropagation();
      if (state.placement.transitionZoneId != null) {
        startPlacementForTransitionZone(obj.id);
        return;
      }
      focusTransitionZoneInList(obj.id);
    };
    container.appendChild(marker);
  }
}

function renderPlanMarkers() {
  if (
    state.planDetail &&
    dom.planImage.style.display !== "none" &&
    dom.planImage.getAttribute("src")
  ) {
    renderPlanMarkersIn(dom.planMarkers, dom.planImage, state.placement.transitionZoneId);
  } else {
    dom.planMarkers.innerHTML = "";
  }
  if (
    state.planDetail &&
    !dom.imageModalOverlay.hidden &&
    dom.imageModalImg.getAttribute("src")
  ) {
    renderPlanMarkersIn(dom.imageModalMarkers, dom.imageModalImg, state.placement.transitionZoneId);
  }
}

function startPlacementForTransitionZone(zoneId) {
  if (!state.selected.floorId || !dom.planImage.getAttribute("src")) return;
  state.placement.transitionZoneId = zoneId;
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

function focusTransitionZoneInList(zoneId) {
  state.focusedTransitionZoneId = zoneId;
  if (!dom.imageModalOverlay.hidden) {
    closeImageModal();
  } else {
    renderPlanMarkers();
  }
  renderObjects();
  const row = dom.objectsTbody.querySelector(`tr[data-transition-zone-id="${zoneId}"]`);
  if (row) {
    row.scrollIntoView({ behavior: "smooth", block: "center" });
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

function openEditObjectModal(obj) {
  editingTransitionZoneId = obj.id;
  dom.editObjectName.value = obj.name;
  dom.editObjectKind.innerHTML = "";
  for (const t of transitionZoneKinds()) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    if (t.id === obj.object_kind.id) opt.selected = true;
    dom.editObjectKind.appendChild(opt);
  }
  dom.modalOverlay.hidden = false;
  dom.editObjectName.focus();
}

function closeEditObjectModal() {
  dom.modalOverlay.hidden = true;
  editingTransitionZoneId = null;
}

function openImageModal(src, options = {}) {
  if (!src) return;
  dom.imageModalImg.src = normalizeImageUrl(src);
  dom.imageModalHint.textContent = options.placementMode
    ? `Установка точки для: ${options.objectName}. Кликните по плану.`
    : "";
  dom.closeImageModalBtn.textContent = options.placementMode ? "Закрыть (отмена)" : "Закрыть";
  renderPlanMarkers();
  dom.imageModalOverlay.hidden = false;
}

function closeImageModal() {
  if (state.placement.transitionZoneId != null) {
    state.placement.transitionZoneId = null;
    dom.planHint.textContent = "Установка точки отменена.";
    renderObjects();
    renderPlanMarkers();
  }
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

function askConfirmation({ title, message, okText = "Подтвердить", cancelText = "Закрыть" }) {
  dom.confirmTitle.textContent = title || "Подтверждение";
  dom.confirmMessage.textContent = message || "";
  dom.confirmOkBtn.textContent = okText;
  dom.confirmCancelBtn.textContent = cancelText;
  dom.confirmOverlay.hidden = false;
  dom.confirmOkBtn.focus();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

function openEntityMetaDialog(ctx) {
  pendingMetaContext = ctx;
  dom.entityMetaTitle.textContent = ctx.title || "Дополнительные поля";
  const isDictNew = ctx.kind === "object_type_new" || ctx.kind === "object_kind_new";
  if (ctx.kind === "object_type_new") {
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
    const num = ctx.number != null ? ctx.number : ctx.id;
    dom.entityMetaNumber.value = num != null ? String(num) : "";
    dom.entityMetaNumber.title = "Только просмотр, изменить нельзя.";
  } else {
    dom.entityMetaNumber.value = ctx.id != null ? String(ctx.id) : "";
    dom.entityMetaNumber.title = "";
  }
  dom.entityMetaShortName.value = ctx.shortName || "";
  dom.entityMetaFullName.value = ctx.fullName ?? "";
  dom.entityMetaDescription.value = ctx.description ?? "";
  dom.entityMetaAddress.value = "";
  dom.entityMetaDrawingFile.value = "";
  const noLoc =
    ctx.kind === "object_type" ||
    ctx.kind === "object_kind" ||
    ctx.kind === "object_type_new" ||
    ctx.kind === "object_kind_new";
  dom.entityMetaAddressWrap.hidden = noLoc;
  dom.entityMetaDrawingWrap.hidden = noLoc;
  dom.entityMetaOverlay.hidden = false;
  dom.entityMetaShortName.focus();
}

function closeEntityMetaDialog() {
  dom.entityMetaOverlay.hidden = true;
  pendingMetaContext = null;
  dom.entityMetaForm.reset();
}

async function refreshListsAfterMetaCancel(ctx) {
  if (!ctx) return;
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
  if (ctx.kind === "transition_zone" && state.selected.floorId) {
    await loadFloorContext(state.selected.floorId);
  }
}

function syncDownloadButton(enabled) {
  if (!dom.downloadImageBtn) return;
  dom.downloadImageBtn.disabled = !enabled;
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
  state.selected.campusId = Number(dom.campusSelect.value) || null;
  state.selected.buildingId = null;
  state.selected.structureId = null;
  state.selected.floorId = null;
  clearPlanView();

  state.buildings = state.selected.campusId ? await api.getBuildings(state.selected.campusId) : [];
  fillSelect(dom.buildingSelect, state.buildings, "Введите корпус");
  fillSelect(dom.structureSelect, [], "Введите строение", true);
  fillSelect(dom.floorSelect, [], "Введите этаж", true);
  renderPath();
  dom.pageTitle.textContent = state.selected.campusId ? getSelectedName(state.campuses, state.selected.campusId) : "Админка";
  setMode("campus");
  if (state.selected.campusId) {
    loadEntityImage("campus", state.selected.campusId);
  } else {
    clearPlanView();
  }
  syncDeleteBranchButton();
}

async function onBuildingChange() {
  state.selected.buildingId = Number(dom.buildingSelect.value) || null;
  state.selected.structureId = null;
  state.selected.floorId = null;
  clearPlanView();

  state.structures = state.selected.buildingId ? await api.getStructures(state.selected.buildingId) : [];
  fillSelect(dom.structureSelect, state.structures, "Введите строение");
  fillSelect(dom.floorSelect, [], "Введите этаж", true);
  renderPath();
  if (state.selected.buildingId) {
    dom.pageTitle.textContent = getSelectedName(state.buildings, state.selected.buildingId);
    setMode("building");
    loadEntityImage("building", state.selected.buildingId);
  }
  syncDeleteBranchButton();
}

async function onStructureChange() {
  state.selected.structureId = Number(dom.structureSelect.value) || null;
  state.selected.floorId = null;
  clearPlanView();

  state.floors = state.selected.structureId ? await api.getFloors(state.selected.structureId) : [];
  fillSelect(dom.floorSelect, state.floors, "Введите этаж");
  renderPath();
  if (state.selected.structureId) {
    dom.pageTitle.textContent = getSelectedName(state.structures, state.selected.structureId);
    setMode("structure");
    loadEntityImage("structure", state.selected.structureId);
  }
  syncDeleteBranchButton();
}

async function onFloorChange() {
  state.selected.floorId = Number(dom.floorSelect.value) || null;
  renderPath();
  if (!state.selected.floorId) {
    clearPlanView();
    dom.pageTitle.textContent = getSelectedName(state.structures, state.selected.structureId);
    setMode("structure");
    if (state.selected.structureId) loadEntityImage("structure", state.selected.structureId);
    renderPath();
    syncDeleteBranchButton();
    return;
  }

  dom.pageTitle.textContent = getSelectedName(state.floors, state.selected.floorId);
  setMode("floor");
  await loadFloorContext(state.selected.floorId);
  syncDeleteBranchButton();
}

async function loadInitialLists() {
  state.campuses = await api.getCampuses();
  fillSelect(dom.campusSelect, state.campuses, "Введите кампус");
  fillSelect(dom.buildingSelect, [], "Введите корпус", true);
  fillSelect(dom.structureSelect, [], "Введите строение", true);
  fillSelect(dom.floorSelect, [], "Введите этаж", true);

  state.selected = { campusId: null, buildingId: null, structureId: null, floorId: null, planId: null };
  clearPlanView();
  dom.pageTitle.textContent = "Админка";
  setMode("none");
  renderPath();
  syncDeleteBranchButton();
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
      "При удалении будут удалены выбранный объект, все уровни ниже по дереву и опрос. Удалить или вернуться?",
    okText: "Удалить",
    cancelText: "Вернуться",
  });
  if (!ok) return;

  if (branchKind === "floor") {
    await api.deleteFloor(state.selected.floorId);
    state.selected.floorId = null;
    clearPlanView();
    state.floors = await api.getFloors(state.selected.structureId);
    fillSelect(dom.floorSelect, state.floors, "Введите этаж");
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
    fillSelect(dom.structureSelect, state.structures, "Введите строение");
    fillSelect(dom.floorSelect, [], "Введите этаж", true);
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
    fillSelect(dom.buildingSelect, state.buildings, "Введите корпус");
    fillSelect(dom.structureSelect, [], "Введите строение", true);
    fillSelect(dom.floorSelect, [], "Введите этаж", true);
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
    deleteBtn.textContent = "Удалить";
    deleteBtn.onclick = () =>
      void run(async () => {
        const ok = await askConfirmation({
          title: "Удаление типа",
          message: `Удалить тип «${t.name}»?`,
          okText: "Удалить",
          cancelText: "Отмена",
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
    deleteBtn.textContent = "Удалить";
    deleteBtn.onclick = () =>
      void run(async () => {
        const ok = await askConfirmation({
          title: "Удаление вида",
          message: `Удалить вид «${k.name}»?`,
          okText: "Удалить",
          cancelText: "Отмена",
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
}

async function loadObjectDictionaries() {
  const [types, kinds] = await Promise.all([api.getObjectTypes(), api.getObjectKinds()]);
  state.objectTypes = types;
  state.objectKinds = kinds;
  syncKindSelects();
  renderObjectTypesDictionary();
  renderObjectKindsDictionary();
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
    kind === "object_kind_new"
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
    await api.createObjectKind({
      object_type_id: ctx.objectTypeId,
      name: short,
      full_name: full || null,
      description: desc || null,
    });
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
    fillSelect(dom.campusSelect, state.campuses, "Введите кампус");
    dom.campusSelect.value = String(created.id);
    await onCampusChange();
  }),
);

dom.createBuildingForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (!state.selected.campusId) return;
    const name = dom.createBuildingName.value.trim();
    if (!name) return;
    const created = await api.createBuilding({
      campus_id: state.selected.campusId,
      name,
    });
    dom.createBuildingName.value = "";
    state.buildings = await api.getBuildings(state.selected.campusId);
    fillSelect(dom.buildingSelect, state.buildings, "Введите корпус");
    dom.buildingSelect.value = String(created.id);
    await onBuildingChange();
  }),
);

dom.createStructureForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (!state.selected.buildingId) return;
    const name = dom.createStructureName.value.trim();
    if (!name) return;
    const created = await api.createStructure({
      building_id: state.selected.buildingId,
      name,
    });
    dom.createStructureName.value = "";
    state.structures = await api.getStructures(state.selected.buildingId);
    fillSelect(dom.structureSelect, state.structures, "Введите строение");
    dom.structureSelect.value = String(created.id);
    await onStructureChange();
  }),
);

dom.createFloorForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (!state.selected.structureId) return;
    const name = dom.createFloorName.value.trim();
    if (!name) return;
    const created = await api.createFloor({
      structure_id: state.selected.structureId,
      name,
      sort_order: nextFloorSortOrder(),
    });
    dom.createFloorName.value = "";
    state.floors = await api.getFloors(state.selected.structureId);
    fillSelect(dom.floorSelect, state.floors, "Введите этаж");
    dom.floorSelect.value = String(created.id);
    await onFloorChange();
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
    const level = getRenameLevel();
    const short = dom.entityEditShortName.value.trim();
    if (!short) return;
    const numTrim = (dom.entityEditNumber.value ?? "").trim();
    let numberVal = null;
    if (numTrim !== "") {
      const n = Number(numTrim);
      if (!Number.isFinite(n) || !Number.isInteger(n) || n < 1) return;
      numberVal = n;
    }
    const full = dom.entityEditFullName.value.trim() || null;
    const desc = dom.entityEditDescription.value.trim() || null;
    const addr = dom.entityEditAddress.value.trim() || null;

    const payload = {
      name: short,
      number: numberVal,
      full_name: full,
      description: desc,
      address: addr,
    };
    if (level === "campus") {
      const id = state.selected.campusId;
      await api.updateCampus(id, payload);
      state.campuses = await api.getCampuses();
      fillSelect(dom.campusSelect, state.campuses, "Введите кампус");
      dom.campusSelect.value = String(id);
      dom.pageTitle.textContent = getSelectedName(state.campuses, id);
    } else if (level === "building") {
      const bid = state.selected.buildingId;
      await api.updateBuilding(bid, payload);
      state.buildings = await api.getBuildings(state.selected.campusId);
      fillSelect(dom.buildingSelect, state.buildings, "Введите корпус");
      dom.buildingSelect.value = String(bid);
      dom.pageTitle.textContent = getSelectedName(state.buildings, bid);
    } else if (level === "structure") {
      const sid = state.selected.structureId;
      await api.updateStructure(sid, payload);
      state.structures = await api.getStructures(state.selected.buildingId);
      fillSelect(dom.structureSelect, state.structures, "Введите строение");
      dom.structureSelect.value = String(sid);
      dom.pageTitle.textContent = getSelectedName(state.structures, sid);
    } else {
      const fid = state.selected.floorId;
      await api.updateFloor(fid, payload);
      state.floors = await api.getFloors(state.selected.structureId);
      fillSelect(dom.floorSelect, state.floors, "Введите этаж");
      dom.floorSelect.value = String(fid);
      dom.pageTitle.textContent = getSelectedName(state.floors, fid);
      await loadFloorContext(fid);
    }
    renderPath();
    syncEntityEditCard();
  }),
);

dom.editObjectForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (editingTransitionZoneId == null) return;
    const object_kind_id = Number(dom.editObjectKind.value);
    const name = dom.editObjectName.value.trim();
    if (!object_kind_id || !name) return;
    await api.updateTransitionZone(editingTransitionZoneId, { object_kind_id, name });
    closeEditObjectModal();
    await loadFloorContext(state.selected.floorId);
  }),
);

dom.cancelEditObjectBtn.addEventListener("click", () => closeEditObjectModal());

dom.closeImageModalBtn.addEventListener("click", () => closeImageModal());

dom.imageModalOverlay.addEventListener("click", (e) => {
  if (e.target === dom.imageModalOverlay) closeImageModal();
});

dom.planImage.addEventListener("click", () => {
  const src = dom.planImage.getAttribute("src");
  if (!src) return;
  openImageModal(src, { placementMode: false });
});

dom.imageModalStage.addEventListener("click", (e) =>
  run(async () => {
    if (state.placement.transitionZoneId == null) return;
    const coords = getNormalizedImageCoordsFromEvent(e, dom.imageModalImg);
    if (!coords) return;
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
    dom.planHint.textContent = "Точка зоны сохранена.";
  }),
);

dom.downloadImageBtn.addEventListener("click", () => run(downloadCurrentPhoto));

dom.confirmOkBtn.addEventListener("click", () => closeConfirmModal(true));
dom.confirmCancelBtn.addEventListener("click", () => closeConfirmModal(false));
dom.confirmOverlay.addEventListener("click", (e) => {
  if (e.target === dom.confirmOverlay) closeConfirmModal(false);
});

dom.modalOverlay.addEventListener("click", (e) => {
  if (e.target === dom.modalOverlay) closeEditObjectModal();
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
  else if (!dom.modalOverlay.hidden) closeEditObjectModal();
});

dom.campusSelect.addEventListener("change", () => run(onCampusChange));
dom.buildingSelect.addEventListener("change", () => run(onBuildingChange));
dom.structureSelect.addEventListener("change", () => run(onStructureChange));
dom.floorSelect.addEventListener("change", () => run(onFloorChange));
dom.clearCampusBtn.addEventListener("click", () =>
  run(async () => {
    await loadInitialLists();
  }),
);
dom.clearBuildingBtn.addEventListener("click", () =>
  run(async () => {
    if (!state.selected.campusId) return;
    state.selected.buildingId = null;
    state.selected.structureId = null;
    state.selected.floorId = null;
    clearPlanView();
    fillSelect(dom.buildingSelect, state.buildings, "Введите корпус");
    fillSelect(dom.structureSelect, [], "Введите строение", true);
    fillSelect(dom.floorSelect, [], "Введите этаж", true);
    dom.pageTitle.textContent = getSelectedName(state.campuses, state.selected.campusId);
    setMode("campus");
    loadEntityImage("campus", state.selected.campusId);
    renderPath();
    syncDeleteBranchButton();
  }),
);
dom.clearStructureBtn.addEventListener("click", () =>
  run(async () => {
    if (!state.selected.buildingId) return;
    state.selected.structureId = null;
    state.selected.floorId = null;
    clearPlanView();
    fillSelect(dom.structureSelect, state.structures, "Введите строение");
    fillSelect(dom.floorSelect, [], "Введите этаж", true);
    dom.pageTitle.textContent = getSelectedName(state.buildings, state.selected.buildingId);
    setMode("building");
    loadEntityImage("building", state.selected.buildingId);
    renderPath();
    syncDeleteBranchButton();
  }),
);
dom.clearFloorBtn.addEventListener("click", () =>
  run(async () => {
    if (!state.selected.structureId) return;
    state.selected.floorId = null;
    clearPlanView();
    fillSelect(dom.floorSelect, state.floors, "Введите этаж");
    dom.pageTitle.textContent = getSelectedName(state.structures, state.selected.structureId);
    setMode("structure");
    loadEntityImage("structure", state.selected.structureId);
    renderPath();
    syncDeleteBranchButton();
  }),
);

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
    dom.nameInput.value = "";
    await loadFloorContext(state.selected.floorId);
    if (dom.planImage.getAttribute("src")) {
      startPlacementForTransitionZone(created.id);
    } else {
      dom.planHint.textContent =
        "Зона добавлена. Загрузите изображение плана этажа, чтобы отметить точку на чертеже.";
    }
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
  } catch {
    /* сбои сети и API не выводим в интерфейс */
  }
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

run(async () => {
  await Promise.all([loadInitialLists(), loadObjectDictionaries()]);
  initPlanMarkerLayoutListeners();
  applyEntityEditCollapsedUi();
});

function normalizeImageUrl(url) {
  if (!url) return url;
  return url.replace("://minio:9000", "://localhost:9000");
}

