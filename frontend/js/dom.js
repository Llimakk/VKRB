export const dom = {
  campusSelect: document.getElementById("campusSelect"),
  buildingSelect: document.getElementById("buildingSelect"),
  structureSelect: document.getElementById("structureSelect"),
  floorSelect: document.getElementById("floorSelect"),
  clearCampusBtn: document.getElementById("clearCampusBtn"),
  clearBuildingBtn: document.getElementById("clearBuildingBtn"),
  clearStructureBtn: document.getElementById("clearStructureBtn"),
  clearFloorBtn: document.getElementById("clearFloorBtn"),
  cascadeDeletePanel: document.getElementById("cascadeDeletePanel"),
  cascadeDeleteBtn: document.getElementById("cascadeDeleteBtn"),
  pathText: document.getElementById("pathText"),
  errorText: document.getElementById("errorText"),
  emptyStateText: document.getElementById("emptyStateText"),
  renameCard: document.getElementById("renameCard"),
  renameCardHeading: document.getElementById("renameCardHeading"),
  renameEntityForm: document.getElementById("renameEntityForm"),
  renameEntityInput: document.getElementById("renameEntityInput"),
  modalOverlay: document.getElementById("modalOverlay"),
  editObjectForm: document.getElementById("editObjectForm"),
  editObjectType: document.getElementById("editObjectType"),
  editObjectName: document.getElementById("editObjectName"),
  cancelEditObjectBtn: document.getElementById("cancelEditObjectBtn"),
  imageModalOverlay: document.getElementById("imageModalOverlay"),
  imageModalStage: document.getElementById("imageModalStage"),
  imageModalImg: document.getElementById("imageModalImg"),
  imageModalMarkers: document.getElementById("imageModalMarkers"),
  imageModalHint: document.getElementById("imageModalHint"),
  closeImageModalBtn: document.getElementById("closeImageModalBtn"),
  confirmOverlay: document.getElementById("confirmOverlay"),
  confirmTitle: document.getElementById("confirmTitle"),
  confirmMessage: document.getElementById("confirmMessage"),
  confirmCancelBtn: document.getElementById("confirmCancelBtn"),
  confirmOkBtn: document.getElementById("confirmOkBtn"),
  photoCard: document.getElementById("photoCard"),
  photoCardTitle: document.getElementById("photoCardTitle"),
  createEntityCard: document.getElementById("createEntityCard"),
  createEntityTitle: document.getElementById("createEntityTitle"),
  rightCard: document.getElementById("rightCard"),
  planStage: document.getElementById("planStage"),
  planImage: document.getElementById("planImage"),
  planMarkers: document.getElementById("planMarkers"),
  planHint: document.getElementById("planHint"),
  imageForm: document.getElementById("imageForm"),
  imageInput: document.getElementById("imageInput"),
  downloadImageBtn: document.getElementById("downloadImageBtn"),
  deleteImageBtn: document.getElementById("deleteImageBtn"),
  objectForm: document.getElementById("objectForm"),
  typeSelect: document.getElementById("typeSelect"),
  nameInput: document.getElementById("nameInput"),
  objectsTbody: document.getElementById("objectsTbody"),
  pageTitle: document.getElementById("pageTitle"),
  rightCardTitle: document.getElementById("rightCardTitle"),
  createCampusBlock: document.getElementById("createCampusBlock"),
  photoBlock: document.getElementById("photoBlock"),
  createChildBlock: document.getElementById("createChildBlock"),
  createCampusForm: document.getElementById("createCampusForm"),
  createCampusName: document.getElementById("createCampusName"),
  createBuildingForm: document.getElementById("createBuildingForm"),
  createBuildingName: document.getElementById("createBuildingName"),
  createStructureForm: document.getElementById("createStructureForm"),
  createStructureName: document.getElementById("createStructureName"),
  createFloorForm: document.getElementById("createFloorForm"),
  createFloorName: document.getElementById("createFloorName"),
};

export function setError(message) {
  dom.errorText.textContent = message || "";
}

export function fillSelect(selectEl, items, placeholder, disabled = false) {
  selectEl.innerHTML = "";
  const first = document.createElement("option");
  first.value = "";
  first.textContent = placeholder;
  first.disabled = true;
  first.selected = true;
  first.hidden = true;
  selectEl.appendChild(first);
  for (const item of items) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.name;
    selectEl.appendChild(option);
  }
  selectEl.disabled = disabled || items.length === 0;
}

