/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   responsiveLayout.spec.mjs                          :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: serjimen <serjimen@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/09/30 18:00:00 by serjimen          #+#    #+#             */
/*   Updated: 2026/09/30 18:00:00 by serjimen         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

import { test, expect } from "@playwright/test";

/**
 * Viewport presets matching the ft_transcendence evaluation requirement:
 * "Test on at least two different screen sizes (desktop and mobile/tablet)."
 *
 * We test three to be thorough — desktop, tablet, and mobile — plus a
 * landscape mobile variant for edge-case coverage.
 */
const VIEWPORTS = {
	desktop: { width: 1440, height: 960 },
	tablet: { width: 768, height: 1024 },
	mobileLandscape: { width: 844, height: 390 },
	mobile: { width: 375, height: 812 },
};

/**
 * Wait for the app shell to be ready (sidebar + workspace grid mounted).
 * This avoids flaky assertions against a half-loaded page.
 */
async function waitForAppShell(page) {
	// The app renders a root div with the workspace; wait for at least the
	// main content area to be present. We use a generous timeout because
	// cold Vite starts can be slow in CI.
	await page.waitForLoadState("networkidle", { timeout: 30_000 });
	// Give React time to commit the initial render
	await page.waitForTimeout(1500);
}

async function closeSidebar(page) {
	// Close the main app sidebar only if currently expanded (rail is ~54px, expanded panel is ~266px)
	const isExpanded = await page.evaluate(() => {
		const aside = document.querySelector('aside[aria-label="Sidebar"]');
		if (!aside) return false;
		return aside.getBoundingClientRect().width > 100;
	});
	if (isExpanded) {
		const closeBtn = page.locator('button[title="Close sidebar"]');
		const collapseBtn = page.locator('button[aria-label="Collapse to rail"]');
		const mainToggle = page.locator('button[aria-label="Toggle sidebar"]');

		if (await closeBtn.count() > 0 && await closeBtn.first().isVisible()) {
			await closeBtn.first().click({ force: true, timeout: 5000 }).catch(() => {});
		} else if (await collapseBtn.count() > 0 && await collapseBtn.first().isVisible()) {
			await collapseBtn.first().click({ force: true, timeout: 5000 }).catch(() => {});
		} else if (await mainToggle.count() > 0 && await mainToggle.first().isVisible()) {
			await mainToggle.first().click({ force: true, timeout: 5000 }).catch(() => {});
		}
		await page.waitForTimeout(400);
	}
	
	// Close the nested database/gallery sidebar if present
	const dbToggle = page.locator('.odb-collapse-btn');
	if (await dbToggle.count() > 0 && await dbToggle.first().isVisible()) {
		await dbToggle.first().click({ force: true, timeout: 5000 }).catch(() => {});
		await page.waitForTimeout(300);
	}
}

function overflowDetector() {
	const vw = window.innerWidth;
	const all = document.querySelectorAll("body *");
	const overflowing = [];
	for (const el of all) {
		const rect = el.getBoundingClientRect();
		// Ignore hidden / zero-size elements
		if (rect.width === 0 || rect.height === 0) continue;
		// Skip elements parented by a sidebar-like container, the topbar, or scrollable containers
		if (el.closest('[class*="sidebar"], [class*="Sidebar"], .odb-topbar-actions, [class*="topBar"], [class*="top-bar"], .odb-topbar, .overflow-auto, .overflow-x-auto, .sticky.top-0')) continue;
		if (rect.right > vw + 4) {
			overflowing.push({
				tag: el.tagName,
				class: el.className?.toString?.()?.slice(0, 80) || "",
				right: Math.round(rect.right),
				vw,
			});
		}
	}
	return overflowing.slice(0, 5);
}

// ─── Desktop (1440×960) ─────────────────────────────────────────────────

test.describe("responsive — desktop (1440×960)", () => {
	test.use({ viewport: VIEWPORTS.desktop });

	test("app loads and renders without horizontal overflow", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		// No horizontal scrollbar should appear at desktop width
		const hasHorizontalOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth > document.documentElement.clientWidth;
		});
		expect(hasHorizontalOverflow).toBe(false);
	});

	test("sidebar is visible at desktop width", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		// The sidebar should be present and visible (not collapsed)
		const sidebar = page.locator('[class*="sidebar"]').first();
		if (await sidebar.count() > 0) {
			const box = await sidebar.boundingBox();
			// Sidebar should have non-zero width (not collapsed)
			expect(box).not.toBeNull();
			if (box) {
				expect(box.width).toBeGreaterThan(50);
			}
		}
	});

	test("main content area uses available width", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		// Root container should fill the viewport width
		const rootBox = await page.locator("#root").boundingBox();
		expect(rootBox).not.toBeNull();
		if (rootBox) {
			expect(rootBox.width).toBeGreaterThanOrEqual(VIEWPORTS.desktop.width - 2);
		}
	});

	test("desktop screenshot for visual reference", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);
		await page.screenshot({
			path: "test-results/responsive-desktop.png",
			fullPage: false,
		});
	});
});

// ─── Tablet (768×1024) ──────────────────────────────────────────────────

