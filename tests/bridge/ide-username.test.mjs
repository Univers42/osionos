// The name a sandbox terminal shows. One sanitizer, a token field that never throws, and a
// lookup that can only ever cost "no name".
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
	DEFAULT_IDE_USERNAME, RESERVED_IDE_USERNAMES, isValidIdeUsername, lookupIdeUsername, sanitizeIdeUsername, usernameFromToken,
} from "../../scripts/ide-username.mjs";
import { signIdeToken, verifyIdeToken } from "../../scripts/ide-token.mjs";
import { buildContainerSpec, buildShellExecSpec } from "../../scripts/ide-sandbox-spec.mjs";

const SECRET = "k".repeat(32);
const USER = "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa";
const WS = "bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb";

const TABLE = [
	[null, "coder"], [undefined, "coder"], [42, "coder"], ["", "coder"],
	["Dylan", "dylan"], ["dylan.l", "dylan_l"], ["../x", "___x"], ["-rf", "_rf"], ["9lives", "u9lives"],
	["日本", "coder"], ["a".repeat(48), "a".repeat(32)], ["root", "coder"], ["coder", "coder"], ["Coder", "coder"],
	["ROOT", "coder"], ["x:0:0::/:", "x_0_0____"], ["a\nb", "a_b"],
];
for (const [raw, want] of TABLE) {
	test(`sanitize ${JSON.stringify(raw)} -> ${want}`, () => {
		assert.equal(sanitizeIdeUsername(raw), want);
		assert.ok(/^[a-z_][a-z0-9_-]{0,31}$/.test(sanitizeIdeUsername(raw)));
	});
}

// The reserved set is read from the built image, never typed here: IDE_PASSWD_BASE is a file
// taken out of it (docker run --rm --entrypoint cat <image> /etc/passwd.base).
test("every account name in the image's /etc/passwd.base is reserved", { skip: process.env.IDE_PASSWD_BASE ? false : "set IDE_PASSWD_BASE to the image's /etc/passwd.base" }, () => {
	const names = readFileSync(process.env.IDE_PASSWD_BASE, "utf8").split("\n").filter(Boolean).map((line) => line.split(":")[0]);
	assert.ok(names.includes("root") && names.includes("coder"));
	for (const name of names) {
		assert.ok(RESERVED_IDE_USERNAMES.has(name), `${name} is in passwd.base but not reserved`);
		assert.equal(sanitizeIdeUsername(name), DEFAULT_IDE_USERNAME);
	}
});

test("a token carries a valid name and verify returns it", () => {
	const { token } = signIdeToken({ userId: USER, workspaceId: WS, secret: SECRET, username: "dylan" });
	assert.equal(verifyIdeToken(token, { secret: SECRET }).username, "dylan");
});

test("a token without a name verifies as coder, so old and new sides interoperate", () => {
	const { token } = signIdeToken({ userId: USER, workspaceId: WS, secret: SECRET });
	assert.equal(verifyIdeToken(token, { secret: SECRET }).username, "coder");
});

test("signing refuses to put an invalid name in the token", () => {
	for (const username of ["Root", "root", "../x", "x:0", "", 7]) {
		const { token } = signIdeToken({ userId: USER, workspaceId: WS, secret: SECRET, username });
		const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());
		assert.equal("un" in payload, false, String(username));
	}
});

test("verify re-validates un and never throws on it", async () => {
	const { createHmac } = await import("node:crypto");
	const { token } = signIdeToken({ userId: USER, workspaceId: WS, secret: SECRET });
	const [version, part] = token.split(".");
	const base = JSON.parse(Buffer.from(part, "base64url").toString());
	const forge = (un) => {
		const body = Buffer.from(JSON.stringify({ ...base, un })).toString("base64url");
		return `${version}.${body}.${createHmac("sha256", SECRET).update(`${version}.${body}`).digest("base64url")}`;
	};
	for (const un of ["root", "Dylan", "../x", 5, null, {}, ["a"], "x".repeat(40)]) {
		const result = verifyIdeToken(forge(un), { secret: SECRET });
		assert.equal(result.username, "coder", JSON.stringify(un));
	}
	assert.equal(verifyIdeToken(forge("dylan"), { secret: SECRET }).username, "dylan");
});

test("usernameFromToken is exact: only valid names pass", () => {
	assert.equal(usernameFromToken("dylan"), "dylan");
	assert.equal(usernameFromToken("Dylan"), "coder");
	assert.equal(isValidIdeUsername("coder"), false);
});

test("lookup returns the sanitized stored username", async () => {
	const fetchImpl = async (url) => {
		assert.match(url, new RegExp(`osionos_bridge_identities\\?user_id=eq\\.${USER}&select=username&limit=1$`));
		return Response.json([{ username: "Dylan.L" }]);
	};
	assert.equal(await lookupIdeUsername({ baasUrl: "http://k", serviceKey: "s" }, fetchImpl, USER), "dylan_l");
});

test("lookup answers undefined for NULL, no row, an error, and an unconfigured BaaS", async () => {
	const cfg = { baasUrl: "http://k", serviceKey: "s" };
	assert.equal(await lookupIdeUsername(cfg, async () => Response.json([{ username: null }]), USER), undefined);
	assert.equal(await lookupIdeUsername(cfg, async () => Response.json([]), USER), undefined);
	assert.equal(await lookupIdeUsername(cfg, async () => new Response("boom", { status: 500 }), USER), undefined);
	assert.equal(await lookupIdeUsername(cfg, async () => { throw new Error("down"); }, USER), undefined);
	assert.equal(await lookupIdeUsername({}, async () => Response.json([{ username: "x" }]), USER), undefined);
});

test("lookup gives up at the bound instead of delaying the mint", async () => {
	const never = () => new Promise(() => {});
	const started = Date.now();
	assert.equal(await lookupIdeUsername({ baasUrl: "http://k", serviceKey: "s" }, never, USER, 100), undefined);
	assert.ok(Date.now() - started < 1000);
});

test("the name rides the PTY exec Env only, never the create Env or the safe shell", () => {
	assert.ok(buildShellExecSpec({ username: "dylan" }).Env.includes("OSIO_USER=dylan"));
	assert.ok(!buildShellExecSpec({ username: "root" }).Env.some((e) => e.startsWith("OSIO_USER")));
	assert.ok(!buildShellExecSpec({ username: "x\nHOME=/tmp" }).Env.some((e) => e.startsWith("OSIO_USER")));
	assert.ok(!buildShellExecSpec({ safe: true, username: "dylan" }).Env.some((e) => e.startsWith("OSIO_USER")));
	assert.ok(!buildShellExecSpec({}).Env.some((e) => e.startsWith("OSIO_USER")));
});

test("the create Env pins HOME once as its 8th entry and carries no name", () => {
	const spec = buildContainerSpec({ image: "i", userId: USER, workspaceId: WS, containerName: "ide-" + "a".repeat(32), volumeName: "osio-ide-vol-" + "a".repeat(32), uid: 20000, env: {} });
	assert.equal(spec.Env.length, 8);
	assert.equal(spec.Env.at(-1), "HOME=/home/coder");
	assert.ok(!spec.Env.some((e) => /^(OSIO_USER|USER|LOGNAME)=/.test(e)));
	for (const exec of [buildShellExecSpec({ username: "dylan" })]) assert.ok(!exec.Env.some((e) => e.startsWith("HOME=")));
});
