/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   StyleGuideRoute.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";
import { Bell, Trash2 } from "lucide-react";

import { Badge, Button, Card, Input, Menu, MenuItem, SectionHeader } from "@/shared/ui";
import {
  ACCENT_SWATCHES,
  BLOCK_TINTS,
  STATUS_SWATCHES,
  SURFACE_SWATCHES,
  TEXT_SWATCHES,
  type Swatch,
} from "./styleGuideData";

/**
 * DEV-only design-system reference. Renders the full token + primitive set side
 * by side in light and dark, so a reviewer can eyeball parity. Tokens are scoped
 * to [data-theme], so each themed column re-themes its own subtree. Uses tokens
 * only — never a hardcoded hex. Code-split out of the production bundle.
 */

function Chip({ token, kind }: Swatch) {
  const isFg = kind === "fg";
  const style = isFg ? { color: `var(${token})` } : { backgroundColor: `var(${token})` };
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-12 rounded-md border border-[var(--osio-border-default)]"
        style={isFg ? undefined : style}
      >
        {isFg ? <span className="px-2 py-1 text-sm font-medium" style={style}>Aa</span> : null}
      </div>
      <code className="text-[11px] text-[var(--osio-fg-subtle)]">{token}</code>
    </div>
  );
}

function SwatchGrid({ items }: { items: Swatch[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {items.map((swatch) => <Chip key={swatch.token} {...swatch} />)}
    </div>
  );
}

function TintRow() {
  return (
    <div className="grid grid-cols-3 gap-2">
      {BLOCK_TINTS.map((name) => (
        <div
          key={name}
          className="rounded-md border border-[var(--osio-border-default)] px-2 py-1.5 text-xs font-medium"
          style={{
            backgroundColor: `var(--osio-block-tint-${name}-bg)`,
            color: `var(--osio-block-tint-${name}-fg)`,
          }}
        >
          {name}
        </div>
      ))}
    </div>
  );
}

function TypeSpecimen() {
  return (
    <div className="space-y-2" style={{ fontFamily: "var(--osio-font-family-serif)" }}>
      <h1 className="text-3xl font-bold text-[var(--osio-fg-strong)]">Heading one</h1>
      <h2 className="text-2xl font-semibold text-[var(--osio-fg-strong)]">Heading two</h2>
      <h3 className="text-xl font-semibold text-[var(--osio-fg-default)]">Heading three</h3>
      <p className="text-sm leading-6 text-[var(--osio-fg-default)]" style={{ fontFamily: "var(--osio-font-family-sans)" }}>
        Body copy in the sans family. <a className="text-[var(--osio-accent-text)] underline" href="#">An accent link</a> stays AA-safe.
      </p>
      <code className="block rounded-md bg-[var(--osio-bg-muted)] px-2 py-1 text-xs text-[var(--osio-fg-default)]" style={{ fontFamily: "var(--osio-font-family-mono)" }}>
        {'const mono = "code";'}
      </code>
    </div>
  );
}

function CalloutMock() {
  return (
    <div
      className="flex items-start gap-2 rounded-lg border border-[var(--osio-border-default)] px-3 py-2"
      style={{ backgroundColor: "var(--osio-block-tint-blue-bg)", color: "var(--osio-block-tint-blue-fg)" }}
    >
      <Bell size={16} strokeWidth={2} className="mt-0.5 shrink-0" />
      <p className="text-sm leading-6">An admonition callout, tinted with the blue block token.</p>
    </div>
  );
}

function CodeBlockMock() {
  return (
    <div className="overflow-hidden rounded-lg border border-[var(--osio-border-default)]">
      <div className="flex items-center justify-between bg-[var(--osio-bg-muted)] px-3 py-1.5">
        <span className="text-xs text-[var(--osio-fg-muted)]" style={{ fontFamily: "var(--osio-font-family-mono)" }}>app.ts</span>
        <Badge tone="accent">TS</Badge>
      </div>
      <pre className="bg-[var(--osio-bg-surface)] px-3 py-2 text-xs text-[var(--osio-fg-default)]" style={{ fontFamily: "var(--osio-font-family-mono)" }}>
{`export const ok = true;`}
      </pre>
    </div>
  );
}

function PrimitiveShowcase() {
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button tone="primary">Primary</Button>
        <Button tone="default">Default</Button>
        <Button tone="danger">Danger</Button>
        <Button tone="ghost">Ghost</Button>
        <Button tone="default" disabled>Disabled</Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Badge>default</Badge>
        <Badge tone="accent">accent</Badge>
        <Badge tone="success">success</Badge>
        <Badge tone="danger">danger</Badge>
        <Badge tone="warning">warning</Badge>
      </div>
      <Input placeholder="Type something…" defaultValue="" />
      <Card title="Card title" description="A docs-style nav card with hover affordance." onClick={() => undefined} />
      <Menu className="w-full">
        <MenuItem icon={<Bell size={16} strokeWidth={2} />}>Notify</MenuItem>
        <MenuItem icon={<Trash2 size={16} strokeWidth={2} />} destructive>Delete</MenuItem>
      </Menu>
    </div>
  );
}

function ThemeColumn({ theme }: { theme: "light" | "dark" }) {
  return (
    <div
      data-theme={theme}
      className="flex-1 space-y-6 rounded-lg border border-[var(--osio-border-default)] bg-[var(--osio-bg-page)] p-5 text-[var(--osio-fg-default)]"
    >
      <SectionHeader title={`${theme} theme`} action={<Badge tone="accent">{theme}</Badge>} />
      <section className="space-y-2"><SectionHeader title="surfaces" /><SwatchGrid items={SURFACE_SWATCHES} /></section>
      <section className="space-y-2"><SectionHeader title="text" /><SwatchGrid items={TEXT_SWATCHES} /></section>
      <section className="space-y-2"><SectionHeader title="accent" /><SwatchGrid items={ACCENT_SWATCHES} /></section>
      <section className="space-y-2"><SectionHeader title="border & status" /><SwatchGrid items={STATUS_SWATCHES} /></section>
      <section className="space-y-2"><SectionHeader title="block tints" /><TintRow /></section>
      <section className="space-y-2"><SectionHeader title="typography" /><TypeSpecimen /></section>
      <section className="space-y-2"><SectionHeader title="primitives" /><PrimitiveShowcase /></section>
      <section className="space-y-2"><SectionHeader title="callout & code" /><CalloutMock /><CodeBlockMock /></section>
    </div>
  );
}

export const StyleGuideRoute: React.FC = () => (
  <div className="h-screen w-screen overflow-auto bg-[var(--osio-bg-page)] p-6">
    <h1 className="mb-4 text-2xl font-bold text-[var(--osio-fg-strong)]" style={{ fontFamily: "var(--osio-font-family-serif)" }}>
      osionos design system
    </h1>
    <div className="flex flex-col gap-6 lg:flex-row">
      <ThemeColumn theme="light" />
      <ThemeColumn theme="dark" />
    </div>
  </div>
);

export default StyleGuideRoute;
