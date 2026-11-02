// Just enough of a browser for @codingame/monaco-vscode-* service overrides to load under node, so a
// test can read the service ids an override registers. Nothing renders and nothing runs: every DOM
// object is an inert stand-in, and the library's CSS modules load as nothing.
// Caveat: this proves which service ids a getServiceOverride() returns, not that the services work.
// A library update that touches a browser global at load time not stubbed here fails the import
// (loudly), never a passing assertion.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.endsWith(".css")) return { url: "data:text/javascript,export default null", shortCircuit: true };
    return nextResolve(specifier, context);
  },
});

const inert: unknown = new Proxy(function inertObject() {}, {
  get: (_target, key) => (key === Symbol.toPrimitive ? () => "" : key === "then" ? undefined : inert),
  apply: () => inert,
  construct: () => inert as object,
  has: () => true,
});

const define = (name: string, value: unknown) => {
  if (!(name in globalThis)) Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
};
const replace = (name: string, value: unknown) => {
  Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
};

define("window", globalThis);
define("self", globalThis);
for (const name of ["document", "location", "customElements", "matchMedia", "requestAnimationFrame", "MutationObserver", "ResizeObserver", "getComputedStyle", "localStorage", "sessionStorage", "screen"]) {
  define(name, inert);
}
replace("navigator", inert);
for (const name of [
  "CSSStyleSheet", "CSSFontFaceRule", "HTMLElement", "Element", "Node", "UIEvent", "KeyboardEvent", "MouseEvent", "PointerEvent",
  "DragEvent", "FocusEvent", "WheelEvent", "HTMLIFrameElement", "HTMLDivElement", "HTMLInputElement", "HTMLTextAreaElement",
  "HTMLButtonElement", "HTMLAnchorElement", "HTMLCanvasElement", "HTMLImageElement", "HTMLSelectElement", "SVGElement", "ShadowRoot",
  "DocumentFragment", "Document", "Text", "Range", "DOMRect", "IntersectionObserver", "Image", "FileReader", "Worker", "XMLHttpRequest",
  "CustomEvent", "ClipboardItem", "DataTransfer", "FontFace", "OffscreenCanvas", "ImageData", "TrustedHTML",
]) {
  define(name, class {});
}
for (const name of ["addEventListener", "removeEventListener", "dispatchEvent", "postMessage", "open", "close", "focus", "scrollTo"]) {
  define(name, () => {});
}

// The libraries open a BroadcastChannel and start idle timers at load time. Nothing here waits on
// them, and held, they would keep node's test process alive after the last test.
replace("BroadcastChannel", inert);
const realSetTimeout = globalThis.setTimeout;
const realSetInterval = globalThis.setInterval;
globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => realSetTimeout(...args).unref()) as typeof setTimeout;
globalThis.setInterval = ((...args: Parameters<typeof setInterval>) => realSetInterval(...args).unref()) as typeof setInterval;
