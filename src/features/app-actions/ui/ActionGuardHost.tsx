/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ActionGuardHost.tsx                                :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/26 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/26 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import React, { useEffect, useRef, useState } from "react";

import { ConfirmModal, TypedConfirmModal } from "@/features/settings/ui/ConfirmModals";
import { setActionGuardHandlers } from "@/features/app-actions/model/runAppAction";
import type { ConfirmRequest, TypedConfirmRequest } from "@/features/app-actions/model/runAppAction";

interface DialogRequest {
	kind: "simple" | "typed";
	title: string;
	message: string;
	actionLabel: string;
	confirmText?: string;
	resolve: (value: boolean) => void;
}

export function ActionGuardHost(): React.ReactElement | null {
	const [request, setRequest] = useState<DialogRequest | null>(null);
	const requestRef = useRef<DialogRequest | null>(null);
	const settledRef = useRef(false);

	useEffect(() => {
		settledRef.current = false;
	}, [request]);

	useEffect(() => {
		const confirm = (req: ConfirmRequest) =>
			new Promise<boolean>((resolve) => {
				if (requestRef.current) {
					requestRef.current.resolve(false);
				}
				settledRef.current = false;
				const next: DialogRequest = { kind: "simple", title: req.title, message: req.message, actionLabel: req.actionLabel, resolve };
				requestRef.current = next;
				setRequest(next);
			});
		const typedConfirm = (req: TypedConfirmRequest) =>
			new Promise<boolean>((resolve) => {
				if (requestRef.current) {
					requestRef.current.resolve(false);
				}
				settledRef.current = false;
				const next: DialogRequest = { kind: "typed", title: req.title, message: req.message, actionLabel: req.actionLabel, confirmText: req.confirmText, resolve };
				requestRef.current = next;
				setRequest(next);
			});
		setActionGuardHandlers({ confirm, typedConfirm });
		return () => {
			if (requestRef.current) {
				requestRef.current.resolve(false);
				requestRef.current = null;
			}
			setActionGuardHandlers(null);
		};
	}, []);

	if (!request) return null;

	const settle = (value: boolean) => {
		if (settledRef.current) return;
		settledRef.current = true;
		const current = requestRef.current;
		requestRef.current = null;
		if (current) current.resolve(value);
		setRequest(null);
	};

	if (request.kind === "typed") {
		return (
			<TypedConfirmModal
				title={request.title}
				message={request.message}
				confirmText={request.confirmText ?? ""}
				actionLabel={request.actionLabel}
				danger
				onConfirm={() => settle(true)}
				onClose={() => settle(false)}
			/>
		);
	}
	return (
		<ConfirmModal
			title={request.title}
			message={request.message}
			actionLabel={request.actionLabel}
			danger
			onConfirm={() => settle(true)}
			onClose={() => settle(false)}
		/>
	);
}