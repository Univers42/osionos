import { readFileSync } from 'node:fs';
import ts from 'typescript';

/** Run the real module with explicit boundary doubles, without loading the UI app graph. */
export function isolatedModule(path: string, bindings: Record<string, unknown>, exports: string[] = []): Record<string, any> {
  const source = readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8');
  const parsed = ts.createSourceFile(path, `${source}\nexport { ${exports.join(', ')} };`, ts.ScriptTarget.Latest, true);
  const stripped = ts.factory.updateSourceFile(parsed, parsed.statements.filter((s) => !ts.isImportDeclaration(s)));
  const compiled = ts.transpileModule(ts.createPrinter().printFile(stripped), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  });
  const output = {};
  new Function('exports', ...Object.keys(bindings), compiled.outputText)(output, ...Object.values(bindings));
  return output;
}
