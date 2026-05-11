export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith(".") && !hasKnownExtension(specifier)) {
    for (const extension of [".ts", ".tsx"]) {
      try {
        return await nextResolve(`${specifier}${extension}`, context);
      } catch (error) {
        if (error?.code !== "ERR_MODULE_NOT_FOUND") throw error;
      }
    }
  }
  return nextResolve(specifier, context);
}

function hasKnownExtension(specifier) {
  return [".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".mjs", ".cjs", ".json"].some((extension) => specifier.endsWith(extension));
}
