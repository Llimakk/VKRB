import { api } from "./api.js";

import { dom, fillSelect } from "./dom.js";

import {

  state,
  apiErrorDetail,
  normalizeImageUrl,

  getSelectedName,

  PLAN_MARKER_SCALE_STORAGE_KEY,

  PLAN_MARKER_SCALE_MIN,

  PLAN_MARKER_SCALE_MAX,

  PLAN_MARKER_SCALE_DEFAULT,

  PLAN_LEGEND_HIDDEN_STORAGE_KEY,
  appendSelectPlaceholder,
} from "./state.js";

import {
  kindMarkerColor,
  roomMarkerColor,
  renderPlanMarkerLegend,
  isCorridorZone,
  roomKinds,
  roomsForCorridor,
  findRoomById,
  getSelectedRoomIdForCorridor,
  ensurePlanObjectNameAllowed,
  fillRoomKindSelect,
  setRoomDuplicateHint,
} from "./dictionary.js";

import { setMode, syncEntityEditCard } from "./tree.js";

import {

  openRoomMetaDialog,

  openTransitionZoneMetaDialog,

  openImageModal,

  closeImageModal,

  askConfirmation,

} from "./modals.js";
import { run } from "./runner.js";

export function clearPlanView() {
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

export function renderObjects() {
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

export function buildZoneSection(zone) {
  const section = document.createElement("article");
  section.className = "zone-section zone-section--custom";
  section.style.setProperty("--zone-mark", kindMarkerColor(zone.object_kind));
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

export function buildCorridorRoomsPanel(corridor) {
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
        if (
          !(await ensurePlanObjectNameAllowed({
            entityKind: "room",
            name,
            objectTypeId: kind.object_type_id,
            planId: state.selected.planId,
            sameFloorHintEl: duplicateHint,
            onRejectFocus: () => nameInput.focus(),
          }))
        ) {
          return;
        }
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

export function isPlanLegendHidden() {
  return localStorage.getItem(PLAN_LEGEND_HIDDEN_STORAGE_KEY) === "1";
}

export function applyPlanLegendVisibility() {
  if (!dom.planMarkerLegend || !dom.planMarkerLegendToggle) return;
  const hidden = isPlanLegendHidden();
  dom.planMarkerLegend.hidden = hidden;
  dom.planMarkerLegendToggle.textContent = hidden ? "Показать подсказку" : "Скрыть подсказку";
}

export function updatePlacementCursorHint(event) {
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

/** Pixel box of the bitmap as laid out with object-fit:contain inside the img element. */
export function getObjectFitContainMetrics(img) {
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

export function appendPlanMarker(container, imgEl, m, item, className, title, onClick, markerColor) {
  if (item.pos_x == null || item.pos_y == null) return;
  const marker = document.createElement("button");
  marker.type = "button";
  marker.className = `plan-marker ${className || ""}`.trim();
  if (markerColor) marker.style.backgroundColor = markerColor;
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

export function renderPlanMarkersIn(container, imgEl) {
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
      "",
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
      kindMarkerColor(obj.object_kind),
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
      "",
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
      roomMarkerColor(room.object_type),
    );
  }
}

export function renderPlanMarkers() {
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

export function startPlacementForTransitionZone(zoneId) {
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

export function startPlacementForObject(objectId) {
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

export function focusRoomInCorridor(corridorId, roomId) {
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

export function focusTransitionZoneInList(zoneId) {
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

export function getNormalizedImageCoordsFromEvent(event, targetImage) {
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

export function syncDownloadButton(enabled) {
  if (!dom.downloadImageBtn) return;
  dom.downloadImageBtn.disabled = !enabled;
}

/** Без всплывающих «сохранено» — только пусто или «нет изображения». */
export function syncPlanHintStatus() {
  if (!dom.planHint) return;
  if (state.placement.transitionZoneId != null || state.placement.objectId != null) return;
  if (dom.planImage.getAttribute("src")) {
    dom.planHint.textContent = "";
  } else {
    dom.planHint.textContent = "Изображение не загружено.";
  }
}

export function applyPlanMarkerScale(scale) {
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

export function initPlanMarkerScale() {
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

export async function downloadCurrentPhoto() {
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

function isPlanNotFoundError(err) {
  const detail = apiErrorDetail(err);
  return detail === "Plan not found" || String(detail).includes("Plan not found");
}

export async function loadFloorContext(floorId) {
  let ctx;
  try {
    ctx = await api.getFloorContext(floorId);
  } catch (e) {
    if (isPlanNotFoundError(e)) {
      clearPlanView();
      syncEntityEditCard();
      return;
    }
    throw e;
  }
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
  renderPlanMarkerLegend();
  syncEntityEditCard();
}

export function initPlanMarkerLegend() {
  applyPlanLegendVisibility();
  if (!dom.planMarkerLegendToggle) return;
  dom.planMarkerLegendToggle.addEventListener("click", () => {
    const nextHidden = !isPlanLegendHidden();
    localStorage.setItem(PLAN_LEGEND_HIDDEN_STORAGE_KEY, nextHidden ? "1" : "0");
    applyPlanLegendVisibility();
  });
}

export function initPlanMarkerLayoutListeners() {
  const refresh = () => {
    if (state.planDetail) renderPlanMarkers();
  };
  dom.planImage.addEventListener("load", refresh);
  dom.imageModalImg.addEventListener("load", refresh);
  const ro = new ResizeObserver(refresh);
  ro.observe(dom.planStage);
  ro.observe(dom.imageModalStage);
}

