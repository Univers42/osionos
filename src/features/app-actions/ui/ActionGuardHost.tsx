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
	const settledRef = useRef(false);

	useEffect(() => {
		settledRef.current = false;
	}, [request]);

	useEffect(() => {
		const confirm = (title: string, message: string, actionLabel: string) =>
			new Promise<boolean>((resolve) => {
				settledRef.current = false;
				setRequest({ kind: "simple", title, message, actionLabel, resolve });
			});
		const typedConfirm = (title: string, message: string, confirmText: string, actionLabel: string) =>
			new Promise<boolean>((resolve) => {
				settledRef.current = false;
				setRequest({ kind: "typed", title, message, actionLabel, confirmText, resolve });
			});
		setActionGuardHandlers({ confirm, typedConfirm });
		return () => {
			setActionGuardHandlers(null);
		};
	}, []);

	if (!request) return null;

	const settle = (value: boolean) => {
		if (settledRef.current) return;
		settledRef.current = true;
		request.resolve(value);
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