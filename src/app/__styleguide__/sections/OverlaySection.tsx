import React from "react";
import { Bell, Trash2 } from "lucide-react";

import { Menu, MenuItem } from "@/shared/ui";
import { StyleGuideSection } from "./StyleGuideSection";

export const OverlaySection: React.FC = () => (
  <StyleGuideSection title="Overlays">
    <Menu className="w-full">
      <MenuItem icon={<Bell size={16} strokeWidth={2} />}>Notify</MenuItem>
      <MenuItem icon={<Trash2 size={16} strokeWidth={2} />} destructive>Delete</MenuItem>
    </Menu>
    <div
      data-testid="overlay-surface"
      className="border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] p-4"
      style={{ borderRadius: "var(--osio-radius-overlay)", boxShadow: "var(--osio-e4)" }}
    >
      <p className="text-sm font-semibold text-[var(--osio-fg-strong)]">Confirm action</p>
      <p className="pt-1 text-sm text-[var(--osio-fg-muted)]">A static picture of a dialog surface.</p>
    </div>
  </StyleGuideSection>
);
