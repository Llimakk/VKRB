import { api } from "./api.js";

import { dom, fillSelect } from "./dom.js";

import {

  state,

  getSelectedName,

  normalizeImageUrl,

  ROOM_DUPLICATE_MESSAGE,

  SELECT_CAMPUS_PLACEHOLDER,

  SELECT_BUILDING_PLACEHOLDER,

  SELECT_STRUCTURE_PLACEHOLDER,

  SELECT_FLOOR_PLACEHOLDER,

  TRANSITION_ZONE_TYPE_LABEL,
  GLOBAL_DUPLICATE_NAME_TITLE,
  GLOBAL_DUPLICATE_NAME_INTRO,
  OBJECT_KIND_IN_USE_TITLE,
  OBJECT_KIND_IN_USE_MESSAGE,

} from "./state.js";

import {

  objectTypeIdSupportsKindMarkerColor,

  objectTypeIdAllowsDictionaryKindManage,

  predictDefaultMarkerColor,

  isRoomObjectTypeName,

  isHierarchyObjectKindTypeId,

  isHierarchyObjectTypeName,

  findRoomById,

  fillRoomKindSelect,

  setRoomDuplicateHint,
  setTransitionZoneDuplicateHint,
  ensurePlanObjectNameAllowed,

  loadObjectDictionaries,

  objectTypeNameById,

  roomKinds,

  transitionZoneKinds,

  kindMarkerColor,

  roomMarkerColor,

  UNKNOWN_ZONE_MARKER_COLOR,

} from "./dictionary.js";

import {

  setMode,

  loadEntityImage,

  renderPath,

  syncDeleteBranchButton,

  syncEntityEditCard,

  loadInitialLists,

  isHierarchyMetaKind,

  onCampusChange,

  onBuildingChange,

  onStructureChange,

  onFloorChange,

} from "./tree.js";

import {

  loadFloorContext,

  clearPlanView,

  renderObjects,

  renderPlanMarkers,

  syncPlanHintStatus,

  startPlacementForTransitionZone,

  startPlacementForObject,

} from "./floor.js";



let confirmResolver = null;

export let entityMetaSaving = false;

export let pendingMetaContext = null;



export function setImageModalPlacementUi(active) {
  if (dom.imageModalStage) {
    dom.imageModalStage.classList.toggle("image-modal-stage--placement", active);
  }
}

export function askConfirmation({
  title,
  message,
  okText = "Подтвердить",
  cancelText = "Закрыть",
  destructive = false,
  singleButton = false,
}) {
  dom.confirmTitle.textContent = title || "Подтверждение";
  dom.confirmMessage.textContent = message || "";
  dom.confirmOkBtn.textContent = okText;
  dom.confirmCancelBtn.textContent = cancelText;
  dom.confirmOkBtn.className = destructive ? "btn btn--danger" : "btn btn--primary";
  dom.confirmCancelBtn.className = "btn btn--secondary";
  if (dom.confirmCancelBtn) {
    dom.confirmCancelBtn.hidden = singleButton;
    dom.confirmCancelBtn.style.display = singleButton ? "none" : "";
    dom.confirmCancelBtn.setAttribute("aria-hidden", singleButton ? "true" : "false");
  }
  dom.confirmOverlay?.classList.toggle("confirm-overlay--single", singleButton);
  dom.confirmOverlay.hidden = false;
  dom.confirmOkBtn.focus();
  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}

/** Информационное окно с одной кнопкой (без browser alert). */
export function showInformDialog({ title, message, okText = "Понятно" }) {
  return askConfirmation({
    title,
    message,
    okText,
    singleButton: true,
  });
}

export function showObjectKindInUseDialog(kindName) {
  const message = kindName
    ? `Вид «${kindName}» нельзя удалить: он уже используется в зонах перехода или помещениях на планах этажей.`
    : OBJECT_KIND_IN_USE_MESSAGE;
  return showInformDialog({
    title: OBJECT_KIND_IN_USE_TITLE,
    message,
  });
}

