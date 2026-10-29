# SB-4j — `field` displays `image` and `file`: avatar, banner and import through the same pipelines (self-built UI, phase S4b)

Project: rebuild every settings section from the app's own blocks (design: `docs/superpowers/specs/2026-10-25-self-built-ui-design.md` §6 "avatar and banner upload with crop" and "import dropzone"). Three settings controls read a local file: the avatar (`ImageAvatarUpload.tsx`, a centre-square crop into three WebP sizes), the banner (`BannerUpload.tsx`, a 3:1 crop, plus Remove), and the import drop zone (`ImportPanel.tsx`). Reading a file and drawing on a canvas are browser work, so they stay in the kernel: this package moves each pipeline into a plain function the component and a record source both call, and adds the two `field` displays SB-2c left as "Not available yet".

Base: the integration tip with SB-2c and SB-3b merged (the field block, the action runner and the button that runs it).

## What exists (read these first)

- **Pipelines:**
  - `src/features/settings/profile/ImageAvatarUpload.tsx:59-80` (`createImageBitmap` → `buildAvatarVariants` + `drawSquare` → `POST /api/profile/avatar` → `onUploaded(avatar)`), copy "Upload photo", "Uploading…", "Saved ✓", "Upload failed";
  - `BannerUpload.tsx` (`drawBanner`, `bannerCropRect`, `buildBannerPayload`, `POST /api/profile/banner`, `DELETE /api/profile/banner`, `safeSource`), copy "Upload banner", "Uploading…", the toasts "Banner saved", "The banner could not be uploaded. Try a smaller image.", "Banner removed", "The banner could not be removed. Try again.", and the confirm "Remove your banner?";
  - `ImportPanel.tsx` `importFiles` and the drop zone markup.
- **Their callers:** `PublicProfileSection.tsx:66` and `:144`; `sectionPanels.tsx` (import).
- **Their tests:** `rg -l "Upload photo|Upload banner|Import your content" tests/e2e` (run that and list them in the report). They stay green unchanged.
- **Bindings:** `RecordSource`, `FieldSpec` (`display` already lists `image` and `file`), `useBoundField` (`src/entities/block/model/bindingSources.ts`); SB-2c's `FieldBlock` and its `controlFor(spec, override)`.
- **Actions:** `APP_ACTIONS`, `ActionDefinition` (SB-3a).

**OWNS:**
- `src/features/settings/profile/profileMedia.ts` (new): `uploadAvatar`, `uploadBanner`, `removeBanner` — each the component's network and canvas body with no React state and no toast;
- `ImageAvatarUpload.tsx`, `BannerUpload.tsx` (modified): call those functions; markup, copy and toasts unchanged;
- `src/features/settings/import/importFiles.ts` (new): `importSettingsFiles(ctx, files)`, moved out of `ImportPanel.tsx`, which then calls it;
- `bindingSources.ts` (modified): `FieldSpec.accept?`, `FieldSpec.multiple?`, `FieldSpec.uploadCopy?`, and `RecordSource.upload?` (Interfaces). Nothing else;
- `src/features/bindings/sources/profileMedia.ts` and `sources/import.ts` (new) + their registration;
- `src/entities/block/ui/blocks/field/ImageDisplay.tsx` and `FileDisplay.tsx` (new), wired into `FieldBlock`'s display map in place of the "Not available yet" note; `field.preview?: "banner"` in the field block data;
- `actionRegistry.ts` (modified): `profile.banner.remove`;
- tests: `tests/canvas/file-fields.test.ts`, `tests/e2e/functional/fileFields.spec.mjs` (new).

**MUST NOT TOUCH:** `avatarVariants.ts`, `bannerVariant.ts` (call them), the bridge, the existing upload and import e2e.

**Commit message:** `feat(blocks): image and file fields upload through the settings pipelines`

## Interfaces

```ts
// bindingSources.ts additions
interface FieldSpec {
  …;
  accept?: string;                 // the input's accept list, from the source, never from the page
  multiple?: boolean;
  uploadCopy?: { idle: string; busy: string; done?: string; error?: string; note?: string };
}
interface RecordSource {
  …;
  upload?(field: string, files: readonly File[]): Promise<{ ok: true } | { ok: false; error: string }>;
}

// profileMedia.ts
function uploadAvatar(file: File): Promise<{ ok: true; avatar: string } | { ok: false }>;
function uploadBanner(file: File): Promise<{ ok: true } | { ok: false }>;
function removeBanner(): Promise<{ ok: true } | { ok: false }>;
// import/importFiles.ts
function importSettingsFiles(ctx: { workspaceId: string; activeUserId: string; jwt: string | null }, files: readonly File[]): Promise<void>;
```

