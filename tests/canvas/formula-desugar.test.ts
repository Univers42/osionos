/* ************************************************************************** */
/*  formula-desugar.test.ts — Excel "=" sugar → native engine grammar         */
/* ************************************************************************** */

import assert from "node:assert/strict";
import test from "node:test";

import { desugarFormula } from "../../src/shared/notion-database-sys/src/lib/formula/desugarFormula.ts";

test("no leading '=' is a byte-for-byte no-op (native formulas untouched)", () => {
  for (const native of ['prop("A") + 1', "if(Qty > 0, 1, 0)", "1 + 2 * 3", "  spaced  "]) {
    assert.equal(desugarFormula(native), native);
  }
});

test("a leading '=' is stripped — the Excel mode switch", () => {
  assert.equal(desugarFormula("=1+1"), "1+1");
  assert.equal(desugarFormula("=Qty * 2"), "Qty * 2");
  assert.equal(desugarFormula("  = 1 + 1"), " 1 + 1"); // trimStart then drop the '='
});

test("'&' becomes '+' (the engine concatenates strings with +)", () => {
  assert.equal(desugarFormula("=A & B"), "A + B");
  assert.equal(desugarFormula('=First & " " & Last'), 'First + " " + Last');
});

test("comparison sugar: '<>' → '!=' and a lone '=' → '==', others preserved", () => {
  assert.equal(desugarFormula("=A <> B"), "A != B");
  assert.equal(desugarFormula("=A = B"), "A == B");
  assert.equal(desugarFormula("=A >= B"), "A >= B");
  assert.equal(desugarFormula("=A <= B"), "A <= B");
  assert.equal(desugarFormula("=A == B"), "A == B");
  assert.equal(desugarFormula("=A != B"), "A != B");
  assert.equal(desugarFormula("=x => x + 1"), "x => x + 1"); // lambda arrow survives
});

test("string literals are never rewritten (& = <> inside quotes are literal)", () => {
  assert.equal(desugarFormula('="a & b = c <> d"'), '"a & b = c <> d"');
  assert.equal(desugarFormula("='SUM(x)'"), "'SUM(x)'"); // fn name inside a string stays text
  assert.equal(desugarFormula('=UPPER("a & b")'), 'upper("a & b")');
});

test("function names fold to the engine's casing, with Excel aliases", () => {
  assert.equal(desugarFormula("=SUM(A)"), "sum(A)");
  assert.equal(desugarFormula("=IF(A, 1, 0)"), "if(A, 1, 0)");
  assert.equal(desugarFormula("=UPPER(Name)"), "upper(Name)");
  assert.equal(desugarFormula("=DATEADD(d)"), "dateAdd(d)"); // camelCase native name
  assert.equal(desugarFormula("=AVERAGE(Score)"), "mean(Score)");
  assert.equal(desugarFormula("=CONCATENATE(A, B)"), "concat(A, B)");
  assert.equal(desugarFormula("=LEN(Name)"), "length(Name)");
  assert.equal(desugarFormula("=SUM (A)"), "sum (A)"); // space before '(' still a call
  // Sourced from the graphical catalog, so its full set folds (not just a
  // hand-picked subset) — these two were missing from the earlier list.
  assert.equal(desugarFormula("=SUBSTRING(Name, 0, 3)"), "substring(Name, 0, 3)");
  assert.equal(desugarFormula("=PADSTART(Code, 5)"), "padStart(Code, 5)");
});

test("an unknown function is left as typed so the engine reports it", () => {
  assert.equal(desugarFormula("=FOO(A)"), "FOO(A)");
});

test("TRUE / FALSE fold to the engine's lowercase booleans", () => {
  assert.equal(desugarFormula("=TRUE"), "true");
  assert.equal(desugarFormula("=IF(A, TRUE, FALSE)"), "if(A, true, false)");
});

test("bare property references keep their casing (not lowercased like functions)", () => {
  assert.equal(desugarFormula("=Qty * Price"), "Qty * Price");
});

test("[Multi word column] → prop(\"…\"); single tokens and arrays are left alone", () => {
  assert.equal(desugarFormula("=[Total Price] * 2"), 'prop("Total Price") * 2');
  assert.equal(desugarFormula("=[Price]"), "[Price]"); // native single-token PropertyAccess
  assert.equal(desugarFormula("=[1, 2, 3]"), "[1, 2, 3]"); // array literal (has commas)
});

test("desugaring is idempotent — safe to apply at multiple layers", () => {
  for (const expr of ["=IF(A = B, UPPER(X) & \"!\", [Big Col])", "=SUM(A) <> 0", "=TRUE"]) {
    const once = desugarFormula(expr);
    assert.equal(desugarFormula(once), once);
  }
});

test("a compound Excel formula lowers to a valid engine expression", () => {
  assert.equal(
    desugarFormula('=IF([Order Total] >= 100, UPPER("vip") & "!", "std")'),
    'if(prop("Order Total") >= 100, upper("vip") + "!", "std")',
  );
});
