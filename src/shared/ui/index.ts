/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   index.ts                                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/04/28 22:26:52 by dlesieur          #+#    #+#             */
/*   Updated: 2026/09/15 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * App-side facade over `@osionos/ui`.
 *
 * The generic kit (atoms, primitives, molecules, hooks) lives in the package.
 * What stays here is what is osionos-specific and therefore cannot travel:
 * the `@univers42/ui-collection` asset catalogs under `assets/`, and the
 * components wired to this app's domain — `AssetPickerBoard` (configured from
 * those catalogs) and `MediaAssetPicker` (typed on the block model).
 */

export * from "@osionos/ui";
export * from "./molecules/AssetPickerBoard";
