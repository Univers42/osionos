// Counts each needle's occurrences in a built bundle's .js, .css and .html files and prints
// {dir, files, counts} as JSON. Plain node, no grep: it runs the same in the alpine builder
// image as anywhere else. A missing or unreadable directory throws (non-zero exit), never
// "0 matches"; the caller checks files > 0 so an empty build cannot pass either.
//
// usage: node count-bundle-strings.mjs <dir> <needle>...

import fs from "node:fs";
import path from "node:path";

const [dir, ...needles] = process.argv.slice(2);
if (!dir || needles.length === 0) {
  console.error("usage: node count-bundle-strings.mjs <dir> <needle>...");
  process.exit(2);
}

const counts = Object.fromEntries(needles.map((needle) => [needle, 0]));
let files = 0;

function walk(current) {
  for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (/\.(js|css|html)$/.test(entry.name)) {
      files += 1;
      const text = fs.readFileSync(full, "utf8");
      for (const needle of needles) counts[needle] += text.split(needle).length - 1;
    }
  }
}

walk(dir);
console.log(JSON.stringify({ dir, files, counts }));
