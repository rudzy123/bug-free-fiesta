const DEFAULT_PAGE_COUNT = 1;

/**
 * Best-effort page count for field bounds. Stub PDFs without a catalog count as one page.
 */
export function extractPdfPageCount(body: Uint8Array): number {
  const text = Buffer.from(body).toString('latin1');
  const catalog = text.match(/\/Type\s*\/Pages[^>]*\/Count\s+(\d+)/);
  const fromCatalog = catalog?.[1];
  if (fromCatalog !== undefined) {
    const parsed = Number.parseInt(fromCatalog, 10);
    if (Number.isInteger(parsed) && parsed >= 1) {
      return parsed;
    }
  }
  const pageObjects = text.match(/\/Type\s*\/Page(?!s)/g);
  if (pageObjects && pageObjects.length >= 1) {
    return pageObjects.length;
  }
  return DEFAULT_PAGE_COUNT;
}
