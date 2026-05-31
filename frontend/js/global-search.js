import { api } from "./api.js";

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
import { run } from "./runner.js";



let globalSearchAbortController = null;
let globalSearchHits = [];
let globalSearchActiveIndex = -1;
let globalSearchFilterOpen = false;

export const GLOBAL_SEARCH_HIER_OPTIONS = [
  { type: "campus", label: "Кампус" },
  { type: "building", label: "Корпус" },
  { type: "structure", label: "Строение" },
  { type: "floor", label: "Этаж" },
];

/** @type {{ hier: Record<string, boolean>, kindById: Record<number, boolean> }} */
const globalSearchFilter = {
  hier: { campus: true, building: true, structure: true, floor: true },
  kindById: {},
};

export function hideGlobalSearchDropdown() {
  if (!dom.globalSearchResults) return;
  dom.globalSearchResults.hidden = true;
  dom.globalSearchResults.innerHTML = "";
  globalSearchHits = [];
  globalSearchActiveIndex = -1;
  const wrap = dom.globalSearchInput?.closest(".global-search");
  if (wrap) wrap.setAttribute("aria-expanded", "false");
}

export function renderGlobalSearchDropdown() {
  if (!dom.globalSearchResults) return;
  dom.globalSearchResults.innerHTML = "";
  if (!globalSearchHits.length) {
    hideGlobalSearchDropdown();
    return;
  }
  for (let i = 0; i < globalSearchHits.length; i++) {
    const hit = globalSearchHits[i];
    const li = document.createElement("li");
    li.className = "global-search__item";
    li.setAttribute("role", "option");
    li.dataset.index = String(i);
    if (i === globalSearchActiveIndex) li.classList.add("global-search__item--active");

    const main = document.createElement("div");
    main.className = "global-search__item-main";
    const nameEl = document.createElement("span");
    nameEl.className = "global-search__item-name";
    nameEl.textContent = hit.name;
    main.appendChild(nameEl);
    if (hit.path_label) {
      const pathEl = document.createElement("span");
      pathEl.className = "global-search__item-path";
      pathEl.textContent = hit.path_label;
      main.appendChild(pathEl);
    }

    const kindEl = document.createElement("span");
    kindEl.className = "global-search__item-kind";
    kindEl.textContent = hit.kind_label || "—";

    li.append(main, kindEl);
    li.addEventListener("mousedown", (e) => {
      e.preventDefault();
      void run(() => selectGlobalSearchHit(i));
    });
    dom.globalSearchResults.appendChild(li);
  }
  dom.globalSearchResults.hidden = false;
  const wrap = dom.globalSearchInput?.closest(".global-search");
  if (wrap) wrap.setAttribute("aria-expanded", "true");
}

export function highlightGlobalSearchItem(index) {
  globalSearchActiveIndex = index;
  if (!dom.globalSearchResults) return;
  const items = dom.globalSearchResults.querySelectorAll(".global-search__item");
  items.forEach((el, i) => {
    el.classList.toggle("global-search__item--active", i === index);
  });
  const active = items[index];
  if (active) active.scrollIntoView({ block: "nearest" });
}

export async function selectGlobalSearchHit(index) {
  const hit = globalSearchHits[index];
  if (!hit) return;
  if (dom.globalSearchInput) dom.globalSearchInput.value = "";
  hideGlobalSearchDropdown();
  await navigateToSearchResult(hit);
}


export function ensureGlobalSearchFilterDefaults() {
  for (const { type } of GLOBAL_SEARCH_HIER_OPTIONS) {
    if (globalSearchFilter.hier[type] === undefined) globalSearchFilter.hier[type] = true;
  }
  for (const k of transitionZoneKinds()) {
    if (globalSearchFilter.kindById[k.id] === undefined) globalSearchFilter.kindById[k.id] = true;
  }
  for (const k of roomKinds()) {
    if (globalSearchFilter.kindById[k.id] === undefined) globalSearchFilter.kindById[k.id] = true;
  }
}

