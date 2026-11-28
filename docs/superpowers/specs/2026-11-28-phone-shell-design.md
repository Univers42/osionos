# Phone shell and phone speed — design

Date: 2026-11-28 · Status: approved by the owner ("the best plan … put this into the live app")

## Why
On a phone the app is the desktop IDE shrunk to 390 px: rail, menubar, tabs, split panes, status
bar, dock. It reads as a desktop app in a small window, and it is slow: at 4x CPU throttle in an
Android emulator the home screen ships 5.2 MB of JS in 142 files, LCP 1.8 s, 642 ms of long
tasks (worst 341 ms); the login screen alone ships 2.9 MB.

## Goals
- A phone layout built the way professional phone apps are: bottom tab bar, full-screen stacked
  pages with a back arrow, bottom sheets instead of dropdowns, one floating "+" to create.
- The phone never mounts or downloads desktop shell code.
- Targets at 4x throttle (emulator `osio-phone`, `emu-profile.mjs`): home LCP < 1 s, no long
  task > 100 ms, home JS < 1.5 MB; login JS < 800 KB.

## Non-goals / anti-goals
- No change to desktop (fine pointer, ≥ 768 px): same look, same behaviour, same tests green.
- No native app, no router library, no new UI dependency.
- Not a fork of page content: pages, databases and overlays are the same components.

## Approaches
- **A. Phone-native shell (picked).** `App` branches on `PHONE_QUERY`; the phone branch renders
  `PhoneShell` (lazy chunk) that reuses `PaneContent` and the ShellHosts overlays. Desktop chrome
  is a separate lazy chunk the phone never requests. Cost: a second shell to keep, but it is thin.
- B. Restyle the desktop shell with media queries. Cheapest, but the phone still downloads and
  runs every desktop panel and keeps desktop navigation (tabs, splits) — the thing that feels wrong.
- C. Separate phone build/entry. Fastest download, but two entry points and two deploys to keep.

## Design
- **Tabs (bottom bar, 56 px + safe-area):** Home (page tree), Search, Inbox, Agent. Active tab
  keeps its own stack.
- **Stack:** opening a page pushes a full-screen view with a top bar (back arrow, title, "⋯").
  Back uses `history.pushState`/`popstate` so the Android back button and swipe work; the desktop
  keeps `replaceState` (`useNavHistory.ts`).
- **Sheets:** menus that are dropdowns on desktop open as a bottom sheet on the phone (drag handle,
  scrim, focus trap, Escape/back closes, reduced motion respected).
- **FAB "+":** creates a page in the current space and opens it.
- **Never on phone:** rail, menubar, status bar, workspace tabs, split/pane controls, dock,
  terminals, MachineWindowHost, `useSandboxHealthProbe`, `useIdeFsSync`, `usePageFileWriter`,
  machine refresh.
- **Speed:** login renders from a chunk that imports no page, database, seed or workbench code;
  `DatabaseBlock`, icon data and emoji data load on first use; every touch target is 44 px.

## Increments (each: gates → develop/beta → emulator check → main/live)
1. Speed: login-only bundle; lazy DatabaseBlock, icon and emoji data.
2. Phone shell scaffold: tab bar, stacked pages, pushState back.
3. Bottom sheets and the "+" FAB.
4. Phone never loads desktop chunks (verified by request log).
5. Remaining 44 px and phone items (#211).

## Left to the builder
Chunk boundaries, component names inside `widgets/phone-shell`, sheet animation details.
