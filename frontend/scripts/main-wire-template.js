import { api } from "./api.js";
import { dom, fillSelect } from "./dom.js";
import {
  state,
  SELECT_CAMPUS_PLACEHOLDER,
  SELECT_BUILDING_PLACEHOLDER,
  SELECT_STRUCTURE_PLACEHOLDER,
  SELECT_FLOOR_PLACEHOLDER,
  getSelectedName,
} from "./state.js";
import {
  loadObjectDictionaries,
  objectTypeIdAllowsDictionaryKindManage,
  setRoomDuplicateHint,
  setTransitionZoneDuplicateHint,
  transitionZoneNameExistsOnPlan,
  findRoomById,
} from "./dictionary.js";
import { initGlobalSearch } from "./global-search.js";
import {
  navigateToHome,
  onCampusChange,
  onBuildingChange,
  onStructureChange,
  onFloorChange,
  deleteSelectedBranch,
  loadInitialLists,
  setEntityPhotoUrl,
  loadEntityImage,
  syncEntityEditCard,
  renderPath,
  pickEntityEditCardRow,
  isEntityEditExpanded,
  applyEntityEditCollapsedUi,
  syncEntityEditUnsavedBanner,
  ENTITY_EDIT_EXPANDED_KEY,
  nextFloorSortOrder,
  completeHierarchyCreate,
} from "./tree.js";
import {
  loadFloorContext,
  downloadCurrentPhoto,
  initPlanMarkerScale,
  initPlanMarkerLegend,
  initPlanMarkerLayoutListeners,
  updatePlacementCursorHint,
  getNormalizedImageCoordsFromEvent,
  renderPlanMarkers,
  syncPlanHintStatus,
} from "./floor.js";
import {
  openEntityMetaDialog,
  openTransitionZoneMetaDialog,
  closeEntityMetaDialog,
  closeConfirmModal,
  submitEntityMetaDialog,
  refreshListsAfterMetaCancel,
  pendingMetaContext,
  openImageModal,
  closeImageModal,
  askConfirmation,
} from "./modals.js";

import { run } from "./runner.js";
export { run };

function wireEventListeners() {
  dom.entityMetaForm.addEventListener("submit", (e) => run(async () => submitEntityMetaDialog(e)));
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
      await completeHierarchyCreate("campus", created);
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
      const created = await api.createBuilding({ campus_id: campusId, name });
      dom.createBuildingName.value = "";
      await completeHierarchyCreate("building", created);
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
      const created = await api.createStructure({ building_id: buildingId, name });
      dom.createStructureName.value = "";
      await completeHierarchyCreate("structure", created);
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
      await completeHierarchyCreate("floor", created);
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

  dom.objectKindForm.addEventListener("submit", (e) =>
    run(async () => {
      e.preventDefault();
      const object_type_id = Number(dom.objectKindTypeSelect.value);
      const name = dom.objectKindNameInput.value.trim();
      if (!object_type_id || !name) return;
      if (!objectTypeIdAllowsDictionaryKindManage(object_type_id)) return;
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
      const payload = { name: short, full_name: full, description: desc, address: addr };
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
  dom.treeHomeBtn?.addEventListener("click", () => run(navigateToHome));
  dom.deleteBranchBtn.addEventListener("click", () => run(deleteSelectedBranch));

  dom.objectForm.addEventListener("submit", (e) =>
    run(async () => {
      e.preventDefault();
      if (!state.selected.planId) return;
      const object_kind_id = Number(dom.kindSelect.value);
      const name = dom.nameInput.value.trim();
      if (!object_kind_id || !name) return;
      const kind = state.objectKinds.find((k) => Number(k.id) === object_kind_id);
      const object_type_id = kind?.object_type_id;
      setTransitionZoneDuplicateHint(dom.zoneNameDuplicateHint, false);
      if (object_type_id && transitionZoneNameExistsOnPlan(name, object_type_id)) {
        setTransitionZoneDuplicateHint(dom.zoneNameDuplicateHint, true);
        dom.nameInput.focus();
        return;
      }
      const created = await api.createTransitionZone({
        plan_id: state.selected.planId,
        object_kind_id,
        name,
      });
      const startPlacement = !!dom.planImage.getAttribute("src");
      dom.nameInput.value = "";
      await loadFloorContext(state.selected.floorId);
      openTransitionZoneMetaDialog(created, { isNewCreate: true, startPlacementAfterSave: startPlacement });
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
      const isFloorPlan = Boolean(state.selected.floorId);
      const ok = await askConfirmation({
        title: "Удаление изображения",
        message: isFloorPlan
          ? "Удалить изображение плана этажа?"
          : "Удалить фотографию объекта?",
        okText: "Удалить",
        cancelText: "Отмена",
        destructive: true,
      });
      if (!ok) return;

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

  dom.nameInput?.addEventListener("input", () => {
    setTransitionZoneDuplicateHint(dom.zoneNameDuplicateHint, false);
  });

  dom.entityMetaShortName?.addEventListener("input", () => {
    setRoomDuplicateHint(dom.entityMetaRoomDuplicateHint, false);
    setTransitionZoneDuplicateHint(dom.entityMetaZoneDuplicateHint, false);
  });
}

wireEventListeners();

run(async () => {
  await Promise.all([loadInitialLists(), loadObjectDictionaries()]);
  initGlobalSearch();
  initPlanMarkerScale();
  initPlanMarkerLegend();
  initPlanMarkerLayoutListeners();
  applyEntityEditCollapsedUi();
});
