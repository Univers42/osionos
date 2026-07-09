import { RotateCcw, X } from "lucide-react";

import { formatCombo } from "../model/combo";
import { ALL_COMMANDS } from "../model/commandRegistry";
import type { Automation, CommandId, WhenName } from "../model/types";
import { ConflictBadge } from "./ConflictBadge";
import { useComboRecorder } from "./useComboRecorder";

const WHEN_OPTIONS: { value: WhenName; label: string }[] = [
  { value: "always", label: "Always" },
  { value: "editorFocused", label: "Editor focused" },
  { value: "inTextEntry", label: "Typing in text" },
  { value: "notInText", label: "Not typing" },
  { value: "hasBlockSelection", label: "Blocks selected" },
  { value: "blockSelectionActive", label: "Blocks selected (not typing)" },
  { value: "textFullySelectedOrHasBlockSelection", label: "Text all-selected / blocks" },
];

export interface AutomationRowProps {
  automation: Automation;
  conflicted: boolean;
  isCustom: boolean;
  onCombo: (combo: string) => void;
  onCommand: (commandId: CommandId) => void;
  onWhen: (when: WhenName) => void;
  onToggle: () => void;
  onReset: () => void;
  onRemove: () => void;
}

const SELECT_CLASS =
  "min-w-0 rounded border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 py-1 text-xs text-[var(--osio-fg-default)]";

export function AutomationRow(props: AutomationRowProps): React.JSX.Element {
  const { automation, conflicted, isCustom, onCombo, onCommand, onWhen, onToggle, onReset, onRemove } = props;
  const recorder = useComboRecorder(onCombo);
  const combo = automation.trigger.combo;

  return (
    <div className="flex items-center gap-2 border-b border-[var(--osio-border-soft)] py-2 text-sm">
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={automation.enabled}
        title={automation.enabled ? "Enabled" : "Disabled"}
        className={`relative h-4 w-7 shrink-0 rounded-full transition-colors ${automation.enabled ? "bg-[var(--osio-accent)]" : "bg-[var(--osio-bg-hover)]"}`}
      >
        <span
          className="absolute top-0.5 block h-3 w-3 rounded-full bg-[var(--osio-accent-fg)] transition-transform"
          style={{ transform: automation.enabled ? "translateX(14px)" : "translateX(2px)" }}
        />
      </button>

      <span className="w-36 shrink-0 truncate text-[var(--osio-fg-default)]">{automation.name}</span>

      <button
        type="button"
        onClick={recorder.recording ? recorder.stop : recorder.start}
        className="w-36 shrink-0 rounded border border-[var(--osio-border-default)] px-2 py-1 text-left font-mono text-xs text-[var(--osio-fg-muted)] hover:border-[var(--osio-accent)]"
      >
        {recorder.recording ? "Press keys…" : combo ? formatCombo(combo) : "Set shortcut"}
      </button>

      <select value={automation.actions[0]?.commandId} onChange={(event) => onCommand(event.target.value as CommandId)} className={`flex-1 ${SELECT_CLASS}`}>
        {ALL_COMMANDS.map((command) => (
          <option key={command.id} value={command.id}>{command.title}</option>
        ))}
      </select>

      <select value={automation.trigger.when} onChange={(event) => onWhen(event.target.value as WhenName)} className={`w-40 shrink-0 ${SELECT_CLASS}`}>
        {WHEN_OPTIONS.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>

      {conflicted ? <ConflictBadge /> : null}

      <button type="button" onClick={onReset} title="Reset to default" className="shrink-0 rounded p-1 text-[var(--osio-fg-subtle)] hover:text-[var(--osio-fg-muted)]">
        <RotateCcw size={14} />
      </button>
      {isCustom ? (
        <button type="button" onClick={onRemove} title="Remove" className="shrink-0 rounded p-1 text-[var(--osio-fg-subtle)] hover:text-[var(--osio-danger)]">
          <X size={14} />
        </button>
      ) : null}
    </div>
  );
}
