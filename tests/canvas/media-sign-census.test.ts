/**
 * osionos#233 D233-7: the census of every place the app reads a bridge upload, as a checked list.
 * A row is resolved (the symbol each file must use and the test that proves it), pending (the issue
 * that owns it) or not an upload (why). The test fails when a file starts drawing media without a
 * row, when a resolved file stops using its signer, or when a cited test is renamed away.
 *
 * Caveat: the scan is a grep for render primitives (<img, <video, <audio, <source, backgroundImage,
 * new Image()). It misses a site that builds a media URL another way (a template string handed to a
 * third-party component, a fetch(url), a worker); those rows (image actions, AI) are kept by hand.
 */

import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

type Row =
  | { site: string; files: string[]; status: "resolved"; uses: string; proof: [testFile: string, title: string] }
  | { site: string; files: string[]; status: "pending"; issue: string }
  | { site: string; files: string[]; status: "not-upload"; why: string };

const KIT = "src/shared/notion-database-sys/src/";
const RENDERS = "tests/canvas/media-render-sites.test.ts";
const SUBMODULE_FOLLOW_UP = "osionos#233 submodule follow-up (resolver seam in HostAdapters + pin bump; D233-15 before enforce)";

const MEDIA_CENSUS: Row[] = [
  { site: "Image/video/audio/file block", status: "resolved", uses: "useSignedMediaUrl",
    files: ["src/entities/block/ui/MediaBlockPreview.tsx", "src/entities/block/ui/DirectMediaPlayers.tsx"],
    proof: [RENDERS, "media blocks draw the signed link: image src, video source and poster, audio source, file href"] },
  { site: "Fullscreen image, page cover and its picker, profile Shared grid", status: "resolved", uses: "useSignedMediaUrl",
    files: ["src/features/block-editor/ui/media/ImageFullscreen.tsx", "src/entities/page/ui/CoverMediaElement.tsx",
      "src/entities/page/ui/coverPickerTiles.tsx", "src/widgets/profile-page/ProfileSharedPosts.tsx"],
    proof: [RENDERS, "the full-screen picture, the page cover (image and video), a cover tile and a shared post draw the signed link"] },
  { site: "Image actions (open, download, copy image, copy link)", status: "resolved", uses: "currentMediaUrl",
    files: ["src/features/block-editor/ui/media/useImageBlockActions.ts"],
    proof: [RENDERS, "image actions open, download and copy the signed picture; the copied link stays the stored one"] },
  { site: "Home gallery cards (recents, templates)", status: "resolved", uses: "signCardCovers",
    files: ["src/widgets/database-view/model/homeLiveEntries.ts", "src/widgets/database-view/model/recentsDatabaseState.ts",
      "src/widgets/database-view/model/templatesDatabaseState.ts"],
    proof: [RENDERS, "home galleries (recents, templates) get their card covers signed with the card's page as authority"] },
  { site: "A page's foreign uploads use the page as authority", status: "resolved", uses: "MediaPageContext",
    files: ["src/pages/notion-page/ui/NotionPage.tsx"],
    proof: ["tests/canvas/media-signed-url.test.ts", "the page context gives a foreign upload its authority"] },
  { site: "Issues panel screenshot (signed in the issues GET answer, D233-8)", status: "resolved", uses: "issueScreenshotSrc",
    files: ["src/features/issues/ui/IssuesPanel.tsx"],
    proof: ["tests/canvas/issues-screenshot-src.test.ts", "the signed link wins when the bridge sent one"] },
  { site: "Exports: HTML, Markdown (D233-9)", status: "pending", issue: "osionos#233 D233-9 (this branch)",
    files: ["src/features/page-export/model/exportHtml.ts", "src/services/page-actions/pageMarkdownEscape.ts",
      "src/services/page-actions/pageMarkdownSerialize.ts"] },
  { site: "DB views: gallery, board, feed, media block, file cells, markdown renderers", status: "pending", issue: SUBMODULE_FOLLOW_UP,
    files: [`${KIT}components/views/gallery/GalleryView.tsx`, `${KIT}components/views/board/BoardCardHelpers.tsx`,
      `${KIT}components/views/feed/FeedView.tsx`, `${KIT}components/views/feed/FeedReaderOverlay.tsx`,
      `${KIT}components/blocks/MediaBlock.tsx`, `${KIT}components/views/table/cellRenderers/SpecialCellRenderers.tsx`,
      `${KIT}components/cellEditors/FilePreviewModal.tsx`, `${KIT}components/cellEditors/FilesCellEditor.tsx`,
      `${KIT}lib/markdown/renderers/html.ts`, `${KIT}lib/markdown/shortcuts.ts`] },
  { site: "AI Describe image, Ask AI on an image (service reads with the caller's token)", status: "pending", issue: "osionos#233 D233-16",
    files: ["src/features/block-editor/ui/media/useDescribeImage.ts"] },
  { site: "Block background picture (ADR 0069, no caller yet): must use useSignedMediaUrl", status: "pending", issue: "osionos#233 D233-7 (ADR 0069)",
    files: ["src/shared/lib/media/imageSource.ts"] },
  { site: "Avatars and banners", status: "not-upload", why: "/api/media/avatars: a separate route that enforce leaves public",
    files: ["src/features/collab/ui/CollabAvatar.tsx", "src/features/collab/ui/SummonPrompt.tsx", "src/features/connections/RequestsInbox.tsx",
      "src/features/settings/people/PeoplePeek.tsx", "src/features/settings/profile/BannerUpload.tsx", "src/widgets/profile-page/ProfileShell.tsx",
      "src/widgets/channel-messages/ui/MessageRow.tsx", "src/widgets/channel-messages/ui/composer/MentionAutocomplete.tsx",
      "src/widgets/contact-dock/ui/DockContactRow.tsx", "src/widgets/messages-view/ui/ConversationList.tsx",
      "src/widgets/messages-view/ui/contact-info/ContactInfoPanel.tsx", "src/widgets/notifications/ui/NotificationsPanel.tsx",
      "src/widgets/people-search/PeopleSearchBar.tsx", `${KIT}components/views/feed/FeedCommentItem.tsx`,
      `${KIT}components/views/feed/FeedShareMenu.tsx`] },
  { site: "Channel attachments", status: "not-upload", why: "/api/chat/uploads through a Bearer fetch to an object URL, a different route",
    files: ["src/widgets/channel-messages/ui/attachments/MediaLightbox.tsx", "src/widgets/channel-messages/ui/attachments/WaveformPlayer.tsx",
      "src/widgets/channel-messages/ui/attachments/useAuthedObjectUrl.ts", "src/widgets/channel-messages/ui/composer/VoicePreview.tsx",
      "src/widgets/messages-view/ui/contact-info/MediaGallery.tsx"] },
  { site: "Embeds and provider media", status: "not-upload", why: "third-party hosts (providers, Giphy, Unsplash search, favicons)",
    files: ["src/entities/block/model/mediaProviderLinks.ts", "src/entities/block/ui/ProviderMediaEmbed.tsx",
      "src/features/block-editor/ui/MediaEmbedDialog.tsx", "src/widgets/channel-messages/ui/composer/GifPicker.tsx",
      "src/shared/lib/embed/embedUrlGuard.ts", "src/shared/ui/embed/EmbedView.tsx", "src/shared/ui/embed/Favicon.tsx",
      "src/shared/ui/embed/LinkCard.tsx", "src/shared/ui/embed/PlayerFacade.tsx", "src/shared/ui/embed/model/chooseEmbedView.ts"] },
  { site: "Local bytes", status: "not-upload", why: "a data URL, an object URL before upload, or a MediaStream",
    files: ["src/features/issues/ui/ReportIssueDialog.tsx", "src/features/settings/library/LibraryPanel.tsx",
      "src/features/settings/profile/TwoFactorModal.tsx", "src/widgets/video-room/ParticipantTile.tsx",
      "src/features/block-editor/model/inlineIconInsert.ts", `${KIT}lib/chart/export/chartImageExport.ts`] },
  { site: "Primitive named in a comment or a sanitizer only", status: "not-upload", why: "draws nothing",
    files: ["src/app/styles/global.css", "src/entities/page/ui/coverMedia.ts", "src/entities/page/ui/useCoverReposition.ts",
      "src/features/ai/model/deviceInferencePort.ts", "src/features/chat/model/assistantMarkdown.ts",
      "src/features/chat/model/researchParts.ts", "src/features/chat/model/approvalCard.ts", "src/features/chat/model/toolActivityLine.ts",
      "src/features/collab/api/realtimeTransportGrobase.adapter.ts", "src/features/ide/model/previewDocument.ts",
      "src/features/page-file/model/blockOverlay.ts", "src/shared/lib/media/bridgeMediaUrl.ts",
      "src/widgets/database-view/model/sysDatabaseState.ts", "src/widgets/database-view/model/sysDatabaseViews.ts",
      `${KIT}components/blocks/CodeBlock.tsx`] },
];

