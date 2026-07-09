import { useCallback, useEffect, useState } from "react";

import { isModifierKey, normalizeComboFromEvent } from "../model/combo";
import { setComboRecording } from "../model/recordingState";

/**
 * Captures the next key-combo the user presses. While recording, a capture-phase
 * listener swallows keydowns and latches `recording` so the automation dispatcher
 * stands down; the first non-modifier key resolves the combo.
 */
export function useComboRecorder(onCapture: (combo: string) => void): {
  recording: boolean;
  start: () => void;
  stop: () => void;
} {
  const [recording, setRecording] = useState(false);

  const start = useCallback(() => setRecording(true), []);
  const stop = useCallback(() => setRecording(false), []);

  useEffect(() => {
    setComboRecording(recording);
    if (!recording) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      if (isModifierKey(event.key)) return; // wait for the non-modifier key
      onCapture(normalizeComboFromEvent(event));
      setRecording(false);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      setComboRecording(false);
    };
  }, [recording, onCapture]);

  return { recording, start, stop };
}
