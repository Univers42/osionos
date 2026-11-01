// The app's look on the node's page: the same token sheet, and the same attributes on <html>.
import type { EditorTheme } from "../features/machines/model/editorFrameProtocol";

const ATTRIBUTE: Record<string, string> = { theme: "theme", palette: "palette", accent: "accent", density: "density", radius: "radius", uiScale: "uiScale" };

export function applyTheme(theme: EditorTheme): void {
  const root = document.documentElement;
  for (const [name, attribute] of Object.entries(ATTRIBUTE)) {
    const value = theme[name as keyof EditorTheme];
    if (value) root.dataset[attribute] = value;
    else delete root.dataset[attribute];
  }
  if (theme.accentHue) root.style.setProperty("--osio-accent-hue", theme.accentHue);
  else root.style.removeProperty("--osio-accent-hue");
}
