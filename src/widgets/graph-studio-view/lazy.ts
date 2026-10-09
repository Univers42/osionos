import { lazy } from "react";

/** The graph_render-backed graph, loaded only when a graph surface mounts. */
export const LazyGraphStudioView = lazy(() => import("./GraphStudioView").then((m) => ({ default: m.GraphStudioView })));
