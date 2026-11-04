import { PRISMATICA_URL } from "@/features/auth/model/userStore.helpers";
import { legalLinks } from "./legalLinks";

/** This build's legal pages: VITE_PRISMATICA_URL is the public site (https://localhost:4322 under make all). */
export const LEGAL_LINKS = legalLinks(PRISMATICA_URL);
