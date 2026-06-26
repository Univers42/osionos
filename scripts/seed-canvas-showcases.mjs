/* ************************************************************************** */
/*  seed-canvas-showcases.mjs                                                 */
/*  Builds four ORIGINAL live-data showcase dashboards on the redesigned      */
/*  Canvas V2 and emits idempotent SQL for osionos_pages. Dep-free (Node      */
/*  built-ins only). Run:                                                     */
/*    docker run --rm -v "$PWD/scripts:/s:ro" node:22-alpine \                */
/*      node /s/seed-canvas-showcases.mjs | docker exec -i mini-baas-postgres \*/
/*      psql -U postgres -d postgres -v ON_ERROR_STOP=1 -f -                  */
/*                                                                            */
/*  Bound to the live-demo mounts of workspace 0ea96910 (dev.pro.photo owns   */
/*  it): Commerce·Postgres / Ops·MySQL / Activity·Mongo. Each board mixes     */
/*  server-AGGREGATED chart/KPI cells (fast — totals computed at the source,  */
/*  not in the browser), markengine-authored editorial cells, a cross-engine  */
/*  relationship graph cell, and at most one op=list feed — a designed        */
/*  composition. The originality is the cross-engine canvas layout.           */
/* ************************************************************************** */

const WS = "0ea96910-277a-49d6-901c-524b147cc009";
const OWNER = "5cc30a3f-87e4-471d-b795-c936723081ee";
const COMMERCE = "59939f19-7e8d-4876-a57f-61b3e7bb37be";
const OPS = "028b32b2-78f2-405f-81e3-fa690c4649dc";
const ACTIVITY = "42c85133-c805-40c5-a260-04251834a337";

let seq = 0;
const bid = (p) => `${p}-${(seq += 1)}`;
const src = (db, table) => `baas:${db}:${table}`;

/** A canvas cell embedding a live database view (chart/KPI/feed/board). */
function dbCell(opts) {
  const databaseId = src(opts.db, opts.table);
  return {
    id: bid("cell"),
    colStart: opts.x, colSpan: opts.w, rowStart: opts.y, rowSpan: opts.h,
    label: opts.label,
    sizing: "fixed", padding: "comfortable",
    blocks: [{ id: bid("db"), type: "database_inline", content: "", databaseId, viewId: opts.view ? `${databaseId}#${opts.view}` : undefined }],
  };
}

/** A canvas cell hosting the cross-engine relationship graph. The graph_view
 *  block self-fetches /api/graph/data for the active workspace (notes ⊕ records
 *  ⊕ edges) — no databaseId/viewId binding. Defer-mounts like a database cell. */
function graphCell(opts) {
  return {
    id: bid("cell"),
    colStart: opts.x, colSpan: opts.w, rowStart: opts.y, rowSpan: opts.h,
    label: opts.label, sizing: "fixed", padding: "comfortable",
    blocks: [{ id: bid("g"), type: "graph_view", content: "" }],
  };
}

/** A markengine-authored editorial / narrative tile. Emits exactly the block
 *  shapes parseMarkdownToBlocks produces (heading_2 + paragraph with inline
 *  markdown + callout keyed by kind + bulleted_list), so the seeded render is
 *  byte-identical to pasting the same markdown into a focused cell in-app. */
function richCell(opts) {
  const blocks = [];
  if (opts.heading) blocks.push({ id: bid("h"), type: "heading_2", content: opts.heading });
  if (opts.lead) blocks.push({ id: bid("p"), type: "paragraph", content: opts.lead });
  if (opts.callout) blocks.push({ id: bid("c"), type: "callout", content: opts.callout.text, color: opts.callout.kind });
  for (const item of opts.bullets ?? []) blocks.push({ id: bid("li"), type: "bulleted_list", content: item });
  return {
    id: bid("cell"),
    colStart: opts.x, colSpan: opts.w, rowStart: opts.y, rowSpan: opts.h,
    label: opts.label, tint: opts.tint, sizing: "fixed", padding: "comfortable",
    blocks,
  };
}

function layoutBlock(cells, rows = 4) {
  return {
    id: bid("layout"), type: "layout", content: "", layoutMode: "inline",
    layoutConfig: { columns: 12, rows, rowHeight: 168, gap: 16, columnGap: 16, rowGap: 16, snapToGrid: true, autoArrange: false, preview: false, guideVisibility: "auto" },
    layoutCells: cells,
  };
}

function page(id, title, icon, intro, cells, rows) {
  return {
    id, workspace_id: WS, owner_id: OWNER, title, icon, surface: "page", visibility: "private",
    content: [
      { id: bid("h1"), type: "heading_1", content: title },
      { id: bid("intro"), type: "paragraph", content: intro },
      { id: bid("div"), type: "divider", content: "" },
      layoutBlock(cells, rows),
    ],
  };
}

