import type { PageEntry } from "@/entities/page";
import { APP_KEYS } from "@/features/marketplace/model/appMeta";
import { websiteFor } from "@/features/marketplace/model/launchPolicy";
import { configuredUrlFor, currentPageHostname, isReachableUrl } from "@/shared/config/appUrls";
import { safeHttpUrl } from "@/shared/lib/embed/embedUrlGuard";

import { resolveBinding, type BindingValue } from "./headerBinding";

/** The href a header link slot renders, or "" to render nothing. A marketplace record's website
 *  goes through websiteFor; any other http(s) link is dropped when it points at a loopback host
 *  this page is not on (owner rule, 2026-11-04). A non-http link (mailto:) is kept as it was. */
export function headerLinkHref(page: PageEntry, bind: string | undefined, value: BindingValue, pageHostname = currentPageHostname()): string {
  const url = typeof value === "string" ? value.trim() : "";
  if (url === "") return "";
  const identifier = resolveBinding(page, APP_KEYS.identifier);
  if (bind === APP_KEYS.website && typeof identifier === "string" && identifier !== "") {
    return websiteFor(url, configuredUrlFor(identifier), pageHostname);
  }
  if (safeHttpUrl(url) === "") return url;
  return isReachableUrl(url, pageHostname) ? url : "";
}