const PRIMITIVE = /<img|<video|<audio|<source|backgroundImage|new Image\(\)/;
const SOURCE = /\.(tsx?|css)$/;
const SKIP = /(^|\/)(node_modules|dist|playground|__tests__|tests?)(\/|$)|\.test\.tsx?$/;

function drawingFiles(root: string): string[] {
  return readdirSync(root, { recursive: true, encoding: "utf8" })
    .map((name) => join(root, name))
    .filter((path) => SOURCE.test(path) && !SKIP.test(path) && PRIMITIVE.test(readFileSync(path, "utf8")));
}

const listed = new Set(MEDIA_CENSUS.flatMap((row) => row.files));

test("every file that draws media has a census row", () => {
  const unlisted = [...drawingFiles("src"), ...drawingFiles(`${KIT}`)].filter((path) => !listed.has(path));
  assert.deepEqual([...new Set(unlisted)].sort(), []);
});

test("every census file exists, and no file is in two rows", () => {
  const all = MEDIA_CENSUS.flatMap((row) => row.files);
  assert.deepEqual(all.filter((path) => !existsSync(path)), []);
  assert.equal(listed.size, all.length);
});

test("a resolved file uses its signer, and its proof is a test that exists", () => {
  for (const row of MEDIA_CENSUS) {
    if (row.status !== "resolved") continue;
    for (const path of row.files) assert.ok(readFileSync(path, "utf8").includes(row.uses), `${path} must use ${row.uses}`);
    const [testFile, title] = row.proof;
    assert.ok(readFileSync(testFile, "utf8").includes(`test(${JSON.stringify(title)}`), `${row.site}: ${testFile} lacks "${title}"`);
  }
});

test("a pending row names the issue that owns it", () => {
  for (const row of MEDIA_CENSUS) if (row.status === "pending") assert.match(row.issue, /osionos#\d+/);
});