export function appendGlobalSearchFilterCheckbox(container, label, checked, onChange) {
  const lab = document.createElement("label");
  lab.className = "global-search-filter__label";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = checked;
  input.addEventListener("change", () => onChange(input.checked));
  lab.append(input, document.createTextNode(label));
  container.appendChild(lab);
}

export function renderGlobalSearchFilterPanel() {
  ensureGlobalSearchFilterDefaults();

  if (dom.globalSearchFilterHier) {
    dom.globalSearchFilterHier.innerHTML = "";
    for (const { type, label } of GLOBAL_SEARCH_HIER_OPTIONS) {
      appendGlobalSearchFilterCheckbox(
        dom.globalSearchFilterHier,
        label,
        !!globalSearchFilter.hier[type],
        (on) => {
          globalSearchFilter.hier[type] = on;
        },
      );
    }
  }

  const renderKindColumn = (container, kinds, emptyText) => {
    if (!container) return;
    container.innerHTML = "";
    if (!kinds.length) {
      const p = document.createElement("p");
      p.className = "global-search-filter__empty";
      p.textContent = emptyText;
      container.appendChild(p);
      return;
    }
    for (const k of kinds) {
      appendGlobalSearchFilterCheckbox(
        container,
        k.name,
        !!globalSearchFilter.kindById[k.id],
        (on) => {
          globalSearchFilter.kindById[k.id] = on;
        },
      );
    }
  };

  renderKindColumn(dom.globalSearchFilterTz, transitionZoneKinds(), "Нет видов зон перехода");
  renderKindColumn(dom.globalSearchFilterRoom, roomKinds(), "Нет видов помещений");
}

export function collectGlobalSearchFilterParams() {
  ensureGlobalSearchFilterDefaults();
  const hierTypes = GLOBAL_SEARCH_HIER_OPTIONS.filter(({ type }) => globalSearchFilter.hier[type]).map(
    ({ type }) => type,
  );
  const tzKindIds = transitionZoneKinds()
    .filter((k) => globalSearchFilter.kindById[k.id])
    .map((k) => k.id);
  const roomKindIds = roomKinds()
    .filter((k) => globalSearchFilter.kindById[k.id])
    .map((k) => k.id);
  return { hierTypes, tzKindIds, roomKindIds };
}

export function isGlobalSearchDropdownVisible() {
  return dom.globalSearchResults && !dom.globalSearchResults.hidden && globalSearchHits.length > 0;
}

export function toggleGlobalSearchFilterPanel() {
  if (!dom.globalSearchFilterPanel) return;
  globalSearchFilterOpen = !globalSearchFilterOpen;
  dom.globalSearchFilterPanel.hidden = !globalSearchFilterOpen;
  if (dom.globalSearchFilterBtn) {
    dom.globalSearchFilterBtn.setAttribute("aria-expanded", globalSearchFilterOpen ? "true" : "false");
  }
  if (globalSearchFilterOpen) renderGlobalSearchFilterPanel();
}

export function hideGlobalSearchFilterPanel() {
  globalSearchFilterOpen = false;
  if (dom.globalSearchFilterPanel) dom.globalSearchFilterPanel.hidden = true;
  if (dom.globalSearchFilterBtn) dom.globalSearchFilterBtn.setAttribute("aria-expanded", "false");
}

export async function runGlobalSearch() {
  if (!dom.globalSearchInput) return;
  const q = dom.globalSearchInput.value.trim();
  if (!q) {
    hideGlobalSearchDropdown();
    return;
  }
  const { hierTypes, tzKindIds, roomKindIds } = collectGlobalSearchFilterParams();
  if (!hierTypes.length && !tzKindIds.length && !roomKindIds.length) {
    hideGlobalSearchDropdown();
    return;
  }
  if (globalSearchAbortController) globalSearchAbortController.abort();
  globalSearchAbortController = new AbortController();
  const signal = globalSearchAbortController.signal;
  try {
    globalSearchHits =
      (await api.searchObjects(q, { limit: 25, hierTypes, tzKindIds, roomKindIds }, signal)) || [];
    globalSearchActiveIndex = globalSearchHits.length ? 0 : -1;
    renderGlobalSearchDropdown();
  } catch (e) {
    if (e?.name === "AbortError") return;
    throw e;
  }
}




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

