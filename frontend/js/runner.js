import {
  apiErrorDetail,
  TRANSITION_ZONE_DUPLICATE_DETAIL,
  OBJECT_KIND_IN_USE_DETAIL,
} from "./state.js";

/** Global async error handler for UI actions. */
export async function run(fn) {
  try {
    await fn();
  } catch (e) {
    console.error("[VKRB]", e);
    const detail = apiErrorDetail(e);
    if (detail === "room_name_exists_on_floor") {
      const { showRoomDuplicateFromApiError } = await import("./dictionary.js");
      showRoomDuplicateFromApiError();
      return;
    }
    if (
      detail === TRANSITION_ZONE_DUPLICATE_DETAIL ||
      detail === "Зона перехода с таким именем уже есть"
    ) {
      const { showTransitionZoneDuplicateFromApiError } = await import("./dictionary.js");
      showTransitionZoneDuplicateFromApiError();
      return;
    }
    if (detail === OBJECT_KIND_IN_USE_DETAIL) {
      const { showObjectKindInUseFromApiError } = await import("./dictionary.js");
      await showObjectKindInUseFromApiError();
      return;
    }
    const message = e instanceof Error ? e.message : String(e);
    if (message && message.length < 500) {
      window.alert(message);
    }
  }
}
