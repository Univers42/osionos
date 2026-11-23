// What "Create profile page" fills the new README with (groot ADR 0064 PS34): the Profile
// shell below its identity row, under fresh block ids. Loaded on the click, never on a view.

import type { Block } from "@/entities/block";
import { isLayoutModesEnabled } from "@/shared/config/featureFlags";

export async function profileReadmeSeed(): Promise<Block[]> {
  // Shell sections are region containers, which TD18 keeps out of written pages until
  // osio.layout.modes is on (groot ADR 0067 RD6): without it the README starts empty.
  if (!isLayoutModesEnabled()) return [];
  const [{ profileBodySections }, { freshTemplateContent }] = await Promise.all([
    import("@/data/templates/catalogue/shells/personalShells"),
    import("@/features/page-shells/model/applyShell"),
  ]);
  return freshTemplateContent(profileBodySections());
}
