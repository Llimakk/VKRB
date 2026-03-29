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
  dom.objectsTbody.innerHTML = "";
  state.planDetail = null;
  state.selected.planId = null;
}

const CREATE_LABELS = {
  none: { title: "Создать новый кампус", placeholder: "Введите название кампуса" },
  campus: { title: "Создать новый корпус", placeholder: "Введите название корпуса" },
  building: { title: "Создать новое строение", placeholder: "Введите название строения" },
  structure: { title: "Создать новый этаж", placeholder: "Введите название этажа" },
};

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
    return;
  }
  dom.photoCardTitle.textContent = "Фото";
  dom.rightCardTitle.textContent = "";
  dom.rightCard.style.display = "none";
  dom.objectForm.style.display = "none";
  dom.objectsTbody.innerHTML = "";
  dom.emptyStateText.style.display = "none";
  applyCreateFormsVisibility(mode);
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
  } else {
    dom.planImage.removeAttribute("src");
    dom.planImage.style.display = "none";
    dom.planHint.textContent = "Изображение не загружено.";
  }
}

function renderObjects() {
  const objects = state.planDetail?.objects || [];
  dom.objectsTbody.innerHTML = "";
  for (const obj of objects) {
    const tr = document.createElement("tr");

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
    editBtn.onclick = async () => {
      const nextName = prompt("Новое название:", obj.name);
      if (!nextName) return;
      await api.updateObject(obj.id, {
        object_type_id: obj.object_type.id,
        name: nextName.trim(),
      });
      await loadFloorContext(state.selected.floorId);
    };

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Удалить";
    deleteBtn.onclick = async () => {
      if (!confirm("Удалить объект?")) return;
      await api.deleteObject(obj.id);
      await loadFloorContext(state.selected.floorId);
    };

    wrap.append(editBtn, deleteBtn);
    actionCell.appendChild(wrap);
    tr.append(typeCell, nameCell, actionCell);
    dom.objectsTbody.appendChild(tr);
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
  } else {
    dom.planImage.removeAttribute("src");
    dom.planImage.style.display = "none";
    dom.planHint.textContent = "Изображение не загружено.";
  }

  renderObjects();
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
    await api.createObject({ plan_id: state.selected.planId, object_type_id, name });
    dom.nameInput.value = "";
    await loadFloorContext(state.selected.floorId);
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

run(async () => {
  await Promise.all([loadInitialLists(), initObjectTypes()]);
});

function normalizeImageUrl(url) {
  if (!url) return url;
  return url.replace("://minio:9000", "://localhost:9000");
}

