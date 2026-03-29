export const dom = {
  campusSelect: document.getElementById("campusSelect"),
  buildingSelect: document.getElementById("buildingSelect"),
  structureSelect: document.getElementById("structureSelect"),
  floorSelect: document.getElementById("floorSelect"),
  clearCampusBtn: document.getElementById("clearCampusBtn"),
  clearBuildingBtn: document.getElementById("clearBuildingBtn"),
  clearStructureBtn: document.getElementById("clearStructureBtn"),
  clearFloorBtn: document.getElementById("clearFloorBtn"),
  pathText: document.getElementById("pathText"),
  errorText: document.getElementById("errorText"),
  emptyStateText: document.getElementById("emptyStateText"),
  leftCard: document.getElementById("leftCard"),
  rightCard: document.getElementById("rightCard"),
  planImage: document.getElementById("planImage"),
  planHint: document.getElementById("planHint"),
  imageForm: document.getElementById("imageForm"),
  imageInput: document.getElementById("imageInput"),
  deleteImageBtn: document.getElementById("deleteImageBtn"),
  objectForm: document.getElementById("objectForm"),
  typeSelect: document.getElementById("typeSelect"),
  nameInput: document.getElementById("nameInput"),
  objectsTbody: document.getElementById("objectsTbody"),
  pageTitle: document.getElementById("pageTitle"),
  leftCardTitle: document.getElementById("leftCardTitle"),
  rightCardTitle: document.getElementById("rightCardTitle"),
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

