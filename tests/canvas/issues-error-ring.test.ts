import assert from "node:assert/strict";
import test from "node:test";

import { startErrorRing, stopErrorRing, recentErrors, isErrorRingDeveloper } from "@/features/issues/model/errorRing";

function shimWindow() {
  const listeners: Record<string, Array<(event: any) => void>> = {};
  const windowObject = {
    addEventListener(type: string, cb: (event: any) => void) {
      listeners[type] = listeners[type] || [];
      listeners[type].push(cb);
    },
    removeEventListener(type: string, cb: (event: any) => void) {
      listeners[type] = (listeners[type] || []).filter((item) => item !== cb);
    },
    dispatchEvent(event: any) {
      (listeners[event.type] || []).forEach((cb) => cb(event));
      return true;
    },
  };
  (globalThis as any).window = windowObject;
  if (!(globalThis as any).ErrorEvent) {
    (globalThis as any).ErrorEvent = class ErrorEvent {
      type: string;
      message: string;
      error: unknown;
      constructor(type: string, init: any = {}) {
        this.type = type;
        this.message = init?.message ?? "";
        this.error = init?.error;
      }
    };
  }
  if (!(globalThis as any).PromiseRejectionEvent) {
    (globalThis as any).PromiseRejectionEvent = class PromiseRejectionEvent {
      type: string;
      reason: unknown;
      constructor(type: string, init: any = {}) {
        this.type = type;
        this.reason = init?.reason;
      }
    };
  }
  return windowObject;
}

test("error ring keeps the last 20 of 25 errors", () => {
  const windowObject = shimWindow();
  stopErrorRing();
  startErrorRing();
  for (let i = 0; i < 25; i += 1) {
    windowObject.dispatchEvent(new (globalThis as any).ErrorEvent("error", { message: `msg-${i}` }));
  }
  const errors = recentErrors();
  assert.equal(errors.length, 20);
  assert.equal(errors[0], "msg-5");
  assert.equal(errors[19], "msg-24");
  stopErrorRing();
});

test("error ring cuts a 900-char message to 500", () => {
  const windowObject = shimWindow();
  stopErrorRing();
  startErrorRing();
  windowObject.dispatchEvent(new (globalThis as any).ErrorEvent("error", { message: "a".repeat(900) }));
  assert.equal(recentErrors()[0].length, 500);
  stopErrorRing();
});

test("error ring redacts a JWT", () => {
  const windowObject = shimWindow();
  stopErrorRing();
  startErrorRing();
  windowObject.dispatchEvent(new (globalThis as any).ErrorEvent("error", { message: "tok eyJaaa.bbb.ccc end" }));
  assert.match(recentErrors()[0], /\[jwt\]/);
  stopErrorRing();
});

test("error ring starts for a moderator but not a plain user", () => {
  assert.equal(isErrorRingDeveloper("user", false), false);
  assert.equal(isErrorRingDeveloper("moderator", false), true);
});
