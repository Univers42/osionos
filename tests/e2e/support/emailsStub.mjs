/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   emailsStub.mjs                                     :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/24 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/24 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// A stateful fake of /api/account/emails and its row routes for the e2e specs: it proves the
// client against a stub, not the bridge. The only code it accepts is GOOD_CODE.

export const GOOD_CODE = "123456";
const STAMP = "2026-10-01T00:00:00Z";
const PRIMARY = { _id: "primary-u", userId: "u", email: "e2e@example.com", isPrimary: true, verifiedAt: STAMP, createdAt: STAMP, updatedAt: STAMP, removedAt: null };
const ROW_PATH = /^\/api\/account\/emails\/([^/]+)(?:\/(code|verify))?$/;

/** `state.emails` holds the secondaries; returns the answer for an emails route, else undefined. */
export function emailRoutes(state, url, method, body, { down = false } = {}) {
  if (url.pathname === "/api/account/emails" && method === "GET") {
    return down ? { status: 503, json: { ok: false, code: "settings_read_failed", message: "Could not read the address." } } : { json: [PRIMARY, ...state.emails] };
  }
  if (url.pathname === "/api/account/emails" && method === "POST") {
    const row = { _id: `row-${state.emails.length + 1}`, userId: "u", email: body.email, isPrimary: false, verifiedAt: null, createdAt: STAMP, updatedAt: STAMP, removedAt: null };
    state.emails.push(row);
    state.bodies.addEmail = body;
    return { status: 202, json: { id: row._id, sentTo: "o•••@e•••.com" } };
  }
  const [, id, action] = url.pathname.match(ROW_PATH) ?? [];
  const row = state.emails.find((candidate) => candidate._id === id);
  if (!id) return undefined;
  if (!row) return { status: 404, json: { ok: false, code: "not_found", message: "There is no email on that path." } };
  if (method === "DELETE") { state.emails = state.emails.filter((candidate) => candidate !== row); return { status: 204, json: {} }; }
  if (action === "code") return { status: 202, json: { sentTo: "o•••@e•••.com" } };
  if (body?.code !== GOOD_CODE) return { status: 422, json: { ok: false, code: "code_invalid", message: "That code is not right." } };
  row.verifiedAt = STAMP;
  return { json: row };
}
