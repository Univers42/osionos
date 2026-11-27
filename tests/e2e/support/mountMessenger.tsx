// Browser-side helper for specs: draws the messenger's rows and composers, and the AI chat thread, in a
// fixed opaque frame over the app so no stub bridge is needed. Loaded through the Vite dev server
// (page.evaluateHandle(() => import("/tests/e2e/support/mountMessenger.tsx"))).
import React from "react";
import { createRoot } from "react-dom/client";

import { ChatThread } from "@/widgets/chat-shell/ui/ChatThread";
import { ChatComposer } from "@/widgets/chat-shell/ui/ChatComposer";
import { DateDivider } from "@/widgets/channel-messages/ui/MessageDividers";
import { MessageRow } from "@/widgets/channel-messages/ui/MessageRow";
import { MessageComposer } from "@/widgets/channel-messages/ui/composer/MessageComposer";

const ME = "me";
const NOW = "2026-11-26T09:15:00.000Z";
const noop = () => undefined;

function message(id: string, patch: Record<string, unknown>) {
  return { id, channelId: "pm", authorId: "ada", authorName: "Ada Lovelace", content: id, createdAt: NOW, reactions: [], ...patch };
}

const ROWS = [
  message("First message from Ada", {}),
  message("Second message from Ada, grouped", { createdAt: "2026-11-26T09:16:00.000Z" }),
  message("An AI answer about the roadmap", { id: "ai1", authorId: "ai", authorName: "Assistant", isAi: true, aiRequestedBy: ME }),
  message("Hey @me, can you look at this?", { id: "mention1", authorId: "bob", authorName: "Bob", mentions: [ME] }),
];

function host(): HTMLDivElement {
  const el = document.createElement("div");
  el.style.cssText = "position:fixed;inset:0;z-index:2147483000;overflow:auto;background:var(--osio-bg-page)";
  document.body.appendChild(el);
  return el;
}

const Channel: React.FC = () => (
  <div data-testid="pm-channel" className="mx-auto flex max-w-4xl flex-col gap-2 p-6 text-[var(--osio-fg-default)]">
    <DateDivider label="Today" />
    {ROWS.map((row, index) => (
      <MessageRow
        key={row.id}
        message={row as never}
        grouped={index === 1}
        isAuthor={index === 0}
        canInteract
        userId={ME}
        onEdit={noop as never}
        onDelete={noop}
        onReact={noop}
        onReply={noop}
        onReport={noop}
      />
    ))}
    <div data-testid="pm-composer-full"><MessageComposer channelId="pm" workspaceId="w" channelName="general" onSend={async () => true} /></div>
    <div data-testid="pm-composer-compact" style={{ width: 360 }}><MessageComposer channelId="pm-dock" workspaceId="w" channelName="general" compact onSend={async () => true} /></div>
  </div>
);

export function mountChannel(): void {
  createRoot(host()).render(<Channel />);
}

function turn(id: string, role: "user" | "assistant", content: string, status: "done" | "streaming") {
  return { id, conversationId: "pm-conv", role, content, createdAt: NOW, status };
}

const Thread: React.FC<{ streaming: boolean }> = ({ streaming }) => (
  <div data-testid="pm-thread" className="text-[var(--osio-fg-default)]">
    <ChatThread messages={[turn("u1", "user", "Summarise the roadmap page", "done"), turn("a1", "assistant", streaming ? "Looking at the page" : "The roadmap has three milestones.", streaming ? "streaming" : "done")] as never} />
    <div className="mx-auto max-w-3xl px-6 pb-6">
      <ChatComposer value="" onChange={noop} onSubmit={noop} onConnect={noop} selection={{ connectionId: "", model: "auto" }} onSelectionChange={noop} chips={[]} onChipsChange={noop} />
    </div>
  </div>
);

export function mountThread(streaming: boolean): void {
  createRoot(host()).render(<Thread streaming={streaming} />);
}
