/**
 * Builds a Content-Disposition value safe against header injection (CWE-113).
 * Uses an ASCII fallback `filename=` plus RFC 5987 `filename*`.
 */
export function contentDispositionHeader(
  disposition: 'inline' | 'attachment',
  displayName: string,
): string {
  const withoutControls = displayName.replaceAll(/[\r\n\0]/g, '').trim();
  const fallback =
    withoutControls
      .replaceAll(/["\\]/g, '_')
      .replaceAll(/[^\x20-\x7E]/g, '_')
      .slice(0, 180) || 'document.pdf';
  const encoded = encodeURIComponent(withoutControls || 'document.pdf').replaceAll(
    /['()]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
