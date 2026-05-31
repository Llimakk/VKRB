import fs from "fs";

import path from "path";

import { fileURLToPath } from "url";



const __dirname = path.dirname(fileURLToPath(import.meta.url));

const jsDir = path.join(__dirname, "..", "js");

const src = fs.readFileSync(path.join(jsDir, "main.js"), "utf8");

const L = src.split(/\r?\n/);



function slice(a, b) {

  return L.slice(a - 1, b).join("\n");

}



function exp(body) {

  return body

    .replace(/^function /gm, "export function ")

    .replace(/^async function /gm, "export async function ")

    .replace(/^const ([A-Z_]+)/gm, "export const $1");

}



fs.copyFileSync(path.join(jsDir, "main.js"), path.join(jsDir, "main.monolith.bak.js"));



const dictionaryBody = exp(

  [slice(985, 1249), slice(1260, 1274), slice(2548, 2674)].join("\n\n"),

);



fs.writeFileSync(

  path.join(jsDir, "dictionary.js"),

  `import { api } from "./api.js";

import { dom, fillSelect } from "./dom.js";

import { state, TRANSITION_ZONE_TYPE_LABEL, ROOM_DUPLICATE_MESSAGE } from "./state.js";

import { renderGlobalSearchFilterPanel } from "./global-search.js";

import { askConfirmation, openEntityMetaDialog } from "./modals.js";



${dictionaryBody}

`,

);



const globalSearchBody = exp(slice(285, 375) + "\n\n" + slice(470, 595));



fs.writeFileSync(

  path.join(jsDir, "global-search.js"),

  `import { api } from "./api.js";

import { dom, fillSelect } from "./dom.js";

import {

  state,

  getSelectedName,

  SELECT_CAMPUS_PLACEHOLDER,

  SELECT_BUILDING_PLACEHOLDER,

  SELECT_STRUCTURE_PLACEHOLDER,

  SELECT_FLOOR_PLACEHOLDER,

} from "./state.js";

import { transitionZoneKinds, roomKinds } from "./dictionary.js";

import { navigateToSearchResult } from "./tree.js";



${globalSearchBody}



export function initGlobalSearch() {

  if (!dom.globalSearchInput || !dom.globalSearchResults) return;

  renderGlobalSearchFilterPanel();

  dom.globalSearchBtn?.addEventListener("click", () => void run(runGlobalSearch));

  dom.globalSearchFilterBtn?.addEventListener("click", (e) => {

    e.stopPropagation();

    toggleGlobalSearchFilterPanel();

  });

  dom.globalSearchInput.addEventListener("keydown", (e) => {

    if (e.key === "Escape") {

      hideGlobalSearchDropdown();

      hideGlobalSearchFilterPanel();

      return;

    }

    if (e.key === "Enter") {

      if (isGlobalSearchDropdownVisible() && globalSearchActiveIndex >= 0) {

        e.preventDefault();

        void run(() => selectGlobalSearchHit(globalSearchActiveIndex));

        return;

      }

      e.preventDefault();

      void run(runGlobalSearch);

      return;

    }

    if (!isGlobalSearchDropdownVisible() || !globalSearchHits.length) return;

    if (e.key === "ArrowDown") {

      e.preventDefault();

      highlightGlobalSearchItem(Math.min(globalSearchActiveIndex + 1, globalSearchHits.length - 1));

    } else if (e.key === "ArrowUp") {

      e.preventDefault();

      highlightGlobalSearchItem(Math.max(globalSearchActiveIndex - 1, 0));

    }

  });

  document.addEventListener("click", (e) => {

    if (!dom.globalSearchSection?.contains(e.target)) {

      hideGlobalSearchDropdown();

      hideGlobalSearchFilterPanel();

    }

  });

}

`,

);



const treeBody = exp(

  [

    slice(52, 284),

    slice(376, 468),

    slice(665, 983),

    slice(2362, 2546),

    slice(2676, 2679),

  ].join("\n\n"),

);



fs.writeFileSync(

  path.join(jsDir, "tree.js"),

  `import { api } from "./api.js";

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



${treeBody.replace(/^const ENTITY_EDIT_EXPANDED_KEY/m, "export const ENTITY_EDIT_EXPANDED_KEY")}

`,

);



const floorBody = exp(

  [

    slice(643, 658),

    slice(1286, 1675),

    slice(1683, 1702),

    slice(1724, 1908),

    slice(2230, 2360),

    slice(3325, 3344),

  ].join("\n\n"),

);



fs.writeFileSync(

  path.join(jsDir, "floor.js"),

  `import { api } from "./api.js";

import { dom, fillSelect } from "./dom.js";

import {

  state,

  normalizeImageUrl,

  getSelectedName,

  PLAN_MARKER_SCALE_STORAGE_KEY,

  PLAN_MARKER_SCALE_MIN,

  PLAN_MARKER_SCALE_MAX,

  PLAN_MARKER_SCALE_DEFAULT,

  PLAN_LEGEND_HIDDEN_STORAGE_KEY,

} from "./state.js";

import {

  kindMarkerColor,

  roomMarkerColor,

  renderPlanMarkerLegend,

  isCorridorZone,

  roomsForCorridor,

  findRoomById,

  roomNameExistsOnFloor,

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



${floorBody}

`,

);



const modalsBody = exp(

  [

    slice(1677, 1681),

    slice(1704, 1722),

    slice(1910, 1973),

    slice(1975, 1981),

    slice(1983, 2228),

    slice(2681, 2684),

    slice(2686, 2918),

  ].join("\n\n"),

);



fs.writeFileSync(
  path.join(jsDir, "modals.js"),
  `import { api } from "./api.js";

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

} from "./state.js";

import {

  objectTypeIdSupportsKindMarkerColor,
  predictDefaultMarkerColor,
  isRoomObjectTypeName,
  isHierarchyObjectKindTypeId,
  roomNameExistsOnFloor,
  findRoomById,
  fillRoomKindSelect,
  setRoomDuplicateHint,
  loadObjectDictionaries,
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



${modalsBody}

`,

);



const mainContent = fs.readFileSync(path.join(__dirname, "main-wire-template.js"), "utf8");

fs.writeFileSync(path.join(jsDir, "main.js"), mainContent);



console.log("Built modules + main.js");


