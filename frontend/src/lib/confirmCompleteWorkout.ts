import { Alert } from "react-native";
import { inProgressSession } from "./planCalendarPrototypeStore";

/**
 * "Complete workout?" with the set count, then the caller's action. Shared by
 * the workout and day screens (GitHub #47, 2026-09-18: an accidental
 * completion cannot be undone from the app yet, so it is asked once).
 */
export function confirmCompleteWorkout(
  dateIso: string,
  onConfirm: () => void,
): void {
  const s = inProgressSession(dateIso);
  Alert.alert(
    "Complete workout?",
    s ? `${s.loggedSets} of ${s.totalSets} sets logged.` : undefined,
    [
      { text: "Not yet", style: "cancel" },
      { text: "Complete", style: "default", onPress: onConfirm },
    ],
  );
}
