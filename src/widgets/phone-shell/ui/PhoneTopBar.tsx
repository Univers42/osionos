import React from "react";
import { ArrowLeft, UserRound } from "lucide-react";

/** The title row: a back arrow while the stack holds a page, the title, and the account button on the right. */
export const PhoneTopBar: React.FC<{ title: string; canGoBack: boolean; onBack: () => void; onOpenAccount: () => void }> = ({ title, canGoBack, onBack, onOpenAccount }) => (
  <header
    data-testid="phone-topbar"
    className="phone-topbar flex shrink-0 items-center gap-1 border-b border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] px-1"
  >
    {canGoBack && (
      <button
        type="button"
        aria-label="Back"
        onClick={onBack}
        className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--osio-fg-default)] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
      >
        <ArrowLeft size={20} aria-hidden />
      </button>
    )}
    <h1 className="min-w-0 flex-1 truncate px-3 text-base font-semibold text-[var(--osio-fg-default)]">{title}</h1>
    <button
      type="button"
      aria-label="Account and settings"
      aria-haspopup="dialog"
      onClick={onOpenAccount}
      className="flex h-11 w-11 items-center justify-center rounded-md text-[var(--osio-fg-default)] focus-visible:ring-2 focus-visible:ring-[var(--osio-accent)]"
    >
      <UserRound size={20} aria-hidden />
    </button>
  </header>
);