export function askGlobalDuplicateNameConfirmation({ entityLabel, name, matches }) {
  const paths = (matches || [])
    .map((m) => m.path_label)
    .filter(Boolean);
  const pathBlock = paths.length ? paths.join("\n") : "—";
  const message = `${GLOBAL_DUPLICATE_NAME_INTRO}\n\n«${name}» (${entityLabel || "объект"})\n\n${pathBlock}`;
  return askConfirmation({
    title: GLOBAL_DUPLICATE_NAME_TITLE,
    message,
    okText: "Создать с таким именем",
    cancelText: "Изменить наименование",
  });
}

export function openRoomMetaDialog(room, options = {}) {
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

export function openTransitionZoneMetaDialog(zone, options = {}) {
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

export function openImageModal(src, options = {}) {
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

export function closeImageModal() {
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

export function closeConfirmModal(result = false) {
  if (!dom.confirmOverlay || dom.confirmOverlay.hidden) return;
  dom.confirmOverlay.hidden = true;
  dom.confirmOverlay?.classList.remove("confirm-overlay--single");
  if (dom.confirmCancelBtn) {
    dom.confirmCancelBtn.hidden = false;
    dom.confirmCancelBtn.style.display = "";
    dom.confirmCancelBtn.setAttribute("aria-hidden", "false");
  }
  const resolve = confirmResolver;
  confirmResolver = null;
  if (resolve) resolve(result);
}

export function openEntityMetaDialog(ctx) {
  pendingMetaContext = ctx;
  dom.entityMetaTitle.textContent = ctx.title || "Дополнительные поля";
  if (dom.entityMetaParentWrap) dom.entityMetaParentWrap.hidden = true;
  if (dom.entityMetaParentTypeWrap) dom.entityMetaParentTypeWrap.hidden = true;
  if (dom.entityMetaKindTypeWrap) dom.entityMetaKindTypeWrap.hidden = true;
  const isDictNew = ctx.kind === "object_kind_new";
  const isObjectTypeEdit = ctx.kind === "object_type";
  const isObjectKindEdit = ctx.kind === "object_kind";
  if (ctx.kind === "object_kind_new") {
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
  if (dom.entityMetaParentTypeWrap) {
    dom.entityMetaParentTypeWrap.hidden = !isObjectTypeEdit;
    if (dom.entityMetaParentTypeId) {
      const parentTypeId = ctx.parentObjectTypeId;
      dom.entityMetaParentTypeId.value =
        parentTypeId != null && parentTypeId !== "" ? String(parentTypeId) : "—";
      dom.entityMetaParentTypeId.title =
        parentTypeId != null && parentTypeId !== ""
          ? "Только просмотр, изменить нельзя."
          : "У корневого типа (кампус) родительский тип не задан.";
    }
  }
  if (dom.entityMetaKindTypeWrap) {
    dom.entityMetaKindTypeWrap.hidden = !isObjectKindEdit;
    if (dom.entityMetaObjectTypeId) {
      dom.entityMetaObjectTypeId.value =
        ctx.objectTypeId != null && ctx.objectTypeId !== "" ? String(ctx.objectTypeId) : "—";
      dom.entityMetaObjectTypeId.title = "Только просмотр, изменить нельзя.";
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
  const showMarkerColorForKind =
    (isObjectKindEdit || ctx.kind === "object_kind_new") &&
    objectTypeIdSupportsKindMarkerColor(ctx.objectTypeId);
  const showMarkerColorForType =
    isObjectTypeEdit && isRoomObjectTypeName(ctx.shortName);
  const showMarkerColor = showMarkerColorForKind || showMarkerColorForType;
  if (dom.entityMetaMarkerColorWrap) {
    dom.entityMetaMarkerColorWrap.hidden = !showMarkerColor;
  }
  if (showMarkerColor && dom.entityMetaMarkerColor) {
    let color = ctx.markerColor;
    if (showMarkerColorForType) {
      color = ctx.markerColor || roomMarkerColor();
    } else if (!color && isObjectKindEdit && ctx.id) {
      const row = state.objectKinds.find((k) => Number(k.id) === Number(ctx.id));
      color = kindMarkerColor(row);
    } else if (!color && ctx.kind === "object_kind_new") {
      color = predictDefaultMarkerColor(ctx.objectTypeId);
    }
    dom.entityMetaMarkerColor.value = color || UNKNOWN_ZONE_MARKER_COLOR;
  }
  dom.entityMetaShortName.value = ctx.shortName || "";
  const hierarchyKindShortNameLocked =
    isObjectKindEdit && isHierarchyObjectKindTypeId(ctx.objectTypeId);
  if (dom.entityMetaShortName) {
    dom.entityMetaShortName.readOnly = isObjectTypeEdit || hierarchyKindShortNameLocked;
    if (isObjectTypeEdit) {
      dom.entityMetaShortName.title = "Имя типа зафиксировано в иерархии, изменить нельзя.";
    } else if (hierarchyKindShortNameLocked) {
      dom.entityMetaShortName.title =
        "Краткое имя вида для кампуса, корпуса, строения и этажа зафиксировано, изменить нельзя.";
    } else {
      dom.entityMetaShortName.removeAttribute("title");
    }
  }
  setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, false);
  setTransitionZoneDuplicateHint(dom.entityMetaZoneDuplicateHint, false);
  dom.entityMetaFullName.value = ctx.fullName ?? "";
  dom.entityMetaDescription.value = ctx.description ?? "";
  dom.entityMetaAddress.value = "";
  const noLoc =
    ctx.kind === "object_type" ||
    ctx.kind === "object_kind" ||
    ctx.kind === "object_kind_new" ||
    ctx.kind === "transition_zone" ||
    ctx.kind === "room";
  dom.entityMetaAddressWrap.hidden = noLoc;
  dom.entityMetaOverlay.hidden = false;
  if (isObjectTypeEdit || hierarchyKindShortNameLocked) {
    dom.entityMetaFullName?.focus();
  } else {
    dom.entityMetaShortName.focus();
  }
}

export function closeEntityMetaDialog() {
  dom.entityMetaOverlay.hidden = true;
  pendingMetaContext = null;
  dom.entityMetaForm.reset();
  if (dom.entityMetaShortName) dom.entityMetaShortName.readOnly = false;
  setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, false);
  setTransitionZoneDuplicateHint(dom.entityMetaZoneDuplicateHint, false);
}

export async function rollbackHierarchyCreateCancel(ctx) {
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

export async function rollbackTransitionZoneCreateCancel(ctx) {
  if (!ctx?.id) return;
  await api.deleteTransitionZone(ctx.id);
  dom.nameInput.value = ctx.shortName || "";
  if (ctx.objectKindId && dom.kindSelect) {
    dom.kindSelect.value = String(ctx.objectKindId);
  }
  await loadFloorContext(state.selected.floorId);
}

export async function rollbackRoomCreateCancel(ctx) {
  if (!ctx?.id) return;
  await api.deleteObject(ctx.id);
  if (ctx.parentId) delete state.corridorSelectedRoomId[ctx.parentId];
  await loadFloorContext(state.selected.floorId);
}

export async function refreshListsAfterMetaCancel(ctx) {
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
  if (ctx.kind === "object_kind_new") {
    dom.objectKindNameInput.value = ctx.shortName || "";
    return;
  }
  if (ctx.kind === "object_type" || ctx.kind === "object_kind") {
    await loadObjectDictionaries();
    return;
  }
}

export function predictedNextObjectKindId() {
  if (!state.objectKinds.length) return 1;
  return Math.max(...state.objectKinds.map((k) => k.id)) + 1;
}

export function entityMetaHasOptionalGaps(kind, full, desc, addr) {
  if (
    kind === "object_type" ||
    kind === "object_kind" ||
    kind === "object_kind_new" ||
    kind === "transition_zone" ||
    kind === "room"
  ) {
    return !full || !desc;
  }
  return !full || !desc || !addr;
}

export async function submitEntityMetaDialog(e) {
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

  if (
    !isHierarchyMetaKind(ctx.kind) &&
    entityMetaHasOptionalGaps(ctx.kind, full, desc, addr)
  ) {
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
  if (ctx.kind === "object_kind_new") {
    const createPayload = {
      object_type_id: ctx.objectTypeId,
      name: short,
      full_name: full || null,
      description: desc || null,
    };
    if (objectTypeIdSupportsKindMarkerColor(ctx.objectTypeId)) {
      createPayload.marker_color =
        dom.entityMetaMarkerColor?.value || predictDefaultMarkerColor(ctx.objectTypeId);
    }
    const created = await api.createObjectKind(createPayload);
    const createdId = Number(created?.id);
    if (Number.isFinite(createdId) && !state.objectKinds.some((k) => Number(k.id) === createdId)) {
      state.objectKinds.push(created);
    }
    closeEntityMetaDialog();
    dom.objectKindNameInput.value = "";
    await loadObjectDictionaries();
    if (state.uiMode === "floor" && state.selected.floorId) {
      await loadFloorContext(state.selected.floorId);
    }
    return;
  }

  const id = ctx.id;
  const numVal = Number(dom.entityMetaNumber.value) || id;

  if (ctx.kind === "object_type") {
    const payload = {
      number: numVal,
      full_name: full || null,
      description: desc || null,
    };
    if (isRoomObjectTypeName(ctx.shortName)) {
      payload.marker_color = dom.entityMetaMarkerColor?.value || roomMarkerColor();
    }
    await api.updateObjectType(id, payload);
    closeEntityMetaDialog();
    await loadObjectDictionaries();
    if (state.uiMode === "floor" && state.selected.floorId) {
      await loadFloorContext(state.selected.floorId);
    }
    return;
  }
  if (ctx.kind === "object_kind") {
    const hierarchyKind = isHierarchyObjectKindTypeId(ctx.objectTypeId);
    const kindPayload = {
      number: numVal,
      full_name: full || null,
      description: desc || null,
    };
    if (!hierarchyKind) {
      kindPayload.object_type_id = ctx.objectTypeId;
      kindPayload.name = short;
    }
    if (objectTypeIdSupportsKindMarkerColor(ctx.objectTypeId)) {
      kindPayload.marker_color = dom.entityMetaMarkerColor?.value || undefined;
    }
    await api.updateObjectKind(id, kindPayload);
    closeEntityMetaDialog();
    await loadObjectDictionaries();
    if (state.uiMode === "floor" && state.selected.floorId) {
      await loadFloorContext(state.selected.floorId);
    }
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
    await onCampusChange({ force: true });
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
    await onBuildingChange({ force: true });
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
    await onStructureChange({ force: true });
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
    await onFloorChange({ force: true });
    return;
  }
  if (ctx.kind === "transition_zone") {
    const object_kind_id = ctx.objectKindId;
    if (!object_kind_id) return;
    const zone = (state.planDetail?.transition_zones || []).find((z) => z.id === id);
    const kind = state.objectKinds.find((k) => Number(k.id) === Number(object_kind_id));
    const object_type_id = kind?.object_type_id ?? ctx.objectTypeId ?? zone?.object_type?.id;
    if (
      object_type_id &&
      !(await ensurePlanObjectNameAllowed({
        entityKind: "transition_zone",
        name: short,
        objectTypeId: object_type_id,
        planId: state.selected.planId,
        excludeEntityId: id,
        sameFloorHintEl: dom.entityMetaZoneDuplicateHint,
        onRejectFocus: () => dom.entityMetaShortName.focus(),
        skipGlobalDuplicateCheck: !!ctx.isNewCreate,
      }))
    ) {
      return;
    }
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
    if (
      !(await ensurePlanObjectNameAllowed({
        entityKind: "room",
        name: short,
        objectTypeId: resolvedTypeId,
        planId: state.selected.planId,
        excludeEntityId: id,
        sameFloorHintEl: dom.entityMetaRoomDuplicateHint,
        onRejectFocus: () => dom.entityMetaShortName.focus(),
        skipGlobalDuplicateCheck: !!ctx.isNewCreate,
      }))
    ) {
      return;
    }
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

