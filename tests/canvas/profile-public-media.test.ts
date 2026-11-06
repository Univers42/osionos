/**
 * The public profile page reads avatarUrl/bannerUrl from GET /api/users/:username, which
 * answers bridge-relative "/api/media/..." paths. They must point at the bridge, not at the
 * web origin (which serves index.html, so the banner showed its alt text).
 *
 * The api client reads import.meta.env (Vite-only), so it is loaded with a shim env.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

const CLIENT = new URL("../../src/shared/api/client.ts", import.meta.url).href;
const UI_STUB = `export const useToastStore = { getState: () => ({ push() {} }) };`;

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "@/shared/ui") return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    const resolved = nextResolve(specifier, context);
    if (resolved.url.endsWith("/src/shared/ui/index.ts")) return { url: `data:text/javascript,${encodeURIComponent(UI_STUB)}`, shortCircuit: true };
    return resolved;
  },
  load(url, context, nextLoad) {
    const result = nextLoad(url, context);
    if (typeof result === "object" && result && "source" in result && url === CLIENT) {
      const source = typeof result.source === "string" ? result.source : new TextDecoder().decode(result.source);
      return { ...result, source: `import.meta.env ??= { VITE_API_URL: "https://bridge.test" };\n${source}` };
    }
    return result;
  },
});

const { mergePublicFields } = await import("../../src/widgets/profile-page/useProfile.ts");
const { isSafeImageSource } = await import("../../src/shared/lib/media/bridgeMediaUrl.ts");

const BASE = { userId: "user-a", username: "ada" } as never;

test("mergePublicFields: bridge media paths point at the bridge", () => {
  const merged = mergePublicFields(BASE, {
    avatarUrl: "/api/media/avatars/user-a/a.webp",
    bannerUrl: "/api/media/avatars/user-a/a-banner.webp",
  });
  assert.equal(merged.avatarUrl, "https://bridge.test/api/media/avatars/user-a/a.webp");
  assert.equal(merged.bannerUrl, "https://bridge.test/api/media/avatars/user-a/a-banner.webp");
});

test("mergePublicFields: absolute URLs, other paths and nulls are kept", () => {
  const merged = mergePublicFields(BASE, { avatarUrl: "https://cdn.example.com/a.png", bannerUrl: null });
  assert.equal(merged.avatarUrl, "https://cdn.example.com/a.png");
  assert.equal(merged.bannerUrl, null);
  assert.equal(mergePublicFields(BASE, { bannerUrl: "/elsewhere/b.png" }).bannerUrl, "/elsewhere/b.png");
});

test("isSafeImageSource: https, a same-origin path and the bridge's media are drawn", () => {
  assert.ok(isSafeImageSource("https://cdn.example.com/a.png"));
  assert.ok(isSafeImageSource("/api/media/avatars/a.webp"));
  assert.ok(isSafeImageSource("https://bridge.test/api/media/avatars/a.webp"));
});

test("isSafeImageSource: a protocol-relative, plain-http or script URL is refused", () => {
  for (const url of ["//evil.example/a.png", "http://evil.example/api/media/a.png", "javascript:alert(1)", "data:image/png;base64,AA", "", null, undefined]) {
    assert.equal(isSafeImageSource(url), false, String(url));
  }
});
