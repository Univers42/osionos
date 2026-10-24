/** Marks a shortcut that shares its combo + condition with another enabled shortcut. */
export function ConflictBadge(): React.JSX.Element {
  return (
    <span
      title="Another enabled shortcut uses this combo and condition"
      className="shrink-0 rounded-xs px-1.5 py-0.5 text-2xs font-medium text-[var(--osio-accent-text)] bg-[var(--osio-accent-subtle)]"
    >
      Conflict
    </span>
  );
}
