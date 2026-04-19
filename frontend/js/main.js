import { api } from "./api.js";
import { dom, fillSelect, setError } from "./dom.js";

const state = {
  campuses: [],
  buildings: [],
  structures: [],
  floors: [],
  objectTypes: [],
  selected: {
    campusId: null,
    buildingId: null,
    structureId: null,
    floorId: null,
    planId: null,
  },
  planDetail: null,
  placement: {
    objectId: null,
  },
  focusedObjectId: null,
};

function getSelectedName(items, id) {
  return items.find((i) => i.id === Number(id))?.name || "-";
}

function renderPath() {
  const campus = getSelectedName(state.campuses, state.selected.campusId);
  const building = getSelectedName(state.buildings, state.selected.buildingId);
  const structure = getSelectedName(state.structures, state.selected.structureId);
  const floor = getSelectedName(state.floors, state.selected.floorId);
  if (!state.selected.campusId) {
    dom.pathText.textContent = "Выберите кампус.";
    syncCascadeDeletePanel();
    return;
  }
  if (state.selected.campusId && !state.selected.buildingId) {
    dom.pathText.textContent = campus;
    syncCascadeDeletePanel();
    return;
  }
  if (state.selected.buildingId && !state.selected.structureId) {
    dom.pathText.textContent = `${campus} / ${building}`;
    syncCascadeDeletePanel();
    return;
  }
  if (state.selected.structureId && !state.selected.floorId) {
    dom.pathText.textContent = `${campus} / ${building} / ${structure}`;
    syncCascadeDeletePanel();
    return;
  }
  dom.pathText.textContent = `${campus} / ${building} / ${structure} / ${floor}`;
  syncCascadeDeletePanel();
}

const CASCADE_WARNINGS = {
  campus:
    "Будут безвозвратно удалены весь выбранный кампус, все корпуса (здания), строения, этажи, планы этажей, все помещения (объекты) на планах и загруженные изображения.",
  building:
    "Будут безвозвратно удалены выбранный корпус, все строения и этажи в нём, планы этажей, все помещения на планах и связанные изображения.",
  structure:
    "Будут безвозвратно удалены выбранное строение, все этажи в нём, планы, все помещения на планах и связанные изображения.",
  floor:
    "Будут безвозвратно удалены выбранный этаж, план этажа, все помещения на плане и файл изображения плана.",
};

function getCascadeDeleteTarget() {
  if (!state.selected.campusId) return null;
  if (state.selected.floorId) {
    return {
      level: "floor",
      id: state.selected.floorId,
      name: getSelectedName(state.floors, state.selected.floorId),
    };
  }
  if (state.selected.structureId) {
    return {
      level: "structure",
      id: state.selected.structureId,
      name: getSelectedName(state.structures, state.selected.structureId),
    };
  }
  if (state.selected.buildingId) {
    return {
      level: "building",
      id: state.selected.buildingId,
      name: getSelectedName(state.buildings, state.selected.buildingId),
    };
  }
  return {
    level: "campus",
    id: state.selected.campusId,
    name: getSelectedName(state.campuses, state.selected.campusId),
  };
}

function syncCascadeDeletePanel() {
  dom.cascadeDeletePanel.hidden = !state.selected.campusId;
}

function clearPlanView() {
  dom.planImage.removeAttribute("src");
  dom.planImage.style.display = "none";
  dom.planHint.textContent = "Изображение не загружено.";
  syncDownloadButton(false);
  dom.objectsTbody.innerHTML = "";
  dom.planMarkers.innerHTML = "";
  state.placement.objectId = null;
  state.focusedObjectId = null;
  state.planDetail = null;
  state.selected.planId = null;
}

let editingObjectId = null;
let confirmResolver = null;

const CREATE_LABELS = {
  none: { title: "Создать новый кампус", placeholder: "Введите название кампуса" },
  campus: { title: "Создать новый корпус", placeholder: "Введите название корпуса" },
  building: { title: "Создать новое строение", placeholder: "Введите название строения" },
  structure: { title: "Создать новый этаж", placeholder: "Введите название этажа" },
};

