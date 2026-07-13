/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   seed-marketplace.mjs                               :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/06/25 00:00:00 by dlesieur          #+#    #+#             */
/*   Updated: 2026/06/25 00:00:00 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Emits idempotent SQL (to stdout) seeding the shared global marketplace: a system
// workspace + database, Mail & Calendar published apps + their child sub-pages, and a
// per-user install record so the apps are INSTALLED for dev.pro.photo (5cc30a3f) only.
// Apply with:  node seed-marketplace.mjs | docker exec -i mini-baas-postgres psql -U postgres -d postgres

import { createHash } from "node:crypto";

const WS = "5a4b1c2d-1111-4111-8111-000000000001"; // marketplace workspace
const DB = "5a4b1c2d-2222-4222-8222-000000000002"; // marketplace database (records' database_id)
const SYS = "5a4b1c2d-0000-4000-8000-000000000000"; // system owner
const DEV = "5cc30a3f-87e4-471d-b795-c936723081ee"; // dev.pro.photo (apps installed for this user)

const det = (s) => {
  const h = createHash("md5").update("mkt:" + s).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
};
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const jb = (o) => "$j$" + JSON.stringify(o) + "$j$::jsonb";
let bn = 0;
const blk = (type, content) => ({ id: `b${(bn += 1)}`, type, content });

function prop(key, label, type, value) {
  return { key, label, type, value };
}

function appProps(m) {
  return [
    prop("company", "Company", "text", m.company),
    prop("verified", "Verified", "checkbox", true),
    prop("website", "Website", "url", m.website),
    prop("shortDescription", "Description", "text", m.description),
    prop("version", "Version", "text", m.version),
    prop("identifier", "Identifier", "text", m.id),
    prop("publishedAt", "Published", "date", "2026-06-01T00:00:00Z"),
    prop("categories", "Categories", "multi_select", m.categories),
    prop("resources", "Resources", "multi_select", [m.website]),
    prop("published", "Published", "checkbox", true),
    prop("launchKind", "Launch", "text", m.launchKind ?? "embed"),
    prop("launchUrl", "Launch URL", "url", m.launchUrl),
  ];
}

const SUBPAGES = (m) => [
  { slug: "details", title: "Details", icon: "icon:file-text", content: [blk("heading_2", "Overview"), blk("paragraph", m.overview), ...m.features.map((f) => blk("bulleted_list", f))] },
  { slug: "features", title: "Features", icon: "icon:sparkles", content: [blk("heading_2", "Features"), ...m.features.map((f) => blk("bulleted_list", f))] },
  { slug: "changelog", title: "Changelog", icon: "icon:history", content: [blk("heading_3", `${m.version}`), blk("bulleted_list", "Initial release inside the osionos marketplace.")] },
  { slug: "installation", title: "Installation", icon: "icon:download", rail: true, content: [blk("paragraph", `Install from the Marketplace panel; the app opens at ${m.launchUrl}.`)] },
  { slug: "categories", title: "Categories", icon: "icon:tag", rail: true, content: [blk("paragraph", m.categories.join(", "))] },
  { slug: "resources", title: "Resources", icon: "icon:link", rail: true, content: [blk("paragraph", m.website)] },
];

function pageInsert({ id, parent, title, icon, surface, dbId, props, content }) {
  return `INSERT INTO public.osionos_pages (id, workspace_id, parent_page_id, owner_id, title, icon, database_id, surface, visibility, collaborators, properties, content, created_at, updated_at)
VALUES (${q(id)}, ${q(WS)}, ${parent ? q(parent) : "NULL"}, ${q(SYS)}, ${q(title)}, ${icon ? q(icon) : "NULL"}, ${dbId ? q(dbId) : "NULL"}, ${q(surface)}, 'public', '[]'::jsonb, ${jb(props)}, ${jb(content)}, now(), now())
ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, icon=EXCLUDED.icon, database_id=EXCLUDED.database_id, surface=EXCLUDED.surface, visibility=EXCLUDED.visibility, properties=EXCLUDED.properties, content=EXCLUDED.content, updated_at=now();`;
}

const APPS = [
  {
    id: "osionos.mail", title: "Mail", icon: "icon:mail", company: "osionos", website: "https://localhost:3002",
    description: "Read & manage your Gmail messages directly inside osionos.",
    overview: "Mail brings your Gmail inbox into osionos with a fast, keyboard-first reader and a secure OAuth bridge.",
    version: "0.1.0", categories: ["Productivity", "Communication"],
    launchUrl: "https://localhost:3002",
    features: ["Unified Gmail inbox", "Compose & reply", "Labels and search", "Secure OAuth bridge — tokens never touch the client"],
  },
  {
    id: "osionos.calendar", title: "Calendar", icon: "icon:calendar", company: "osionos", website: "https://localhost:3003",
    description: "See and manage your Google Calendar events from osionos.",
    overview: "Calendar embeds your Google Calendar with month/week views and event editing, bridged over a secure OAuth flow.",
    version: "0.1.0", categories: ["Productivity"],
    launchUrl: "https://localhost:3003",
    features: ["Month & week views", "Create and edit events", "Multiple calendars", "Secure OAuth bridge"],
  },
  {
    id: "osionos.desktop", title: "Desktop", icon: "icon:monitor", company: "osionos", website: "https://localhost:3001",
    description: "Run osionos as a focused desktop-style window over the local suite.",
    overview: "The osionos workspace in a dedicated desktop window — same data, fewer distractions.",
    version: "0.5.4", categories: ["Productivity"],
    launchUrl: "https://localhost:3001",
    features: ["Native-feel window shell", "Loopback to the local suite", "Offline-friendly"],
  },
  {
    id: "osionos.draw", title: "Draw", icon: "icon:pen-tool", company: "osionos", website: "https://localhost:3001",
    description: "An Excalidraw-class whiteboard — shapes, freehand, diagrams & real-time collaboration inside osionos.",
    overview: "Draw is a full drawing and diagramming surface: hand-drawn shapes, arrows that stay connected to what they link, Figma-style frames, and multiplayer editing — a native osionos app, not an iframe.",
    version: "0.1.0", categories: ["Productivity", "Design"], launchKind: "panel",
    launchUrl: "https://localhost:3001",
    features: ["Shapes, arrows & freehand drawing", "Connectors that follow the shapes they link", "Figma-style frames", "Real-time multiplayer", "Keyboard-first — draw without the mouse"],
  },
];

const out = [];
out.push("BEGIN;");
// 0) widen the surface CHECK to allow 'app' (+ 'wiki' to match the bridge) — additive, safe.
out.push(`DO $$ DECLARE c text;
BEGIN
  SELECT conname INTO c FROM pg_constraint WHERE conrelid='public.osionos_pages'::regclass AND contype='c' AND pg_get_constraintdef(oid) ILIKE '%surface%';
  IF c IS NOT NULL THEN EXECUTE format('ALTER TABLE public.osionos_pages DROP CONSTRAINT %I', c); END IF;
  ALTER TABLE public.osionos_pages ADD CONSTRAINT osionos_pages_surface_check CHECK (surface IS NULL OR surface = ANY (ARRAY['page','agent','home','folder','wiki','app']));
END $$;`);
// 1) marketplace workspace + database root
out.push(`INSERT INTO public.osionos_workspaces (id, owner_id, name, slug, source, visibility, created_at, updated_at)
VALUES (${q(WS)}, ${q(SYS)}, 'Marketplace', 'marketplace', 'system', 'public', now(), now())
ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, visibility=EXCLUDED.visibility, updated_at=now();`);
out.push(pageInsert({ id: DB, parent: null, title: "Marketplace", icon: "icon:store", surface: "app", dbId: null, props: [], content: [] }));

// 2) apps + their child sub-pages
const installed = {};
for (const m of APPS) {
  const appId = det(m.id);
  out.push(pageInsert({ id: appId, parent: DB, title: m.title, icon: m.icon, surface: "app", dbId: DB, props: appProps(m), content: [] }));
  for (const sub of SUBPAGES(m)) {
    out.push(pageInsert({ id: det(`${m.id}:${sub.slug}`), parent: appId, title: sub.title, icon: sub.icon, surface: "page", dbId: null, props: [], content: sub.content }));
  }
  installed[m.id] = { identifier: m.id, title: m.title, icon: m.icon, launchKind: m.launchKind ?? "embed", launchUrl: m.launchUrl, autoUpdate: true, active: true, installedAt: "2026-06-01T00:00:00Z" };
}

// 3) install Mail + Calendar for dev.pro.photo only (per-user simulation)
out.push(`INSERT INTO public.osionos_page_configurations (page_id, workspace_id, user_id, config, created_at, updated_at)
VALUES (${q(DB)}, ${q(WS)}, ${q(DEV)}, ${jb({ installed })}, now(), now())
ON CONFLICT (user_id, page_id) DO UPDATE SET config=EXCLUDED.config, updated_at=now();`);
out.push("COMMIT;");

process.stdout.write(out.join("\n\n") + "\n");
