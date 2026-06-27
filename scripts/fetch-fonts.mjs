// Fetch the self-hosted variable web fonts into public/fonts/ (run in-container:
//   docker compose ... run --rm --no-deps playground node scripts/fetch-fonts.mjs
// Self-hosting (vs an @fontsource dep) keeps the locked-down supply chain intact.
import { writeFile, mkdir } from "node:fs/promises";

const BASE = "https://cdn.jsdelivr.net/fontsource/fonts";
const FONTS = [
  ["inter:vf@latest/latin-wght-normal.woff2", "inter-latin-wght-normal.woff2"],
  ["newsreader:vf@latest/latin-wght-normal.woff2", "newsreader-latin-wght-normal.woff2"],
  ["jetbrains-mono:vf@latest/latin-wght-normal.woff2", "jetbrains-mono-latin-wght-normal.woff2"],
];

await mkdir("public/fonts", { recursive: true });
for (const [url, name] of FONTS) {
  const res = await fetch(`${BASE}/${url}`);
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 5000 || buf.subarray(0, 4).toString("latin1") !== "wOF2") {
    throw new Error(`${name} is not a valid woff2 (${buf.length} bytes)`);
  }
  await writeFile(`public/fonts/${name}`, buf);
  console.log(`${name}  ${buf.length} bytes  OK`);
}
console.log("fonts fetched.");
