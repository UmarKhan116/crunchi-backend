import { ShareConfig, appStoreUrl, playStoreUrl } from './share-config';

/**
 * Every user-provided string goes through escapeHtml (text and quoted
 * attributes alike); every URL through safeUrl. Nothing user-provided is
 * placed in a script, a style or an unquoted attribute.
 */
export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/`/g, '&#96;');
}

/** Only absolute http(s) URLs survive; anything else (javascript:, data:, relative) is dropped. */
export function safeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || !value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:'
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

/** Single-line, length-limited text for meta tags. */
export function clip(value: unknown, max: number): string {
  const s = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s;
}

/** "★ 4.6 · Italian · Palm Desert" (missing parts are left out). */
export function ratingLine(
  rating: number | null | undefined,
  ...parts: (string | null | undefined)[]
): string {
  const items = [
    typeof rating === 'number' && Number.isFinite(rating)
      ? `★ ${Number.isInteger(rating) ? rating : rating.toFixed(1)}`
      : null,
    ...parts.map((p) => (p ? clip(p, 60) : null)),
  ].filter(Boolean);
  return items.join(' · ');
}

export interface SharePage {
  /** og:title / page heading. */
  title: string;
  /** og:description (the rating line). */
  description: string;
  /** Path on the share domain: "/p/45". */
  path: string;
  imageUrl?: string | null;
  /** Small line under the title ("Review by @bob"). */
  byline?: string | null;
  /** Longer text in the body (a review). */
  text?: string | null;
  rating?: number | null;
}

const BRAND = '#dd4a46';

function stars(rating: number | null | undefined): string {
  if (typeof rating !== 'number' || !Number.isFinite(rating)) return '';
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return `<p class="stars" aria-label="Rated ${escapeHtml(rating)} out of 5">${'★'.repeat(full)}${'☆'.repeat(5 - full)}</p>`;
}

function storeButtons(c: ShareConfig): string {
  const ios = appStoreUrl(c);
  const android = playStoreUrl(c);
  const links = [
    ios
      ? `<a class="btn" href="${escapeHtml(ios)}">Download on the App Store</a>`
      : '',
    android
      ? `<a class="btn" href="${escapeHtml(android)}">Get it on Google Play</a>`
      : '',
  ].join('');
  return links ? `<div class="stores">${links}</div>` : '';
}

function layout(c: ShareConfig, head: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
<style>
  :root { color-scheme: light dark; }
  body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
         background: #faf7f5; color: #1d1d1f; }
  @media (prefers-color-scheme: dark) { body { background: #121212; color: #f2f2f2; } .card { background: #1e1e1e; } }
  main { max-width: 480px; margin: 0 auto; padding: 24px 16px 40px; }
  .brand { font-weight: 800; font-size: 22px; color: ${BRAND}; text-decoration: none; letter-spacing: .5px; }
  .card { background: #fff; border-radius: 20px; overflow: hidden; margin-top: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .photo { display: block; width: 100%; aspect-ratio: 4 / 5; object-fit: cover; background: #ddd; }
  .info { padding: 16px 20px 20px; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  .meta, .byline { margin: 0 0 6px; opacity: .75; }
  .stars { color: ${BRAND}; font-size: 20px; margin: 0 0 8px; letter-spacing: 2px; }
  .text { line-height: 1.45; white-space: pre-line; margin: 8px 0 0; }
  .stores { display: flex; flex-direction: column; gap: 10px; margin-top: 20px; }
  .btn { display: block; text-align: center; padding: 14px; border-radius: 14px; background: ${BRAND};
         color: #fff; text-decoration: none; font-weight: 600; }
</style>
</head>
<body>
<main>
<a class="brand" href="${escapeHtml(c.shareBaseUrl)}">Crunchii</a>
${body}
${storeButtons(c)}
</main>
</body>
</html>
`;
}

/** Page with Open Graph, Twitter and Smart App Banner tags. */
export function renderSharePage(page: SharePage, c: ShareConfig): string {
  const url = `${c.shareBaseUrl}${page.path}`;
  const image = safeUrl(page.imageUrl);
  const title = clip(page.title, 120) || 'Crunchii';
  const description = clip(page.description, 200);
  const meta = (attr: 'property' | 'name', key: string, value: string) =>
    `<meta ${attr}="${key}" content="${escapeHtml(value)}">`;

  const head = [
    `<title>${escapeHtml(title)} · Crunchii</title>`,
    meta('name', 'description', description),
    `<link rel="canonical" href="${escapeHtml(url)}">`,
    meta('property', 'og:type', 'website'),
    meta('property', 'og:site_name', 'Crunchii'),
    meta('property', 'og:title', title),
    meta('property', 'og:description', description),
    meta('property', 'og:url', url),
    image ? meta('property', 'og:image', image) : '',
    meta('name', 'twitter:card', 'summary_large_image'),
    meta('name', 'twitter:title', title),
    meta('name', 'twitter:description', description),
    image ? meta('name', 'twitter:image', image) : '',
    c.iosAppStoreId
      ? meta(
          'name',
          'apple-itunes-app',
          `app-id=${c.iosAppStoreId}, app-argument=${url}`,
        )
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  const body = `<article class="card">
${image ? `<img class="photo" src="${escapeHtml(image)}" alt="${escapeHtml(title)}">` : ''}
<div class="info">
<h1>${escapeHtml(title)}</h1>
${stars(page.rating)}
${description ? `<p class="meta">${escapeHtml(description)}</p>` : ''}
${page.byline ? `<p class="byline">${escapeHtml(clip(page.byline, 120))}</p>` : ''}
${page.text ? `<p class="text">${escapeHtml(clip(page.text, 1000))}</p>` : ''}
</div>
</article>`;
  return layout(c, head, body);
}

export function renderNotFoundPage(c: ShareConfig): string {
  return layout(
    c,
    `<title>Not found · Crunchii</title>\n<meta name="robots" content="noindex">`,
    `<article class="card"><div class="info">
<h1>This page isn’t available</h1>
<p class="meta">It may have been removed. Discover great food near you in the Crunchii app.</p>
</div></article>`,
  );
}
