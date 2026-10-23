import {
  clip,
  escapeHtml,
  ratingLine,
  renderNotFoundPage,
  renderSharePage,
  safeUrl,
} from './share-html';
import { readShareConfig } from './share-config';

const config = readShareConfig({
  SHARE_BASE_URL: 'https://crunchiiapp.com/',
  IOS_APP_STORE_ID: '1234567890',
  ANDROID_PACKAGE: 'com.crunchii',
});

const XSS = `"><script>alert('x')</script><img src=x onerror=alert(1)>&`;

describe('share HTML', () => {
  it('escapes &, <, >, quotes and backticks', () => {
    expect(escapeHtml(`<a href="x" title='y'>&\``)).toBe(
      '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&#96;',
    );
    expect(escapeHtml(null)).toBe('');
  });

  it('only keeps absolute http(s) URLs', () => {
    expect(safeUrl('https://api.test/storage/a.jpg')).toBe(
      'https://api.test/storage/a.jpg',
    );
    expect(safeUrl('javascript:alert(1)')).toBeNull();
    expect(safeUrl('data:text/html,<script>')).toBeNull();
    expect(safeUrl('/storage/a.jpg')).toBeNull();
    expect(safeUrl(42)).toBeNull();
  });

  it('builds the rating line and clips long text', () => {
    expect(ratingLine(4.6, 'Italian', 'Palm Desert')).toBe(
      '★ 4.6 · Italian · Palm Desert',
    );
    expect(ratingLine(5, null, 'Palm Desert')).toBe('★ 5 · Palm Desert');
    expect(ratingLine(null, null, null)).toBe('');
    expect(clip('a  b\n c', 10)).toBe('a b c');
    expect(clip('x'.repeat(20), 10)).toHaveLength(10);
  });

  it('never lets user text break out of tags or attributes', () => {
    const html = renderSharePage(
      {
        path: '/p/1',
        title: XSS,
        description: ratingLine(4, XSS, XSS),
        byline: XSS,
        text: XSS,
        imageUrl: `https://api.test/storage/a.jpg?x="><script>`,
        rating: 4,
      },
      config,
    );
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/<img src=x/i);
    // The only real img tag is ours; the injected one exists only as text.
    expect(html.match(/<img\b[^>]*>/g)).toEqual([
      expect.stringMatching(
        /^<img class="photo" src="https:\/\/api\.test\/storage\/a\.jpg\?x=%22%3E%3Cscript%3E"/,
      ),
    ]);
    expect(html).toContain('&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
    // Every attribute value stays inside its quotes.
    for (const m of html.matchAll(/content="([^"]*)"/g)) {
      expect(m[1]).not.toMatch(/[<>]/);
    }
  });

  it('drops a javascript: image instead of rendering it', () => {
    const html = renderSharePage(
      {
        path: '/u/1',
        title: 'Bob',
        description: '',
        imageUrl: 'javascript:alert(1)',
      },
      config,
    );
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('og:image');
  });

  it('has the Open Graph, Twitter and Smart App Banner tags and store buttons', () => {
    const html = renderSharePage(
      {
        path: '/r/ChIJabc',
        title: 'Trattoria',
        description: '★ 4.6 · Italian · Palm Desert',
        imageUrl: 'https://api.test/api/places/photo/ref?w=1200',
      },
      config,
    );
    for (const tag of [
      '<meta property="og:title" content="Trattoria">',
      '<meta property="og:description" content="★ 4.6 · Italian · Palm Desert">',
      '<meta property="og:url" content="https://crunchiiapp.com/r/ChIJabc">',
      '<meta property="og:image" content="https://api.test/api/places/photo/ref?w=1200">',
      '<meta name="twitter:card" content="summary_large_image">',
      '<meta name="apple-itunes-app" content="app-id=1234567890, app-argument=https://crunchiiapp.com/r/ChIJabc">',
      'href="https://apps.apple.com/app/id1234567890"',
      'href="https://play.google.com/store/apps/details?id=com.crunchii"',
    ]) {
      expect(html).toContain(tag);
    }
  });

  it('renders a 404 page without app-specific data', () => {
    const html = renderNotFoundPage(config);
    expect(html).toContain('isn’t available');
    expect(html).toContain('noindex');
  });
});