## Rules (each one is tested)

1. **One pipeline each.** The component and the source call the same function. Spy tests: `ImageAvatarUpload`'s handler and `settings:profile-media` › `avatar` upload both call `uploadAvatar` once with the same `File`; the same for the banner and for `importSettingsFiles`. No `createImageBitmap`, `canvas` or `/api/profile/*` call remains in the two components.
2. **Sources.**
   - `settings:profile-media`: `avatar` (display `image`, value = the profile's avatar URL, `accept` `image/png,image/jpeg,image/webp,image/gif`, `uploadCopy` = the avatar's four strings) and `banner` (display `image`, value = `bannerUrl`, the same `accept`, `uploadCopy` `{ idle: "Upload banner", busy: "Uploading…" }`). After a successful upload it calls the hydrate the component's caller calls today (`onChanged` / `hydrate`). The banner's toasts are the component's, raised by the source.
   - `settings:import`: `files` (display `file`, `multiple: true`, `uploadCopy` `{ idle: <today's button text>, busy: "Importing…", note: "ZIP files can be a maximum of 5GB" }`, label "Import your content to osionos", helper the zone's description line), uploading through `importSettingsFiles` with the signed-in context. No user → `"unavailable"`.
3. **The `image` display** renders a hidden `<input type="file">` with the spec's `accept` and an `aria-label` = the spec's label, and a `Button` showing `uploadCopy.idle` / `busy`. While `upload` is pending the button is `disabled` and shows `busy`. After it resolves: `done` (if set) or nothing, and `error` (if set, `role="alert"`) on failure. With `field.preview: "banner"`, a 3:1 box above it shows the value through the banner's `safeSource` rule (a non-`https:`/non-same-origin URL shows the empty box). The page cannot widen `accept`: no block field sets it.
4. **The `file` display** is the import zone: one `<button>` with today's look (dashed border, `--osio-bg-subtle`, the upload icon, the label as its heading, the helper and `note` lines), a hidden multiple file input, and drop support (`dragover` prevents default; `drop` passes `dataTransfer.files`). It is keyboard-operable (Enter/Space opens the picker) and its accessible name is the label.
5. **Preview mode** (SB-6a) renders both displays disabled and never calls `upload`. Not signed in → the source is `"unavailable"` and the display shows the muted placeholder.
6. **Remove banner** is an action: `profile.banner.remove`, `confirm: "simple"` with `confirmText` = today's title "Remove your banner?", message "Your profile page goes back to having no banner. You can upload a new one any time." and label "Remove banner"; `destructive: true`; run = `removeBanner()` then the same toast and hydrate. Spy test: one `removeBanner` call after confirm, none after cancel.

## Steps

- [ ] **Step 1: Failing tests.**
  - Canvas: Rule 1's spies (the pipelines get a fake `createImageBitmap`/canvas through their existing seams, or the spies sit one level up on `uploadAvatar`/`uploadBanner`/`importSettingsFiles`); the sources' field specs (labels, accept, copy) character for character; Rule 6's action.
  - e2e (offline, signed-in user, the bridge stub where the upload e2e already uses it): a page with an `image` field bound to `settings:profile-media` › `avatar`: picking a PNG (`setInputFiles`) posts once to `/api/profile/avatar` and shows "Saved ✓"; a 500 shows "Upload failed". A `banner` field with `preview: "banner"` shows the preview after upload. A `file` field bound to `settings:import` › `files`: dropping a `.md` file creates a page (the same route the import e2e checks). Remove banner asks first. At 375 px no horizontal scroll.
- [ ] **Step 2: Run them and see them fail.**
- [ ] **Step 3: Implement.** Extract the pipelines first and run the existing upload and import e2e before going on.
- [ ] **Step 4: Mutants** (scratch copies under `target/mutants`, never committed). Paste the failing test name for each:
  - (a) the image display reads `accept` from block data;
  - (b) the source's avatar upload posts on its own instead of calling `uploadAvatar`;
  - (c) preview mode uploads.
- [ ] **Step 5: Gates.** `npm run test:canvas` rc 0; `npm run test:quality` rc 0; the existing upload and import e2e unchanged and green (name them); `ANALYZE=1 npm run build`: the two displays are not in the warm chunk. Report each.
- [ ] **Step 6: Commit** with the message above. No trailer, no push.

## Report

A status block (status/gates/changed/deviations), the e2e files you ran unchanged, the mutant results and the SHA. A gate you could not run is SKIPPED with the reason.
