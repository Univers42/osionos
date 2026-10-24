/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   twoStepStub.mjs                    :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/23 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/23 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Shared setup for the two-step and passkey specs: a stateful fake of /api/account/2fa/*,
// /api/account/passkeys and /api/account/settings, with a record of every call so a test can
// assert what the browser sent and in what order.

import { stubBridge } from "./bridgeStub.mjs";

export const OTPAUTH = "otpauth://totp/osionos:e2e@example.com?secret=JBSWY3DPEHPK3PXP&issuer=osionos";
export const RECOVERY_CODES = ["aaaa-1111", "bbbb-2222", "cccc-3333", "dddd-4444"];
export const NEW_TOKEN = "osionos_v1.e2e-new.sig";

const route = (url, method) => `${method} ${url.pathname}`;

/** `enabled` is the server's answer to the status route; `passkeys` its rows. */
export async function stubTwoStep(page, { enabled = false, recoveryRemaining = 0, passkeys = [], preferred = "totp", emailsDown = false } = {}) {
  const state = { enabled, recoveryRemaining, passkeys: [...passkeys], preferred, calls: [], bodies: {}, patches: [] };
  await stubBridge(page, (url, request) => {
    const key = route(url, request.method());
    if (url.pathname.startsWith("/api/account/")) state.calls.push(key);
    const body = request.postData() ? JSON.parse(request.postData()) : undefined;
    const [, passkeyId] = url.pathname.match(/^\/api\/account\/passkeys\/([^/]+)$/) ?? [];
    const settings = () => ({ userId: "u", security: { passkeysEnabled: true, preferredMfaMethod: state.preferred } });
    if (key === "GET /api/account/settings") return { json: settings() };
    if (key === "PATCH /api/account/settings") {
      // The real route takes exactly this one key; anything else is a 422, as on the bridge.
      state.patches.push(body);
      const keys = Object.keys(body?.security ?? {});
      const method = body?.security?.preferredMfaMethod;
      if (Object.keys(body ?? {}).join() !== "security" || keys.join() !== "preferredMfaMethod" || !["totp", "recovery"].includes(method)) return { status: 422, json: { ok: false, code: "invalid_body", message: "Only the preferred method can be changed." } };
      state.preferred = method;
      return { json: settings() };
    }
    if (key === "GET /api/account/emails") return emailsDown ? { status: 503, json: { ok: false, code: "settings_read_failed", message: "Could not read the address." } } : { json: [{ _id: "primary-u", userId: "u", email: "e2e@example.com", isPrimary: true, verifiedAt: "2026-10-01T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", removedAt: null }] };
    if (key === "GET /api/account/2fa/status") return { json: { enabled: state.enabled, methods: ["totp"], recoveryRemaining: state.recoveryRemaining, aal: 2 } };
    if (key === "POST /api/account/2fa/enroll") return { json: { otpauthUrl: OTPAUTH } };
    if (key === "POST /api/account/2fa/verify") { state.bodies.verify = body; state.enabled = true; return { json: { ok: true, accessToken: NEW_TOKEN, expiresAt: "2026-10-29T10:00:00Z", aal: 2 } }; }
    if (key === "POST /api/account/2fa/recovery/generate") { state.recoveryRemaining = RECOVERY_CODES.length; return { json: { ok: true, codes: RECOVERY_CODES, remaining: RECOVERY_CODES.length } }; }
    if (key === "POST /api/account/2fa/disable") { state.enabled = false; return { json: { ok: true, accessToken: NEW_TOKEN } }; }
    if (key === "GET /api/account/passkeys") return { json: state.passkeys };
    if (request.method() === "PATCH" && passkeyId) {
      state.bodies.rename = body;
      state.passkeys = state.passkeys.map((row) => (row._id === passkeyId ? { ...row, nickname: body.nickname } : row));
      return { json: state.passkeys.find((row) => row._id === passkeyId) };
    }
    if (request.method() === "DELETE" && passkeyId) { state.passkeys = state.passkeys.filter((row) => row._id !== passkeyId); return { json: { ok: true } }; }
    return undefined;
  });
  return state;
}

export const passkeyRow = (id, nickname) => ({ _id: id, userId: "u", transports: ["internal"], nickname, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z", lastUsedAt: null, removedAt: null });
