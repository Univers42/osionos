/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:26:52 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/28 19:51:37 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * App-side facade over `@osionos/ui`.
 *
 * The generic kit (atoms, primitives, molecules, hooks) lives in the package.
 * What stays here is what is osionos-specific and therefore cannot travel:
 * the `@univers42/ui-collection` values the app hard-codes, under `assets/`,
 * and the components wired to this app's domain.
 */

export * from "@osionos/ui";
export * from "./atoms/EquationView";
export * from "./atoms/PanelSectionLabel";
export * from "./molecules/NoteComposeModal";
