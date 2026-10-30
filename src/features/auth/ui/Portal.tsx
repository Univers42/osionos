import { lazy, Suspense } from "react";
import { PortalForm } from "./PortalForm";
import "./portal.css";

// The globe is the only heavy part of the screen: the form paints first, the globe follows.
const PortalGlobe = lazy(() => import("./portal-globe/PortalGlobe").then((m) => ({ default: m.PortalGlobe })));

const OsionosMark = () => (
  <svg viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
    <rect width="32" height="32" rx="7" fill="#1F5BC4" />
    <circle cx="16" cy="16" r="7.5" fill="none" stroke="#fff" strokeWidth="3.2" />
  </svg>
);

const LEGEND = [
  { kind: "page", label: "Pages" },
  { kind: "database", label: "Databases" },
  { kind: "conversation", label: "Conversations" },
] as const;

/** Full-screen sign-in — the first thing shown when no one is signed in. */
export function Portal() {
  return (
    <div className="osio-portal">
      <main className="osio-portal-main">
        <div className="osio-portal-brand">
          <OsionosMark />
          <span>osionos</span>
        </div>
        <PortalForm />
      </main>
      <figure className="osio-portal-scene">
        <Suspense fallback={null}>
          <PortalGlobe />
        </Suspense>
        <figcaption>
          <p>A workspace is a web of linked work. Drag to turn it.</p>
          <ul className="osio-portal-legend">
            {LEGEND.map((item) => (
              <li key={item.kind} data-kind={item.kind}>{item.label}</li>
            ))}
          </ul>
        </figcaption>
      </figure>
    </div>
  );
}
