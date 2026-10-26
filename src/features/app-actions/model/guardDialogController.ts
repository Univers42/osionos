/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   guardDialogController.ts                           :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import type { ConfirmRequest, TypedConfirmRequest } from "@/features/app-actions/model/runAppAction";

export interface DialogRequest {
	kind: "simple" | "typed";
	title: string;
	message: string;
	actionLabel: string;
	confirmText?: string;
	resolve: (value: boolean) => void;
}

export function createGuardDialogController(onChange: (request: DialogRequest | null) => void) {
	let current: DialogRequest | null = null;
	let settled = false;

	function settle(value: boolean): void {
		if (settled || !current) return;
		settled = true;
		const req = current;
		current = null;
		req.resolve(value);
		onChange(null);
	}

	function open(next: DialogRequest): void {
		if (current) {
			current.resolve(false);
		}
		settled = false;
		current = next;
		onChange(next);
	}

	return {
		confirm(req: ConfirmRequest): Promise<boolean> {
			return new Promise<boolean>((resolve) => {
				open({ kind: "simple", title: req.title, message: req.message, actionLabel: req.actionLabel, resolve });
			});
		},
		typedConfirm(req: TypedConfirmRequest): Promise<boolean> {
			return new Promise<boolean>((resolve) => {
				open({ kind: "typed", title: req.title, message: req.message, actionLabel: req.actionLabel, confirmText: req.confirmText, resolve });
			});
		},
		settle(value: boolean): void {
			settle(value);
		},
		dispose(): void {
			if (current) {
				const req = current;
				current = null;
				settled = true;
				req.resolve(false);
				onChange(null);
			}
		},
	};
}