// Clean 12-col tiling, no overlaps. Every figure cell is a server-AGGREGATED
// chart/KPI (fast); each board carries at most ONE op=list feed so initial load
// stays quick. The graph cell self-fetches and defer-mounts.
const boards = [
  page("d5b1c0a0-0000-4a00-a000-000000000001", "Commerce Command Center", "icon:line-chart",
    "Live PostgreSQL commerce — 25k orders, 74k line items, real inventory. Grand totals computed in the engine, fulfilment funnel, and the category leaderboard on one board.", [
      richCell({ x: 1, w: 3, y: 1, h: 2, label: "insight", tint: "orange",
        heading: "Where the money concentrates",
        lead: "Revenue is **not** spread evenly — a handful of *paid* statuses carry the store.",
        callout: { kind: "tip", text: "Watch the gap between `pending` and `fulfilled` — that's cash waiting to land." },
        bullets: ["Totals aggregated in Postgres, not the browser", "25,000 orders · 74,822 line items"] }),
      dbCell({ db: COMMERCE, table: "orders", view: "commerce-kpi-revenue", label: "Total revenue", x: 4, w: 3, y: 1, h: 1 }),
      dbCell({ db: COMMERCE, table: "orders", view: "commerce-kpi-orders", label: "Orders", x: 4, w: 3, y: 2, h: 1 }),
      dbCell({ db: COMMERCE, table: "orders", view: "commerce-revenue", label: "Revenue by status", x: 7, w: 6, y: 1, h: 2 }),
      dbCell({ db: COMMERCE, table: "orders", view: "commerce-funnel", label: "Order funnel", x: 1, w: 6, y: 3, h: 2 }),
      dbCell({ db: COMMERCE, table: "products", view: "commerce-leaderboard", label: "Top categories by value", x: 7, w: 6, y: 3, h: 2 }),
    ], 4),
  page("d5b1c0a0-0000-4a00-a000-000000000002", "Ops Pulse", "icon:activity",
    "Live MySQL operations — 2k tasks, 3k tickets, 6k logged hours. Workload, the people behind the hours, and the support inbox.", [
      richCell({ x: 1, w: 3, y: 1, h: 2, label: "insight", tint: "blue",
        heading: "The team behind the hours",
        lead: "Workload, logged time and the support queue — one *MySQL* cockpit.",
        callout: { kind: "info", text: "Hours roll up by person; the inbox is the live edge of the queue." },
        bullets: ["2,000 tasks · 3,061 tickets", "5,932 time entries, summed at the source"] }),
      dbCell({ db: OPS, table: "tasks", view: "ops-load", label: "Workload by status", x: 4, w: 9, y: 1, h: 2 }),
      dbCell({ db: OPS, table: "time_entries", view: "ops-hours", label: "Hours by person", x: 1, w: 6, y: 3, h: 2 }),
      dbCell({ db: OPS, table: "tickets", view: "ops-inbox", label: "Support inbox", x: 7, w: 6, y: 3, h: 2 }),
    ], 4),
  page("d5b1c0a0-0000-4a00-a000-000000000003", "Customer Constellation", "icon:users",
    "Live commerce customers — the people behind the revenue and the cross-engine web that connects them. The relationship side of the dataset, ending in a live force graph.", [
      richCell({ x: 1, w: 3, y: 1, h: 2, label: "insight", tint: "purple",
        heading: "People, not just rows",
        lead: "The same Postgres mount seen as *who* buys — and *how* they connect.",
        callout: { kind: "important", text: "The graph below stitches notes, customers and orders into one web." },
        bullets: ["Top cities by customer count", "Relationships drawn cross-engine"] }),
      dbCell({ db: COMMERCE, table: "customers", view: "commerce-topcities", label: "Top cities", x: 4, w: 9, y: 1, h: 2 }),
      dbCell({ db: COMMERCE, table: "orders", view: "commerce-revenue", label: "Revenue by status", x: 1, w: 6, y: 3, h: 2 }),
      dbCell({ db: COMMERCE, table: "products", view: "commerce-pricing", label: "Average price by category", x: 7, w: 6, y: 3, h: 2 }),
      graphCell({ label: "Relationship graph", x: 1, w: 12, y: 5, h: 2 }),
    ], 6),
  page("d5b1c0a0-0000-4a00-a000-000000000004", "Activity Stream", "icon:radio",
    "Live MongoDB activity — page views, checkouts, support chats and product reviews. The real-time, document-native face of the dataset.", [
      richCell({ x: 1, w: 3, y: 1, h: 2, label: "insight", tint: "green",
        heading: "The live, document face",
        lead: "MongoDB events and reviews — the *streaming* side of the dataset.",
        callout: { kind: "success", text: "Ratings trend ordinally; the feed is the real-time pulse." },
        bullets: ["Events bucketed by kind", "Reviews streaming in, newest first"] }),
      dbCell({ db: ACTIVITY, table: "events", view: "activity-kinds", label: "Events by kind", x: 4, w: 9, y: 1, h: 2 }),
      dbCell({ db: ACTIVITY, table: "product_reviews", view: "activity-trend", label: "Rating trend", x: 1, w: 6, y: 3, h: 2 }),
      dbCell({ db: ACTIVITY, table: "events", view: "activity-stream", label: "Live event stream", x: 7, w: 6, y: 3, h: 2 }),
    ], 4),
];

const esc = (value) => String(value).replaceAll("'", "''");
const lines = [
  "BEGIN;",
  ...boards.map((board, index) =>
    `INSERT INTO osionos_pages (id, workspace_id, owner_id, title, icon, surface, visibility, collaborators, properties, content, sort_order, created_at, updated_at)\n` +
    `VALUES ('${board.id}','${board.workspace_id}','${board.owner_id}','${esc(board.title)}','${board.icon}','page','private','[]'::jsonb,'{}'::jsonb,'${esc(JSON.stringify(board.content))}'::jsonb, ${1000 + index}, now(), now())\n` +
    `ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, icon=EXCLUDED.icon, content=EXCLUDED.content, updated_at=now();`),
  "COMMIT;",
];
process.stdout.write(lines.join("\n") + "\n");
