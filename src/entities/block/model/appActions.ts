/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   appActions.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

/**
 * Types for the app action registry. Imports nothing, so a plain-node test
 * can load them.
 */

export type ParamSpec = {
	type: "string" | "number" | "boolean";
	required?: boolean;
	maxLength?: number;
};

export type ConfirmGuard = "none" | "simple" | { typed: (args: Record<string, unknown>) => string };

export interface ActionDefinition {
	name: string;
	label: string;
	params: Readonly<Record<string, ParamSpec>>;
	confirm: ConfirmGuard;
	confirmText?: (args: Record<string, unknown>) => { title: string; message: string; actionLabel: string };
	sudo: "auto" | "none";
	destructive: boolean;
	run(args: Record<string, unknown>): Promise<ActionResult>;
}

export type ActionResult =
	| { status: "ok"; message?: string; secret?: string }
	| { status: "failed"; message: string }
	| { status: "cancelled" }
	| { status: "sudo_required" }
	| { status: "busy" }
	| { status: "preview" }
	| { status: "blocked"; message: string };

export interface ActionContext {
	mode: "live" | "preview";
	trusted: boolean;
	pause?: { begin(): void; end(): void };
}