const RENAME_TITLES = {
  campus: "Название кампуса",
  building: "Название корпуса",
  structure: "Название строения",
  floor: "Название этажа",
};

function getRenameLevel() {
  if (state.selected.floorId) return "floor";
  if (state.selected.structureId) return "structure";
  if (state.selected.buildingId) return "building";
  return "campus";
}

function nameForRenameLevel(level) {
  if (level === "floor") return getSelectedName(state.floors, state.selected.floorId);
  if (level === "structure") return getSelectedName(state.structures, state.selected.structureId);
  if (level === "building") return getSelectedName(state.buildings, state.selected.buildingId);
  return getSelectedName(state.campuses, state.selected.campusId);
}

function syncRenameField() {
  if (!state.selected.campusId) {
    dom.renameCard.hidden = true;
    return;
  }
  dom.renameCard.hidden = false;
  const level = getRenameLevel();
  dom.renameCardHeading.textContent = RENAME_TITLES[level];
  dom.renameEntityInput.value = nameForRenameLevel(level);
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
  if (mode === "none") {
    dom.photoCard.style.display = "none";
    dom.createEntityCard.style.display = "block";
    dom.rightCard.style.display = "none";
    dom.emptyStateText.style.display = "block";
    dom.emptyStateText.textContent =
      "Создайте кампус или выберите существующий в дереве.";
    applyCreateFormsVisibility("none");
    syncRenameField();
    return;
  }
  dom.photoCard.style.display = "block";
  dom.createEntityCard.style.display = mode === "floor" ? "none" : "block";
  if (mode === "floor") {
    dom.photoCardTitle.textContent = "План";
    dom.rightCardTitle.textContent = "Объекты";
    dom.rightCard.style.display = "block";
    dom.objectForm.style.display = "grid";
    dom.emptyStateText.style.display = "none";
    applyCreateFormsVisibility("floor");
    syncRenameField();
    return;
  }
  dom.photoCardTitle.textContent = "Фото";
  dom.rightCardTitle.textContent = "";
  dom.rightCard.style.display = "none";
  dom.objectForm.style.display = "none";
  dom.objectsTbody.innerHTML = "";
  dom.emptyStateText.style.display = "none";
  applyCreateFormsVisibility(mode);
  syncRenameField();
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

function renderObjects() {
  const objects = state.planDetail?.objects || [];
  dom.objectsTbody.innerHTML = "";
  for (const obj of objects) {
    const tr = document.createElement("tr");
    tr.dataset.objectId = String(obj.id);
    if (state.focusedObjectId === obj.id) {
      tr.classList.add("object-row-selected");
    }

    const markCell = document.createElement("td");
    markCell.className = "mark-cell";
    const mark = document.createElement("span");
    mark.className = `mark-dot${obj.pos_x != null && obj.pos_y != null ? " is-on" : " is-off"}`;
    mark.title = obj.pos_x != null && obj.pos_y != null ? "Отметка на плане есть" : "Отметки на плане нет";
    markCell.appendChild(mark);

    const typeCell = document.createElement("td");
    typeCell.textContent = obj.object_type.name;

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
    deleteBtn.onclick = async () => {
      const confirmed = await askConfirmation({
        title: "Удаление объекта",
        message: `Удалить объект "${obj.name}"?`,
        okText: "Удалить",
        cancelText: "Отмена",
      });
      if (!confirmed) return;
      await api.deleteObject(obj.id);
      await loadFloorContext(state.selected.floorId);
    };

    const placeBtn = document.createElement("button");
    placeBtn.type = "button";
    placeBtn.textContent = obj.pos_x != null && obj.pos_y != null ? "Переставить на плане" : "Указать на плане";
    placeBtn.className = state.placement.objectId === obj.id ? "is-active" : "";
    placeBtn.onclick = () => startPlacementForObject(obj.id);

    const clearMarkBtn = document.createElement("button");
    clearMarkBtn.type = "button";
    clearMarkBtn.textContent = "Удалить отметку на плане";
    clearMarkBtn.disabled = obj.pos_x == null || obj.pos_y == null;
    clearMarkBtn.onclick = async () => {
      await api.updateObject(obj.id, {
        object_type_id: obj.object_type.id,
        name: obj.name,
        pos_x: null,
        pos_y: null,
      });
      if (state.placement.objectId === obj.id) {
        state.placement.objectId = null;
      }
      await loadFloorContext(state.selected.floorId);
      dom.planHint.textContent = "Отметка объекта удалена.";
    };

    wrap.append(editBtn, deleteBtn);
    wrap.append(placeBtn);
    wrap.append(clearMarkBtn);
    actionCell.appendChild(wrap);
    tr.append(markCell, typeCell, nameCell, actionCell);
    dom.objectsTbody.appendChild(tr);
  }
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

function renderPlanMarkersIn(container, imgEl, selectedObjectId = null) {
  container.innerHTML = "";
  const objects = state.planDetail?.objects || [];
  const m = getObjectFitContainMetrics(imgEl);
  for (const obj of objects) {
    if (obj.pos_x == null || obj.pos_y == null) continue;
    const marker = document.createElement("button");
    marker.type = "button";
    marker.className = `plan-marker${selectedObjectId === obj.id ? " is-selected" : ""}`;
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
      if (state.placement.objectId != null) {
        startPlacementForObject(obj.id);
        return;
      }
      focusObjectInList(obj.id);
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
    renderPlanMarkersIn(dom.planMarkers, dom.planImage, state.placement.objectId);
  } else {
    dom.planMarkers.innerHTML = "";
  }
  if (
    state.planDetail &&
    !dom.imageModalOverlay.hidden &&
    dom.imageModalImg.getAttribute("src")
  ) {
    renderPlanMarkersIn(dom.imageModalMarkers, dom.imageModalImg, state.placement.objectId);
  }
}

function startPlacementForObject(objectId) {
  if (!state.selected.floorId || !dom.planImage.getAttribute("src")) return;
  state.placement.objectId = objectId;
  const obj = (state.planDetail?.objects || []).find((x) => x.id === objectId);
  const objectName = obj?.name || "объект";
  dom.planHint.textContent = `Режим установки точки: ${objectName}. Кликните по месту аудитории на плане.`;
  openImageModal(dom.planImage.getAttribute("src"), {
    placementMode: true,
    objectName,
  });
  renderObjects();
  renderPlanMarkers();
}

function focusObjectInList(objectId) {
  state.focusedObjectId = objectId;
  if (!dom.imageModalOverlay.hidden) {
    closeImageModal();
  } else {
    renderPlanMarkers();
  }
  renderObjects();
  const row = dom.objectsTbody.querySelector(`tr[data-object-id="${objectId}"]`);
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
  editingObjectId = obj.id;
  dom.editObjectName.value = obj.name;
  dom.editObjectType.innerHTML = "";
  for (const t of state.objectTypes) {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    if (t.id === obj.object_type.id) opt.selected = true;
    dom.editObjectType.appendChild(opt);
  }
  dom.modalOverlay.hidden = false;
  dom.editObjectName.focus();
}

function closeEditObjectModal() {
  dom.modalOverlay.hidden = true;
  editingObjectId = null;
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
  if (state.placement.objectId != null) {
    state.placement.objectId = null;
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
  if (confirmResolver) {
    closeConfirmModal(false);
  }
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

async function performCascadeDelete() {
  const target = getCascadeDeleteTarget();
  if (!target) return;

  const step1 = await askConfirmation({
    title: "Опасное действие",
    message: CASCADE_WARNINGS[target.level],
    okText: "Продолжить",
    cancelText: "Отмена",
  });
  if (!step1) return;

  const step2 = await askConfirmation({
    title: "Подтвердите удаление",
    message: `Удалить «${target.name}» без возможности восстановления?`,
    okText: "Удалить",
    cancelText: "Отмена",
  });
  if (!step2) return;

  if (!dom.imageModalOverlay.hidden) closeImageModal();

  if (target.level === "campus") {
    await api.deleteCampus(target.id);
    await loadInitialLists();
    return;
  }

  if (target.level === "building") {
    await api.deleteBuilding(target.id);
    state.selected.buildingId = null;
    state.selected.structureId = null;
    state.selected.floorId = null;
    clearPlanView();
    state.buildings = await api.getBuildings(state.selected.campusId);
    fillSelect(dom.buildingSelect, state.buildings, "Введите корпус");
    fillSelect(dom.structureSelect, [], "Введите строение", true);
    fillSelect(dom.floorSelect, [], "Введите этаж", true);
    setMode("campus");
    dom.pageTitle.textContent = getSelectedName(state.campuses, state.selected.campusId);
    loadEntityImage("campus", state.selected.campusId);
    renderPath();
    syncRenameField();
    return;
  }

  if (target.level === "structure") {
    await api.deleteStructure(target.id);
    state.selected.structureId = null;
    state.selected.floorId = null;
    clearPlanView();
    state.structures = await api.getStructures(state.selected.buildingId);
    fillSelect(dom.structureSelect, state.structures, "Введите строение");
    fillSelect(dom.floorSelect, [], "Введите этаж", true);
    setMode("building");
    dom.pageTitle.textContent = getSelectedName(state.buildings, state.selected.buildingId);
    loadEntityImage("building", state.selected.buildingId);
    renderPath();
    syncRenameField();
    return;
  }

  await api.deleteFloor(target.id);
  state.selected.floorId = null;
  clearPlanView();
  state.floors = await api.getFloors(state.selected.structureId);
  fillSelect(dom.floorSelect, state.floors, "Введите этаж");
  setMode("structure");
  dom.pageTitle.textContent = getSelectedName(state.structures, state.selected.structureId);
  loadEntityImage("structure", state.selected.structureId);
  renderPath();
  syncRenameField();
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
  state.planDetail = { plan: ctx.plan, objects: ctx.objects };

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
}

async function onFloorChange() {
  state.selected.floorId = Number(dom.floorSelect.value) || null;
  renderPath();
  if (!state.selected.floorId) {
    clearPlanView();
    return;
  }

  dom.pageTitle.textContent = getSelectedName(state.floors, state.selected.floorId);
  setMode("floor");
  await loadFloorContext(state.selected.floorId);
}

async function loadInitialLists() {
  setError("");
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
}

async function initObjectTypes() {
  state.objectTypes = await api.getObjectTypes();
  fillSelect(dom.typeSelect, state.objectTypes, "Тип объекта");
}

function nextFloorSortOrder() {
  if (!state.floors.length) return 0;
  return Math.max(...state.floors.map((f) => f.sort_order)) + 1;
}

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

dom.renameEntityForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    const name = dom.renameEntityInput.value.trim();
    if (!name) return;
    const level = getRenameLevel();
    if (level === "campus") {
      const id = state.selected.campusId;
      await api.updateCampus(id, { name });
      state.campuses = await api.getCampuses();
      fillSelect(dom.campusSelect, state.campuses, "Введите кампус");
      dom.campusSelect.value = String(id);
      dom.pageTitle.textContent = getSelectedName(state.campuses, id);
    } else if (level === "building") {
      const bid = state.selected.buildingId;
      await api.updateBuilding(bid, { name });
      state.buildings = await api.getBuildings(state.selected.campusId);
      fillSelect(dom.buildingSelect, state.buildings, "Введите корпус");
      dom.buildingSelect.value = String(bid);
      dom.pageTitle.textContent = getSelectedName(state.buildings, bid);
    } else if (level === "structure") {
      const sid = state.selected.structureId;
      await api.updateStructure(sid, { name });
      state.structures = await api.getStructures(state.selected.buildingId);
      fillSelect(dom.structureSelect, state.structures, "Введите строение");
      dom.structureSelect.value = String(sid);
      dom.pageTitle.textContent = getSelectedName(state.structures, sid);
    } else {
      const fid = state.selected.floorId;
      await api.updateFloor(fid, { name });
      state.floors = await api.getFloors(state.selected.structureId);
      fillSelect(dom.floorSelect, state.floors, "Введите этаж");
      dom.floorSelect.value = String(fid);
      dom.pageTitle.textContent = getSelectedName(state.floors, fid);
      await loadFloorContext(fid);
    }
    renderPath();
    syncRenameField();
  }),
);

dom.editObjectForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (editingObjectId == null) return;
    const object_type_id = Number(dom.editObjectType.value);
    const name = dom.editObjectName.value.trim();
    if (!object_type_id || !name) return;
    await api.updateObject(editingObjectId, { object_type_id, name });
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
    if (state.placement.objectId == null) return;
    const coords = getNormalizedImageCoordsFromEvent(e, dom.imageModalImg);
    if (!coords) return;
    const obj = (state.planDetail?.objects || []).find((x) => x.id === state.placement.objectId);
    if (!obj) return;
    await api.updateObject(obj.id, {
      object_type_id: obj.object_type.id,
      name: obj.name,
      pos_x: coords.x,
      pos_y: coords.y,
    });
    state.placement.objectId = null;
    closeImageModal();
    await loadFloorContext(state.selected.floorId);
    dom.planHint.textContent = "Точка объекта сохранена.";
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
  else if (!dom.imageModalOverlay.hidden) closeImageModal();
  else if (!dom.modalOverlay.hidden) closeEditObjectModal();
});

