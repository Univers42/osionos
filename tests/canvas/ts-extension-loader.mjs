/* ************************************************************************** */
/*                                                                            */
/*                                                        :::      ::::::::   */
/*   ts-extension-loader.mjs                            :+:      :+:    :+:   */
/*                                                    +:+ +:+         +:+     */
/*   By: dlesieur <dlesieur@student.42.fr>          +#+  +:+       +#+        */
/*                                                +#+#+#+#+#+   +#+           */
/*   Created: 2026/05/18 21:19:22 by dlesieur          #+#    #+#             */
/*   Updated: 2026/05/18 21:19:22 by dlesieur         ###   ########.fr       */
/*                                                                            */
/* ************************************************************************** */

// Mirrors the Vite "@/*" -> "src/*" tsconfig path so tests can import modules
// that use the alias for value imports (type-only "@/" imports are erased).
const SRC_BASE = new URL("../../src/", import.meta.url);

export async function resolve(specifier, context, nextResolve) {
  const target = specifier.startsWith("@/")
    ? new URL(specifier.slice(2), SRC_BASE).href
    : specifier;
  if ((target.startsWith(".") || target.startsWith("file:")) && !hasKnownExtension(target)) {
    for (const extension of [".ts", ".tsx"]) {
      try {
        return await nextResolve(`${target}${extension}`, context);
      } catch (error) {
        if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
      }
    }
  }
  return nextResolve(target, context);
}

function hasKnownExtension(specifier) {
  return [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"].some((extension) => specifier.endsWith(extension));
}
