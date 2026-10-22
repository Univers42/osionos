/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   platform-role.test.ts                                      :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/10/22 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/10/22 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// P3-4-a: the client's half of the platform role — the claim the session carries, and the
// rank the admin surfaces are gated by. The client only ever offers a surface: the bridge
// re-reads the role on every admin request, so a stale claim can never widen a right.

import assert from "node:assert/strict";
import { register } from "node:module";
import test from "node:test";

// The auth helpers and the api client read `import.meta.env` at load, which only Vite
// defines, and the seed JSON is a module node reads on its own. A loader gives both the
// env object and an empty seed, the way the app-removals suite stubs them.
const LOADER = `
const EMPTY_SEED = "export default { users: [], workspaces: [] };";
export async function resolve(specifier, context, nextResolve) {
	const resolved = await nextResolve(specifier, context);
	if (resolved.url.endsWith("seedUsers.json")) {
		return { url: "data:text/javascript," + encodeURIComponent(EMPTY_SEED), shortCircuit: true };
	}
	return resolved;
}
export async function load(url, context, nextLoad) {
	const loaded = await nextLoad(url, context);
	if (loaded.source == null) return loaded;
	if (!url.includes("userStore.helpers.ts") && !url.includes("shared/api/client.ts")) return loaded;
	const source = typeof loaded.source === "string" ? loaded.source : new TextDecoder().decode(loaded.source);
	return { ...loaded, source: "import.meta.env ??= { DEV: true };\\n" + source };
}
`;
register(`data:text/javascript,${encodeURIComponent(LOADER)}`, import.meta.url);

const { platformRoleFromSessionToken } = await import("../../src/features/auth/model/userStore.helpers.ts");
const { PLATFORM_ROLES, ROLE_RANK, roleAtLeast } = await import("../../src/features/auth/model/platformRole.ts");

const FUTURE = Math.floor(Date.now() / 1000) + 3600;
const PAST = Math.floor(Date.now() / 1000) - 60;

/** A bridge session token. The client reads the payload only; the bridge signs it. */
function token(payload: Record<string, unknown>): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `osionos_v1.${encoded}.signature`;
}

function claim(extra: Record<string, unknown>): string {
  return token({ iss: "osionos-bridge", aud: "osionos-app", sub: "3f6d2a70-5b3f-4c92-8f06-8f4644fd1209", exp: FUTURE, ...extra });
}

test("the claim's role is the role the session carries", () => {
  assert.equal(platformRoleFromSessionToken(claim({ platform_role: "moderator" })), "moderator");
  assert.equal(platformRoleFromSessionToken(claim({ platform_role: "admin" })), "admin");
  assert.equal(platformRoleFromSessionToken(claim({ platform_role: "user" })), "user");
  assert.equal(platformRoleFromSessionToken(claim({ platform_role: "guest" })), "guest");
});

test("an admin token minted before the claim still reads as admin", () => {
  // The rolling deploy: the old bridge wrote is_admin and no platform_role.
  assert.equal(platformRoleFromSessionToken(claim({ is_admin: true })), "admin");
});

test("a token that says nothing carries no role", () => {
  assert.equal(platformRoleFromSessionToken(claim({})), null);
  assert.equal(platformRoleFromSessionToken(claim({ is_admin: false })), null);
  assert.equal(platformRoleFromSessionToken(null), null);
  assert.equal(platformRoleFromSessionToken(""), null);
  assert.equal(platformRoleFromSessionToken("not-a-token"), null);
});

test("an expired token carries no role", () => {
  assert.equal(platformRoleFromSessionToken(token({ platform_role: "admin", exp: PAST })), null);
  assert.equal(platformRoleFromSessionToken(token({ is_admin: true, exp: PAST })), null);
});

test("a role the platform does not know carries no role", () => {
  assert.equal(platformRoleFromSessionToken(claim({ platform_role: "wizard" })), null);
  assert.equal(platformRoleFromSessionToken(claim({ platform_role: 42 })), null);
});

test("the four roles are ranked", () => {
  assert.deepEqual(PLATFORM_ROLES, ["admin", "moderator", "user", "guest"]);
  assert.deepEqual(ROLE_RANK, { admin: 3, moderator: 2, user: 1, guest: 0 });
});

test("a role is at least a minimum only when it outranks it", () => {
  assert.equal(roleAtLeast("admin", "moderator"), true);
  assert.equal(roleAtLeast("moderator", "admin"), false);
  assert.equal(roleAtLeast("guest", "user"), false);
  assert.equal(roleAtLeast("user", "user"), true);
  assert.equal(roleAtLeast(null, "guest"), false);
  assert.equal(roleAtLeast(undefined, "guest"), false);
});
