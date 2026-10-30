import { useEffect, useRef } from "react";
import { startGlobe } from "./globeLoop";

/** The sign-in screen's turning globe of a workspace; decorative, so hidden from assistive tech. */
export function PortalGlobe() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => (canvasRef.current ? startGlobe(canvasRef.current) : undefined), []);
  return <canvas ref={canvasRef} className="osio-portal-globe" aria-hidden="true" />;
}
