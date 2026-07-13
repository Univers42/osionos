/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   usePushSubscription.ts                             :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/07/12 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/07/12 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { useCallback, useEffect, useState } from "react";
import { api, getActivePageJwt } from "@/shared/api/client";
import { isPushEnabled } from "@/shared/config/featureFlags";

type PushState = "unsupported" | "off" | "on" | "denied" | "busy";

/** VAPID public key (base64url) → the Uint8Array applicationServerKey wants. */
function vapidKeyToBytes(base64url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64url.length % 4)) % 4);
  const normalized = (base64url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  const bytes = new Uint8Array(raw.length);
  for (let index = 0; index < raw.length; index += 1) bytes[index] = raw.charCodeAt(index);
  return bytes;
}

function pushSupported(): boolean {
  return isPushEnabled() && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** Manage this browser's Web Push subscription (register SW → subscribe → persist). */
export function usePushSubscription() {
  const [state, setState] = useState<PushState>(() => (pushSupported() ? "off" : "unsupported"));

  useEffect(() => {
    if (!pushSupported()) return; // initial state already reflects "unsupported"
    navigator.serviceWorker.getRegistration()
      .then((registration) => registration?.pushManager.getSubscription())
      .then((subscription) => setState(subscription ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);

  const subscribe = useCallback(async () => {
    if (!pushSupported()) return;
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") { setState("denied"); return; }
      const registration = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await api.get<{ publicKey?: string }>("/api/push/vapid-public-key");
      if (!publicKey) { setState("off"); return; } // server dormant (no VAPID keypair)
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: vapidKeyToBytes(publicKey),
      });
      await api.post("/api/push/subscribe", subscription.toJSON(), getActivePageJwt() ?? undefined);
      setState("on");
    } catch { setState("off"); }
  }, []);

  const unsubscribe = useCallback(async () => {
    setState("busy");
    try {
      const registration = await navigator.serviceWorker.getRegistration();
      const subscription = await registration?.pushManager.getSubscription();
      if (subscription) {
        await api.delete(`/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`, getActivePageJwt() ?? undefined);
        await subscription.unsubscribe();
      }
      setState("off");
    } catch { setState("on"); }
  }, []);

  return { state, subscribe, unsubscribe, supported: pushSupported() };
}
