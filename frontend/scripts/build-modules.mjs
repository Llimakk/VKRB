import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const jsDir = path.join(__dirname, "..", "js");
const lines = fs.readFileSync(path.join(jsDir, "main.js"), "utf8").split(/\r?\n/);

function extract(start, end) {
  return lines.slice(start - 1, end).join("\n");
}

function exportFunctions(body) {
  return body.replace(/^function /gm, "export function ").replace(/^async function /gm, "export async function ");
}

// --- global-search.js ---
const gsBody = exportFunctions(extract(285, 641));
const globalSearch = `import { api } from "./api.js";
import { dom, fillSelect } from "./dom.js";
import {
  state,
  getSelectedName,
  SELECT_BUILDING_PLACEHOLDER,
  SELECT_STRUCTURE_PLACEHOLDER,
  SELECT_FLOOR_PLACEHOLDER,
} from "./state.js";
import { transitionZoneKinds, roomKinds } from "./dictionary.js";

/** Set by main after tree/floor load to avoid circular imports. */
let _nav = null;
export function wireGlobalSearchNavigation(nav) {
  _nav = nav;
}

${gsBody.replace(
  /await navigateToSearchResult\(hit\)/g,
  "await _nav.navigateToSearchResult(hit)",
)}

export function syncGlobalSearchVisibility() {
  if (!dom.globalSearchSection) return;
  const show = state.uiMode === "none";
  dom.globalSearchSection.hidden = !show;
  if (!show) {
    hideGlobalSearchDropdown();
    hideGlobalSearchFilterPanel();
  }
}

export function initGlobalSearch(run) {
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
`;

// navigateToSearchResult stays in global-search but uses _nav - need to replace body of navigateToSearchResult
// Actually the extract includes full navigateToSearchResult - replace its internals to call _nav

fs.writeFileSync(path.join(jsDir, "global-search.js"), globalSearch);
console.log("wrote global-search.js");
