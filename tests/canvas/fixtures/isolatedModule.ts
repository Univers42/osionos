import { randomUUID } from 'node:crypto';
import { mock } from 'node:test';

const repoRoot = new URL('../../../', import.meta.url);

/** Import the real module with boundary doubles; preserve its imports and module semantics. */
export async function isolatedModule(path: string, dependencies: Record<string, Record<string, unknown>>): Promise<Record<string, any>> {
  const mocks = [];
  try {
    for (const [dependency, namedExports] of Object.entries(dependencies)) {
      const specifier = dependency === 'react' ? dependency : new URL(dependency, repoRoot).href;
      mocks.push(mock.module(specifier, { namedExports }));
    }
    return await import(`${new URL(path, repoRoot).href}?test=${randomUUID()}`);
  } finally {
    for (const boundary of mocks.reverse()) boundary.restore();
  }
}
