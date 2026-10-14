// ************************************************************************** //
//                                                                            //
//                                                        :::      ::::::::   //
//   ideIndentation.spec.mjs                             :+:      :+:    :+:   //
//                                                    +:+ +:+         +:+     //
//   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        //
//                                                +#+#+#+#+#+   +#+           //
//   Created: 2026/10/14 00:00:00 by dlesieur          #+#    #+#             //
//   Updated: 2026/10/14 00:00:00 by dlesieur         ###   ########.fr       //
//                                                                            //
// ************************************************************************** //
// Tab in the code editor. A Makefile recipe needs a real tab (make answers "missing
// separator" to spaces) and 42's norm indents C with tabs; a new TypeScript file gets four
// spaces, and a file already indented keeps what its content shows. The editor used to
// force spaces everywhere (useMonacoEditor's global insertSpaces).
import { expect, test } from "@playwright/test";
import { bootApp } from "../perf/perfHarness.mjs";

const CASES = [
  { fileName: "Makefile", text: "all:\n", expected: "all:\n\techo ok" },
  { fileName: "get_next_line.c", text: "int f(void)\n", expected: "int f(void)\n\techo ok" },
  { fileName: "fresh.ts", text: "all:\n", expected: "all:\n    echo ok" },
  { fileName: "tabbed.ts", text: "if (x) {\n\ty();\n}\n", expected: "if (x) {\n\ty();\n}\n\techo ok" },
];

for (const { fileName, text, expected } of CASES) {
  test(`Tab in ${fileName}`, async ({ page }) => {
    test.setTimeout(180_000); // cold Vite compile of the Monaco chunk
    await bootApp(page);
    await page.locator("[data-osio-workbench]").waitFor({ state: "visible", timeout: 60_000 });
    const pageId = await page.evaluate(([name, body]) => globalThis.__perfOpenCodePage(name, body), [fileName, text]);
    const input = page.locator(".monaco-editor textarea").first();
    await input.waitFor({ state: "attached", timeout: 90_000 });
    await page.locator(".monaco-editor .view-lines").first().click();
    await page.keyboard.press("Control+End");
    await page.keyboard.press("Tab");
    await page.keyboard.type("echo ok");
    await expect.poll(() => page.evaluate((id) => globalThis.__perfCodeText(id), pageId), { timeout: 15_000 }).toBe(expected);
  });
}
