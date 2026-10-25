/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   routeKind.ts                                       :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

export type RouteKind = "page" | "database" | "chat" | "settings" | "admin" | "other";

export function routeKindOf(pathname: unknown, activeTabKind?: unknown): RouteKind {
  const path = String(pathname ?? "");
  if (path.startsWith("/settings")) return "settings";
  const kind = String(activeTabKind ?? "").toLowerCase();
  if (kind === "admin") return "admin";
  if (kind === "chat" || kind === "messages" || kind === "community" || kind === "group" || kind === "channel" || kind === "conversation" || kind === "conversations") return "chat";
  if (kind === "database") return "database";
  if (kind === "page") return "page";
  // A page route with no tab hint still reads as a page.
  if (path !== "" && !path.startsWith("/")) return "page";
  return "other";
}
