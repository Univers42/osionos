/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   TemplatesPanel.tsx                                 :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/20 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/20 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";

import type { CatalogueCard, CatalogueCategory } from "@/data/templates/catalogue/types";
import { useCatalogueCards } from "@/features/templates/model/useCatalogueCards";
import { filterCards } from "../model/filterCards";
import { TemplateCard } from "./TemplateCard";

type Category = CatalogueCategory | "all";
type Navigate = (event: React.KeyboardEvent<HTMLDivElement>, index: number) => void;
const CATEGORIES: { id: Category; label: string }[] = [
  { id: "all", label: "All" }, { id: "work", label: "Work" }, { id: "personal", label: "Personal" },
  { id: "school", label: "School" }, { id: "team", label: "Team" }, { id: "page", label: "Pages" },
];
const NAVIGATION_KEYS = new Set(["ArrowDown", "ArrowUp", "Home", "End"]);

function nextFocusIndex(key: string, current: number, count: number): number {
  if (key === "Home") return 0;
  if (key === "End") return Math.max(0, count - 1);
  if (key === "ArrowDown") return Math.min(current + 1, count - 1);
  if (key === "ArrowUp") return Math.max(current - 1, 0);
  return current;
}

function useRovingFocus(count: number) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate: Navigate = (event, index) => {
    if (!NAVIGATION_KEYS.has(event.key)) return;
    event.preventDefault();
    const next = nextFocusIndex(event.key, index, count);
    setFocusedIndex(next);
    listRef.current?.querySelectorAll<HTMLElement>('[role="option"]')[next]?.focus();
  };
  return { focusedIndex, listRef, navigate, onFocus: setFocusedIndex, reset: () => setFocusedIndex(0) };
}

function CategoryChips({ value, onChange }: { value: Category; onChange: (category: Category) => void }): React.ReactElement {
  return (
    <div role="radiogroup" aria-label="Category" className="flex flex-wrap gap-1">
      {CATEGORIES.map(({ id, label }) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} onClick={() => onChange(id)}
          className={`rounded-full px-2.5 py-0.5 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] ${value === id ? "bg-[var(--osio-accent)] text-[var(--osio-accent-fg)]" : "text-[var(--osio-fg-muted)] hover:bg-[var(--osio-bg-hover)] hover:text-[var(--osio-fg-default)]"}`}>
          {label}
        </button>
      ))}
    </div>
  );
}

function Controls({ query, category, onQuery, onCategory }: { query: string; category: Category; onQuery: (query: string) => void; onCategory: (category: Category) => void }): React.ReactElement {
  return (
    <div className="space-y-2 px-3 pb-2 pt-2">
      <label className="flex h-8 items-center gap-2 rounded-md border border-[var(--osio-border-default)] bg-[var(--osio-bg-surface)] px-2 text-[var(--osio-fg-muted)] focus-within:ring-2 focus-within:ring-[var(--osio-focus-ring-color)]">
        <Search size={14} aria-hidden="true" />
        <input name="search-templates" aria-label="Search templates" placeholder="Search templates" value={query} onChange={(event) => onQuery(event.target.value)}
          className="min-w-0 flex-1 bg-transparent text-sm text-[var(--osio-fg-default)] outline-none placeholder:text-[var(--osio-fg-subtle)]" />
      </label>
      <CategoryChips value={category} onChange={onCategory} />
    </div>
  );
}

function Results({ cards, focusedIndex, listRef, onFocus, onNavigate }: {
  cards: CatalogueCard[] | null;
  focusedIndex: number;
  listRef: React.RefObject<HTMLDivElement | null>;
  onFocus: (index: number) => void;
  onNavigate: Navigate;
}): React.ReactElement {
  if (cards === null) return <p role="status" className="px-4 py-10 text-center text-sm text-[var(--osio-fg-muted)]">Loading templates…</p>;
  if (cards.length === 0) return <p className="px-4 py-10 text-center text-sm text-[var(--osio-fg-muted)]">No templates match</p>;
  return (
    <div ref={listRef} role="listbox" aria-label="Templates" className="min-h-0 flex-1 overflow-y-auto px-2 pb-5">
      {cards.map((card, index) => <TemplateCard key={card.id} card={card} focused={focusedIndex === index}
        onFocus={() => onFocus(index)} onNavigate={(event) => onNavigate(event, index)} />)}
    </div>
  );
}

export function TemplatesPanel(): React.ReactElement {
  const cards = useCatalogueCards();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const visible = useMemo(() => filterCards(cards ?? [], query, category), [cards, query, category]);
  const { focusedIndex, listRef, navigate, onFocus, reset } = useRovingFocus(visible.length);
  const changeQuery = (value: string) => { setQuery(value); reset(); };
  const changeCategory = (value: Category) => { setCategory(value); reset(); };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <Controls query={query} category={category} onQuery={changeQuery} onCategory={changeCategory} />
      <Results cards={cards === null ? null : visible} focusedIndex={focusedIndex} listRef={listRef} onFocus={onFocus} onNavigate={navigate} />
    </div>
  );
}
