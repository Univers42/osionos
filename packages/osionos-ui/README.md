# @osionos/ui

A React component kit: atoms, primitives, molecules and hooks. No runtime
dependencies — every library it touches is a peer, and most are optional.

## The token contract

The kit ships **no CSS file that it forces on you**. Every component styles
itself through `--osio-*` custom properties that the *host* defines, so one kit
renders correctly in a light theme, a dark theme, and seven palettes without a
single `if (theme === …)` in component code.

That makes the token set a real dependency, and an invisible one — so it is
declared, not assumed:

- **`tokens.css`** lists all 58 properties the kit reads, with reference light
  values. Import it to get a working look out of the box, or ignore it and
  define the tokens yourself.
- **`scripts/check-token-contract.mjs`** fails the build if a component starts
  reading a token that is not declared, *or* if a declared token stops being
  used. The contract cannot drift from the code.

A host that defines the tokens itself should also check the other direction —
that it actually satisfies the contract. Renaming a token in the host silently
falls back to the CSS initial value otherwise; nothing throws.

```ts
import '@osionos/ui/tokens.css';   // optional: only if you want the defaults
import { Button, Modal, useToastStore } from '@osionos/ui';
```

## Code-splitting

Deep subpaths are exported, so a heavy component stays out of your warm chunk:

```ts
// pulls mermaid only when this chunk loads
const Diagram = lazy(() => import('@osionos/ui/molecules/MermaidDiagram'));
```

`MermaidDiagram` (mermaid), `CodeSyntaxHighlight` (highlight.js) and the icon
catalogs (~2.8k generated lines) all load lazily at runtime.

## Layout

```
src/atoms/        Button, Badge, Card, Input, IconButton, IconValueView, …
src/primitives/   Modal, Menu, Popover, Dropdown, Toggle, MiniTabs, toasts
src/molecules/    IconPicker, EmojiPicker, MermaidDiagram, ConfirmDialog, …
src/hooks/        useClickOutside, useEscapeKey, viewport positioning
src/shared/       cx, icon-value parse/serialize, emoji skin tones (pure)
tokens.css        the token contract
```

`src/shared/` is the pure layer — no React, no DOM — and is where the unit tests
live. Icon values are **persisted strings**, so `parseIconValue` /
`serializeIconValue` are covered as a round-trip: an asymmetry there corrupts
saved documents rather than merely misrendering one.

## Peers

Required: `react`, `react-dom`, `zustand`, `lucide-react`,
`@univers42/ui-collection`. Optional (only if you use the component that needs
it): `mermaid`, `highlight.js`, `@tanstack/react-virtual`.

## Development

```sh
make check      # typecheck + tests + token contract
```
