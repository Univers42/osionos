# Parsing other members' inline Markdown in a worker — out of scope

- Decided: 2026-11-21 · by the devil (risk magistrate), on osionos#321 (option C)
- Holds while: the engine fix for osionos#321 passes its scan-step ratio tests (IM2)

## The concept

Messages and read-only blocks parse their inline Markdown in a Web Worker, so a slow parse
never blocks the reader's main thread.

## Why not

- It needs an engine export anyway: the react entry exports `renderInlineToReact`, not
  `renderInlines`, so it costs a pin bump like the root-cause fix does.
- Every message and block would render asynchronously, with a plain-text flash on hot paths.
- The CPU still burns until the queue's 3 s kill (`previewParseQueue.ts`); it moves the cost,
  it does not remove it.

## Reopen when

A quadratic inline shape is found that cannot be made linear inside one matcher (the
`tests/inline-linear-steps.test.cjs` ratio fails and no matcher fix holds).
