// Helpers used by both the public site and the admin page.

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// Accepts watch?v=, youtu.be/, shorts/, embed/, live/ and bare 11-char IDs.
export function youtubeId(input) {
  const s = String(input || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  try {
    const u = new URL(s);
    if (u.hostname.endsWith('youtu.be')) return clean(u.pathname.slice(1));
    if (u.searchParams.get('v')) return clean(u.searchParams.get('v'));
    const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([\w-]{11})/);
    if (m) return m[1];
  } catch { /* not a URL */ }
  return null;

  function clean(id) {
    const m = id.match(/^[\w-]{11}/);
    return m ? m[0] : null;
  }
}

// Accepts open.spotify.com links (with or without intl-xx/), embed links and spotify: URIs.
export function spotifyRef(input) {
  const s = String(input || '').trim();
  const uri = s.match(/^spotify:(track|album|playlist|artist|episode|show):(\w+)/);
  if (uri) return { kind: uri[1], id: uri[2] };
  try {
    const u = new URL(s);
    if (!u.hostname.endsWith('spotify.com')) return null;
    const m = u.pathname.match(/(?:\/intl-[\w-]+)?(?:\/embed)?\/(track|album|playlist|artist|episode|show)\/(\w+)/);
    if (m) return { kind: m[1], id: m[2] };
  } catch { /* not a URL */ }
  return null;
}

export function spotifyEmbedUrl(ref) {
  return `https://open.spotify.com/embed/${ref.kind}/${ref.id}?utm_source=generator&theme=0`;
}

export function spotifyHeight(ref) {
  return ref.kind === 'track' || ref.kind === 'episode' ? 152 : 352;
}

export function paragraphs(text) {
  return String(text || '')
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

// "deepan.com" or "www.deepan.com/" becomes "https://deepan.com/". Bad input becomes "".
export function normalizeSiteUrl(value) {
  let s = String(value || '').trim();
  if (!s) return '';
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.origin + u.pathname.replace(/\/?$/, '/');
  } catch {
    return '';
  }
}

// Google gives a whole tag: <meta name="google-site-verification" content="abc..." />.
// Accept the tag or the bare code, and keep only the code.
export function googleCode(value) {
  const s = String(value || '').trim();
  const m = s.match(/content=["']([^"']+)["']/i);
  const code = m ? m[1] : s;
  return /^[\w-]{10,100}$/.test(code) ? code : '';
}

export function absoluteUrl(siteUrl, path) {
  if (!path) return '';
  if (/^https?:\/\//.test(path)) return path;
  if (!siteUrl) return path;
  return siteUrl.replace(/\/?$/, '/') + path.replace(/^\//, '');
}

// The <head> block between the SEO markers in index.html. The admin rewrites it on publish,
// because link-preview bots (WhatsApp, X, LinkedIn) do not run JavaScript.
export function buildSeoBlock(content) {
  const seo = content.seo || {};
  const site = content.site || {};
  const base = normalizeSiteUrl(seo.siteUrl);
  const image = absoluteUrl(base, seo.ogImage);
  const contact = (content.sections || []).find((s) => s.type === 'contact') || {};
  const sameAs = (contact.socials || []).map((s) => s.url).filter((u) => /^https?:\/\/.+\/.+/.test(u));
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'MusicGroup',
    name: site.name,
    description: seo.description,
    url: base || undefined,
    image: image || undefined,
    email: contact.email || undefined,
    sameAs: sameAs.length ? sameAs : undefined,
  };
  const json = JSON.stringify(ld, null, 2).replace(/</g, '\\u003c');
  const lines = [
    `<title>${esc(seo.title || site.name)}</title>`,
    `<meta name="description" content="${esc(seo.description)}">`,
    seo.keywords ? `<meta name="keywords" content="${esc(seo.keywords)}">` : '',
    seo.noindex ? '<meta name="robots" content="noindex">' : '',
    googleCode(seo.googleVerification) ? `<meta name="google-site-verification" content="${esc(googleCode(seo.googleVerification))}">` : '',
    base ? `<link rel="canonical" href="${esc(base)}">` : '',
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${esc(seo.title || site.name)}">`,
    `<meta property="og:description" content="${esc(seo.description)}">`,
    base ? `<meta property="og:url" content="${esc(base)}">` : '',
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta property="og:locale" content="${esc(seo.locale || 'en_IN')}">`,
    `<meta property="og:site_name" content="${esc(site.name)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    seo.twitter ? `<meta name="twitter:site" content="${esc(seo.twitter)}">` : '',
    `<meta name="twitter:title" content="${esc(seo.title || site.name)}">`,
    `<meta name="twitter:description" content="${esc(seo.description)}">`,
    image ? `<meta name="twitter:image" content="${esc(image)}">` : '',
    `<script type="application/ld+json">\n${json}\n</script>`,
  ].filter(Boolean);
  return lines.map((l) => '    ' + l).join('\n');
}

export function replaceSeoBlock(html, block) {
  const re = /(<!-- SEO:START -->)[\s\S]*?(\s*<!-- SEO:END -->)/;
  if (!re.test(html)) throw new Error('index.html has no SEO markers.');
  // A function replacer, so a "$" in the SEO text is not read as a pattern.
  return html.replace(re, (_, start, end) => `${start}\n${block}${end}`);
}

export function buildSitemap(siteUrl) {
  const loc = siteUrl.replace(/\/?$/, '/');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>${esc(loc)}</loc><lastmod>${new Date().toISOString().slice(0, 10)}</lastmod></url>
</urlset>
`;
}

export function buildRobots(siteUrl) {
  const lines = ['User-agent: *', 'Disallow: /admin/', 'Allow: /'];
  siteUrl = normalizeSiteUrl(siteUrl);
  if (siteUrl) {
    const u = new URL(siteUrl);
    // A project site lives under /repo/, so the admin path needs that prefix too.
    lines[1] = `Disallow: ${u.pathname.replace(/\/?$/, '/')}admin/`;
    lines.push('', `Sitemap: ${siteUrl.replace(/\/?$/, '/')}sitemap.xml`);
  }
  return lines.join('\n') + '\n';
}
