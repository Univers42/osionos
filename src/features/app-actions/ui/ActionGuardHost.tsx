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
import { createGuardDialogController } from "@/features/app-actions/model/guardDialogController";
import type { DialogRequest } from "@/features/app-actions/model/guardDialogController";

export function ActionGuardHost(): React.ReactElement | null {
	const [request, setRequest] = useState<DialogRequest | null>(null);
	const controllerRef = useRef<ReturnType<typeof createGuardDialogController> | null>(null);

	useEffect(() => {
		const controller = createGuardDialogController(setRequest);
		controllerRef.current = controller;
		setActionGuardHandlers({ confirm: controller.confirm, typedConfirm: controller.typedConfirm });
		return () => {
			controller.dispose();
			controllerRef.current = null;
			setActionGuardHandlers(null);
		};
	}, []);

	if (!request) return null;

	const settle = (value: boolean) => controllerRef.current?.settle(value);

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