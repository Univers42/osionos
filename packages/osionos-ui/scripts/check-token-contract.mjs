/**
 * Token-contract guard.
 *
 * The kit styles itself with `--osio-*` custom properties it does not define —
 * the host does. That makes the token set a real, if invisible, dependency: a
 * component that starts reading `--osio-something-new` silently renders wrong
 * in every host that never heard of it.
 *
 * This script closes that hole in both directions:
 *   - every token READ by src/ must be DECLARED in tokens.css (else: undeclared
 *     dependency),
 *   - every token DECLARED in tokens.css should still be READ by src/ (else:
 *     the contract has grown dead entries and stops describing the kit).
 *
 * Zero dependencies; runs under plain node.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const CONTRACT = join(ROOT, 'tokens.css');
const TOKEN_RE = /--osio-[a-zA-Z0-9-]+/g;

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

/** token -> sorted list of files that read it */
function tokensRead() {
  const seen = new Map();
  for (const file of sourceFiles(SRC)) {
    for (const token of readFileSync(file, 'utf8').match(TOKEN_RE) ?? []) {
      if (!seen.has(token)) seen.set(token, new Set());
      seen.get(token).add(relative(ROOT, file));
    }
  }
  return seen;
}

function tokensDeclared() {
  const declared = new Set();
  for (const [, name] of readFileSync(CONTRACT, 'utf8').matchAll(/(--osio-[a-zA-Z0-9-]+)\s*:/g)) {
    declared.add(name);
  }
  return declared;
}

function main() {
  if (!statSync(CONTRACT, { throwIfNoEntry: false })) {
    console.error(`✗ token contract missing: ${relative(ROOT, CONTRACT)}`);
    process.exit(1);
  }

  const read = tokensRead();
  const declared = tokensDeclared();

  const undeclared = [...read.keys()].filter((t) => !declared.has(t)).sort();
  const unused = [...declared].filter((t) => !read.has(t)).sort();

  if (undeclared.length > 0) {
    console.error('\n✗ tokens read by the kit but absent from tokens.css:\n');
    for (const token of undeclared) {
      console.error(`  ${token}`);
      for (const file of [...read.get(token)].sort()) console.error(`      ${file}`);
    }
    console.error('\nAdd them to tokens.css (with the reference light value) —');
    console.error('an undeclared token is a dependency no host can see.\n');
  }

  if (unused.length > 0) {
    console.error('\n✗ tokens declared in tokens.css but no longer read:\n');
    for (const token of unused) console.error(`  ${token}`);
    console.error('\nRemove them: the contract must describe the kit as it is.\n');
  }

  if (undeclared.length > 0 || unused.length > 0) process.exit(1);
  console.log(`✓ token contract holds: ${declared.size} tokens, all declared and all used.`);
}

main();
