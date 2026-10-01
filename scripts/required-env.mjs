// required-env.mjs — read a credential the live-stack scripts need from the environment.
// The value is generated per machine (groot: scripts/gen-local-env.sh writes it to
// ./.env.local), so there is no default to fall back to: an unset or empty variable is a
// hard error naming the variable and where it comes from, never an empty password.

import { readFileSync } from 'node:fs';

export const DEMO_LOGIN_HINT = 'run `make demo-login` in the groot root (it prints the value from ./.env.local)';

export function requiredEnv(name, hint, env = process.env) {
  const value = env[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`${name} is not set — ${hint}`);
  }
  return value;
}

export function demoLoginPassword(env = process.env) {
  return requiredEnv('DEMO_LOGIN_PASSWORD', DEMO_LOGIN_HINT, env);
}

// readDotEnv: KEY=VALUE lines of a dotenv file; one layer of surrounding quotes stripped.
// Caveat: no multi-line values, no `export` prefix, no ${VAR} expansion — a value using
// any of those comes back literally. Enough for the flat .env this repo writes.
export function readDotEnv(path) {
  return Object.fromEntries(
    readFileSync(path, 'utf8')
      .split('\n')
      .filter((line) => line.includes('=') && !line.trimStart().startsWith('#'))
      .map((line) => {
        const eq = line.indexOf('=');
        return [line.slice(0, eq).trim(), line.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')];
      }),
  );
}