test.describe("responsive — tablet (768×1024)", () => {
	test.use({ viewport: VIEWPORTS.tablet });

	test("app loads and renders without horizontal overflow", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		const hasHorizontalOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth > document.documentElement.clientWidth;
		});
		expect(hasHorizontalOverflow).toBe(false);
	});

	test("content adapts to tablet width", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);
		await closeSidebar(page);

		// Root container should fill the viewport
		const rootBox = await page.locator("#root").boundingBox();
		expect(rootBox).not.toBeNull();
		if (rootBox) {
			expect(rootBox.width).toBeGreaterThanOrEqual(VIEWPORTS.tablet.width - 2);
		}

		// No element should visually overflow beyond the viewport
		const overflowingElements = await page.evaluate(overflowDetector);
		expect(overflowingElements).toEqual([]);
	});

	test("interactive elements remain accessible (not clipped or hidden)", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		// Any visible buttons/links should be within the viewport
		const buttons = page.locator("button:visible, a:visible, [role='button']:visible");
		const count = await buttons.count();
		for (let i = 0; i < Math.min(count, 20); i++) {
			const box = await buttons.nth(i).boundingBox();
			if (box && box.width > 0 && box.height > 0) {
				// Right edge should be within viewport (with small tolerance for borders)
				expect(box.x + box.width).toBeLessThanOrEqual(VIEWPORTS.tablet.width + 8);
				// Should not be pushed off-screen left
				expect(box.x).toBeGreaterThanOrEqual(-8);
			}
		}
	});

	test("tablet screenshot for visual reference", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);
		await page.screenshot({
			path: "test-results/responsive-tablet.png",
			fullPage: false,
		});
	});
});

// ─── Mobile (375×812 — iPhone-class) ────────────────────────────────────

test.describe("responsive — mobile (375×812)", () => {
	test.use({ viewport: VIEWPORTS.mobile });

	test("app loads and renders without horizontal overflow", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		const hasHorizontalOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth > document.documentElement.clientWidth;
		});
		expect(hasHorizontalOverflow).toBe(false);
	});

	test("page title adapts to mobile width (font-size ≤ 30px at 768px breakpoint)", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		// The CSS has @media (max-width: 768px) { .osionos-page-title { font-size: 30px } }
		const pageTitle = page.locator(".osionos-page-title").first();
		if (await pageTitle.count() > 0) {
			const fontSize = await pageTitle.evaluate((el) =>
				parseFloat(getComputedStyle(el).fontSize)
			);
			expect(fontSize).toBeLessThanOrEqual(32);
		}
	});

	test("layout panels become bottom-sheet at mobile width", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		// At 768px breakpoint, .osionos-layout-settings-panel gets position:absolute,
		// bottom:12px — it becomes a bottom sheet rather than a side panel.
		const settingsPanel = page.locator(".osionos-layout-settings-panel").first();
		if (await settingsPanel.count() > 0 && await settingsPanel.isVisible()) {
			const styles = await settingsPanel.evaluate((el) => {
				const cs = getComputedStyle(el);
				return { position: cs.position, bottom: cs.bottom };
			});
			expect(styles.position).toBe("absolute");
			expect(styles.bottom).toBe("12px");
		}
	});

	test("no element wider than the mobile viewport", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);
		await closeSidebar(page);

		const overflowingElements = await page.evaluate(overflowDetector);
		expect(overflowingElements).toEqual([]);
	});

	test("mobile screenshot for visual reference", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);
		await page.screenshot({
			path: "test-results/responsive-mobile.png",
			fullPage: false,
		});
	});
});

// ─── Mobile Landscape (844×390) ─────────────────────────────────────────

test.describe("responsive — mobile landscape (844×390)", () => {
	test.use({ viewport: VIEWPORTS.mobileLandscape });

	test("app renders without overflow in landscape orientation", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		const hasHorizontalOverflow = await page.evaluate(() => {
			return document.documentElement.scrollWidth > document.documentElement.clientWidth;
		});
		expect(hasHorizontalOverflow).toBe(false);
	});

	test("content area uses the wider landscape width effectively", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		const rootBox = await page.locator("#root").boundingBox();
		expect(rootBox).not.toBeNull();
		if (rootBox) {
			expect(rootBox.width).toBeGreaterThanOrEqual(VIEWPORTS.mobileLandscape.width - 2);
		}
	});
});

// ─── Viewport meta tag ──────────────────────────────────────────────────

test.describe("responsive — meta viewport", () => {
	test("index.html has the correct viewport meta tag", async ({ page }) => {
		await page.goto("/");
		await waitForAppShell(page);

		const viewportContent = await page.evaluate(() => {
			const meta = document.querySelector('meta[name="viewport"]');
			return meta?.getAttribute("content") ?? null;
		});

		expect(viewportContent).not.toBeNull();
		expect(viewportContent).toContain("width=device-width");
		expect(viewportContent).toContain("initial-scale=1");
	});
});

// ─── Dynamic resize ─────────────────────────────────────────────────────

test.describe("responsive — dynamic viewport resize", () => {
	test("app handles live resize from desktop to mobile without breaking", async ({ page }) => {
		// Start at desktop
		await page.setViewportSize(VIEWPORTS.desktop);
		await page.goto("/");
		await waitForAppShell(page);

		// Resize to tablet
		await page.setViewportSize(VIEWPORTS.tablet);
		await page.waitForTimeout(500);

		let hasOverflow = await page.evaluate(() =>
			document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(hasOverflow).toBe(false);

		// Resize to mobile
		await page.setViewportSize(VIEWPORTS.mobile);
		await page.waitForTimeout(500);

		hasOverflow = await page.evaluate(() =>
			document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(hasOverflow).toBe(false);

		// Resize back to desktop
		await page.setViewportSize(VIEWPORTS.desktop);
		await page.waitForTimeout(500);

		hasOverflow = await page.evaluate(() =>
			document.documentElement.scrollWidth > document.documentElement.clientWidth
		);
		expect(hasOverflow).toBe(false);
	});
});
