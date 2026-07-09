import { useMemo, useRef } from "react";
import { Download, Plus, RotateCcw, Upload } from "lucide-react";

import { isAutomationsEnabled } from "@/shared/config/featureFlags";

import { DEFAULT_AUTOMATIONS } from "../model/defaultAutomations";
import { computeConflicts, useAutomationStore } from "../model/useAutomationStore";
import type { Automation } from "../model/types";
import { AutomationRow } from "./AutomationRow";

const TOOLBAR_BUTTON =
  "flex items-center gap-1 rounded border border-[var(--osio-border-default)] px-2 py-1 text-xs text-[var(--osio-fg-muted)] hover:border-[var(--osio-accent)] hover:text-[var(--osio-fg-default)]";

/**
 * The editable shortcut table (Settings → Keyboard shortcuts, and reachable via
 * `>shortcut` in the command palette). Each row is one keyboard automation:
 * combo → command, with a `when` condition and an on/off toggle. Add/remove
 * custom rows, reset, and export/import the whole config as JSON.
 */
export function AutomationManagerPanel(): React.JSX.Element {
  const overrides = useAutomationStore((state) => state.overrides);
  const custom = useAutomationStore((state) => state.custom);
  const store = useAutomationStore.getState(); // action methods are stable
  const fileRef = useRef<HTMLInputElement | null>(null);

  const automations = useMemo<Automation[]>(
    () => [...DEFAULT_AUTOMATIONS.map((automation) => overrides[automation.id] ?? automation), ...custom],
    [overrides, custom],
  );
  const conflicts = useMemo(() => computeConflicts(automations), [automations]);
  const customIds = useMemo(() => new Set(custom.map((automation) => automation.id)), [custom]);

  const exportConfig = (): void => {
    const blob = new Blob([store.exportJson()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "osionos-shortcuts.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = (file: File): void => {
    void file.text().then((text) => store.importJson(text));
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-[var(--osio-fg-strong)]">Keyboard shortcuts</h2>
          <p className="text-xs text-[var(--osio-fg-subtle)]">
            Each shortcut is a keyboard automation — a key-combo triggers a command.
            {isAutomationsEnabled() ? "" : " Enable with ?osio.automations=1 to activate them."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" className={TOOLBAR_BUTTON} onClick={() => store.addAutomation()}><Plus size={14} /> Add</button>
          <button type="button" className={TOOLBAR_BUTTON} onClick={exportConfig}><Download size={14} /> Export</button>
          <button type="button" className={TOOLBAR_BUTTON} onClick={() => fileRef.current?.click()}><Upload size={14} /> Import</button>
          <button type="button" className={TOOLBAR_BUTTON} onClick={() => store.resetAll()}><RotateCcw size={14} /> Reset all</button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) importConfig(file);
              event.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="flex flex-col">
        {automations.map((automation) => (
          <AutomationRow
            key={automation.id}
            automation={automation}
            conflicted={conflicts.has(automation.id)}
            isCustom={customIds.has(automation.id)}
            onCombo={(combo) => store.updateAutomation(automation.id, { trigger: { combo } })}
            onCommand={(commandId) => store.updateAutomation(automation.id, { actions: [{ type: "run_command", commandId }] })}
            onWhen={(when) => store.updateAutomation(automation.id, { trigger: { when } })}
            onToggle={() => store.toggleEnabled(automation.id)}
            onReset={() => store.resetBinding(automation.id)}
            onRemove={() => store.removeAutomation(automation.id)}
          />
        ))}
      </div>
    </div>
  );
}
