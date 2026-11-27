// The shared pieces of the messenger + AI chat restyle: one composer card, one set of typing dots, one
// assistant avatar, worn by both surfaces. A static render pins their roles and labels.
import assert from "node:assert/strict";
import test from "node:test";

const React = (await import("react")).default;
const { renderToStaticMarkup } = await import("react-dom/server");
const { ComposerCard, COMPOSER_SEND_CLASS } = await import("../../src/shared/ui/composer/ComposerCard.tsx");
const { TypingDots } = await import("../../src/shared/ui/typing/TypingDots.tsx");
const { AssistantAvatar } = await import("../../src/shared/ui/mascot/AssistantAvatar.tsx");
const { MessageComposer } = await import("../../src/widgets/channel-messages/ui/composer/MessageComposer.tsx");
const { ComposerSendStop } = await import("../../src/widgets/chat-shell/ui/ComposerSendStop.tsx");

const render = (node: React.ReactElement): string => renderToStaticMarkup(node);

test("ComposerCard is a 16px-radius card on the overlay tokens and passes its props through", () => {
  const html = render(React.createElement(ComposerCard, { "data-dictation-composer": "x", className: "extra" }, "hi"));
  assert.match(html, /data-dictation-composer="x"/);
  assert.match(html, /rounded-\[calc\(16px\*var\(--osio-radius-scale,1\)\)\]/);
  assert.match(html, /--osio-menu-shadow/);
  assert.match(html, /--osio-overlay-border/);
  assert.match(html, /focus-within:ring-2/);
  assert.match(html, /extra/);
});

test("the send class is round and has a muted disabled state", () => {
  assert.match(COMPOSER_SEND_CLASS, /rounded-full/);
  assert.match(COMPOSER_SEND_CLASS, /disabled:bg-\[var\(--osio-bg-muted\)\]/);
});

test("TypingDots draws three decorative dots", () => {
  const html = render(React.createElement(TypingDots));
  assert.equal((html.match(/collab-typing-dot/g) ?? []).length, 3);
  assert.match(html, /aria-hidden="true"/);
});

test("AssistantAvatar is decorative and sized", () => {
  const html = render(React.createElement(AssistantAvatar, { size: 36 }));
  assert.match(html, /data-testid="assistant-avatar"/);
  assert.match(html, /aria-hidden="true"/);
  assert.match(html, /width:36px/);
});

test("the AI composer's send button is labelled and disabled when empty; Stop replaces it while streaming", () => {
  const idle = render(React.createElement(ComposerSendStop, { canSend: false, onSend: () => undefined }));
  assert.match(idle, /aria-label="Send message"/);
  assert.match(idle, /disabled=""/);
  assert.match(idle, /rounded-full/);
  const busy = render(React.createElement(ComposerSendStop, { streaming: true, canSend: true, onSend: () => undefined }));
  assert.match(busy, /aria-label="Stop the answer"/);
});

for (const compact of [false, true]) {
  test(`MessageComposer (${compact ? "compact dock" : "full"}) still renders the composer card with a round send`, () => {
    const html = render(React.createElement(MessageComposer, { channelId: "c1", workspaceId: "w1", compact, onSend: async () => true }));
    assert.match(html, /data-dictation-composer="channel"/);
    assert.match(html, /aria-label="Send message"/);
    assert.match(html, /rounded-\[calc\(16px\*var\(--osio-radius-scale,1\)\)\]/);
    assert.doesNotMatch(html, /border-t /);
    assert.match(html, /rounded-full/);
    assert.equal(/max-w-4xl/.test(html), !compact);
  });
}
