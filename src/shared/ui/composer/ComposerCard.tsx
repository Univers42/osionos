/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ComposerCard.tsx                                  :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/11/26 12:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/11/26 12:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React from "react";

/**
 * The one look of a message composer: a floating rounded card on the overlay
 * tokens, so the Style presets (Calm/Paper/Soft/Frost/Aurora) restyle it, with an
 * accent border and a soft ring while the caret is inside. The channel composer
 * and the AI chat composer both wear it.
 *
 * The ring is a box-shadow, which forced-colors mode drops: the outline takes
 * over there so keyboard focus stays visible.
 */
export const COMPOSER_CARD_CLASS =
  "relative rounded-[calc(16px*var(--osio-radius-scale,1))] border border-[var(--osio-overlay-border)] bg-[var(--osio-bg-surface)] shadow-[var(--osio-menu-shadow)] focus-within:border-[var(--osio-accent)] focus-within:ring-2 focus-within:ring-[color-mix(in_srgb,var(--osio-accent)_20%,transparent)] forced-colors:border-[CanvasText] forced-colors:focus-within:outline forced-colors:focus-within:outline-2";

/** The round accent send button; a disabled one is muted to the surface, not just dimmed. */
export const COMPOSER_SEND_CLASS =
  "inline-flex shrink-0 items-center justify-center rounded-full bg-[var(--osio-accent)] text-[var(--osio-accent-fg)] transition-colors hover:bg-[var(--osio-accent-hover,var(--osio-accent))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--osio-focus-ring-color)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--osio-bg-surface)] disabled:cursor-not-allowed disabled:bg-[var(--osio-bg-muted)] disabled:text-[var(--osio-fg-subtle)] disabled:hover:bg-[var(--osio-bg-muted)]";

type ComposerCardProps = React.ComponentPropsWithRef<"div">;

/** The card itself; `className` is appended, every other div prop (ref, data-*) passes through. */
export const ComposerCard: React.FC<ComposerCardProps> = ({ className, ...props }) => (
  <div {...props} className={className ? `${COMPOSER_CARD_CLASS} ${className}` : COMPOSER_CARD_CLASS} />
);