dom.cascadeDeleteBtn.addEventListener("click", () => run(performCascadeDelete));

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
  }),
);

dom.objectForm.addEventListener("submit", (e) =>
  run(async () => {
    e.preventDefault();
    if (!state.selected.planId) return;
    const object_type_id = Number(dom.typeSelect.value);
    const name = dom.nameInput.value.trim();
    if (!object_type_id || !name) return;
    const created = await api.createObject({ plan_id: state.selected.planId, object_type_id, name });
    dom.nameInput.value = "";
    await loadFloorContext(state.selected.floorId);
    const shouldPlaceNow = await askConfirmation({
      title: "Отметка на плане",
      message: `Объект "${created.name}" создан. Указать отметку на плане сейчас?`,
      okText: "Указать",
      cancelText: "Закрыть",
    });
    if (shouldPlaceNow) {
      startPlacementForObject(created.id);
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
      return;
    }
    if (state.selected.buildingId) {
      const res = await api.uploadEntityImage("building", state.selected.buildingId, file);
      setEntityPhotoUrl("building", state.selected.buildingId, res?.photo_url);
      dom.imageInput.value = "";
      loadEntityImage("building", state.selected.buildingId);
      return;
    }
    if (state.selected.campusId) {
      const res = await api.uploadEntityImage("campus", state.selected.campusId, file);
      setEntityPhotoUrl("campus", state.selected.campusId, res?.photo_url);
      dom.imageInput.value = "";
      loadEntityImage("campus", state.selected.campusId);
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
      return;
    }
    if (state.selected.buildingId) {
      const res = await api.deleteEntityImage("building", state.selected.buildingId);
      setEntityPhotoUrl("building", state.selected.buildingId, res?.photo_url);
      loadEntityImage("building", state.selected.buildingId);
      return;
    }
    if (state.selected.campusId) {
      const res = await api.deleteEntityImage("campus", state.selected.campusId);
      setEntityPhotoUrl("campus", state.selected.campusId, res?.photo_url);
      loadEntityImage("campus", state.selected.campusId);
    }
  }),
);

async function run(fn) {
  try {
    setError("");
    await fn();
  } catch (e) {
    const msg = String(e.message || e);
    setError(msg === "Failed to fetch" ? "Нет подключения к API." : msg);
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
  await Promise.all([loadInitialLists(), initObjectTypes()]);
  initPlanMarkerLayoutListeners();
});

function normalizeImageUrl(url) {
  if (!url) return url;
  return url.replace("://minio:9000", "://localhost:9000");
}

