// What the viewport cuts off: each visible element whose box, once clipped by its horizontal
// scrollers, still ends past the window's right edge (#295). An element inside a scroller that
// itself fits is reachable by scrolling, so it is not reported.
//
// Caveat: rects are read once, after the surface settles, so a menu or toast that slides in later
// is not seen. An `overflow: hidden`, `clip-path` or transform clip is not treated as a clip, so
// what it hides past the edge is reported even when the user cannot tell (noisy, not dangerous).
// Elements under 1 px are skipped.

export async function clippedPastRight(page) {
  return page.evaluate(() => {
    const width = window.innerWidth;
    const clips = (style) => /(auto|scroll)/.test(style.overflowX);
    const found = [];
    for (const element of document.body.querySelectorAll("*")) {
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "contents") continue;
      let { left, right } = rect;
      for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        if (!clips(getComputedStyle(parent))) continue;
        const box = parent.getBoundingClientRect();
        left = Math.max(left, box.left);
        right = Math.min(right, box.right);
      }
      if (right - left >= 1 && right > width + 0.5) {
        const label = `${element.tagName}.${String(element.className).slice(0, 60)} right=${Math.round(rect.right)}`;
        found.push(label);
      }
    }
    return found.slice(0, 20);
  });
}

export async function pageScrollsSideways(page) {
  return page.evaluate(() => (document.scrollingElement?.scrollWidth ?? 0) > window.innerWidth);
}
