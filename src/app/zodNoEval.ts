import { z } from "zod";

// zod v4 probes `new Function("")` when it builds its first object schema, to decide whether to
// JIT-compile parsers. Under a CSP without 'unsafe-eval' that probe is reported as a violation on
// every boot (seen by the #314 sweep), though zod then falls back by itself. jitless skips the
// probe. It must run before any schema is built, so main.tsx imports this module first.
// Caveat: parsers stay interpreted, a few percent slower on very large payloads; unmeasured here.
z.config({ jitless: true });
