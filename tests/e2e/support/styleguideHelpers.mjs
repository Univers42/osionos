// Helpers the styleguide specs share: opening the page, finding a section and
// reading what a token resolves to.

export const section = (page, name) => page.getByRole("region", { name, exact: true });

export async function openStyleguide(page, baseURL) {
  await page.goto(`${baseURL}/__styleguide`, { waitUntil: "domcontentloaded" });
  await page.getByTestId("styleguide").waitFor();
}

/** What a fresh element given var(token) computes for one CSS property. */
export async function tokenValue(page, property, token) {
  return page.evaluate(([cssProperty, name]) => {
    const probe = document.createElement("div");
    probe.style.setProperty(cssProperty, `var(${name})`);
    document.body.append(probe);
    const value = getComputedStyle(probe).getPropertyValue(cssProperty);
    probe.remove();
    return value;
  }, [property, token]);
}

export const computed = (locator, property) =>
  locator.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property);
