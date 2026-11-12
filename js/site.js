import { esc, youtubeId, spotifyRef, spotifyEmbedUrl, spotifyHeight, paragraphs } from './shared.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const lite = root.classList.contains('lite');
const isPreview = new URLSearchParams(location.search).has('preview');
// Scroll-driven CSS animations run on the compositor, so they never lag the scroll.
const cssScroll = !!window.CSS?.supports?.('animation-timeline: scroll()');
let lenis = null;
if (isPreview) root.classList.add('preview');

const C = {
  amber: '#FD8326', blush: '#F59192', coral: '#F4545E', crimson: '#D32729',
  plum: '#6D2A4F', night: '#25091C', ink: '#140410', core: '#FFE9DC',
};

let content = null;
let assets = {}; // preview only: unpublished upload path -> blob URL
let galleries = [];
let booted = false;

const asset = (p) => assets[p] || p || '';
const pad = (n) => String(n).padStart(2, '0');
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

start();

async function start() {
  if (isPreview) {
    addEventListener('message', (e) => {
      if (e.origin !== location.origin || e.data?.type !== 'deepan-preview') return;
      assets = e.data.assets || {};
      const y = scrollY;
      render(e.data.content);
      scrollTo(0, y);
    });
    parent.postMessage({ type: 'deepan-preview-ready' }, location.origin);
    return;
  }
  try {
    const res = await fetch('content.json');
    render(await res.json());
  } catch {
    $('#sections').innerHTML = '<p class="noscript">The page content did not load. Refresh to try again.</p>';
  }
}

function render(c) {
  content = c;
  const sections = (c.sections || []).filter((s) => s.visible !== false);
  galleries = [];

  $('#topbar').innerHTML = topbar(c, sections);
  $('#top').innerHTML = hero(c, sections);
  $('#sections').innerHTML = sections.map((s, i) => (i ? stave(i) : '') + section(s, i + 1)).join('');
  $('#footer').innerHTML = footer(c);
  $('#staff').innerHTML = staff(sections);

  if (!booted) {
    bootEffects();
    booted = true;
  }
  refreshEffects();
}

/* ---------------- Templates ---------------- */

const NOTE_SVG = '<svg viewBox="0 0 40 52" aria-hidden="true"><use href="#note-glyph" fill="#F4545E" color="#FD8326"/></svg>';

function topbar(c, sections) {
  const contactSec = sections.find((s) => s.type === 'contact');
  return `
    <a class="logo misreg" href="#top">${NOTE_SVG}${esc(c.site?.name)}</a>
    <ol class="tracklist" id="tracklist">
      ${sections.map((s, i) => `<li><a href="#${esc(s.id)}" data-id="${esc(s.id)}"><span>${pad(i + 1)}</span>${esc(s.nav || s.title)}</a></li>`).join('')}
    </ol>
    ${contactSec ? `<a class="btn small book-btn" href="#${esc(contactSec.id)}">${esc(c.site?.ctaSecondary || 'Book')}</a>` : ''}
    <button class="menu-btn" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="tracklist"><span></span></button>`;
}

function hero(c, sections) {
  const s = c.site || {};
  const first = sections[0];
  const contactSec = sections.find((x) => x.type === 'contact');
  const name = esc(s.name);
  const nameHtml = lite || reduced
    ? name
    : [...(s.name || '')].map((ch, i) => `<span class="ch" style="--i:${i}">${esc(ch)}</span>`).join('');
  const floats = ['♪', '♫', '♪', '♬', '♫', '♪'].map((n, i) =>
    `<span style="left:${62 + i * 6}%;bottom:${14 + (i % 3) * 6}%;animation-delay:${i * 1.15}s">${n}</span>`).join('');
  return `
    ${editPill('hero')}
    <div class="hero-sky" aria-hidden="true">
      <div class="sun" data-depth=".6" style="--depth:.6"></div>
      <svg class="birds" viewBox="0 0 140 40" fill="none" stroke="#140410" stroke-width="2" stroke-linecap="round">
        <path d="M4 18q6-7 12 0q6-7 12 0"/><path d="M44 8q5-6 10 0q5-6 10 0"/><path d="M80 24q4-5 8 0q4-5 8 0"/><path d="M110 12q5-6 10 0q5-6 10 0"/>
      </svg>
      <div class="float-notes">${floats}</div>
    </div>
    <div class="skyline" data-depth=".5" style="--depth:.5" aria-hidden="true"><canvas data-layer="far" style="height:60%"></canvas></div>
    <div class="skyline" data-depth=".32" style="--depth:.32" aria-hidden="true"><canvas data-layer="mid" style="height:45%"></canvas></div>
    <div class="skyline" data-depth=".14" style="--depth:.14" aria-hidden="true"><canvas data-layer="near" style="height:30%"></canvas></div>
    <div class="hero-fade" aria-hidden="true"></div>
    <div class="hero-inner">
      <div class="hero-copy">
        <p class="hero-role">${esc(s.role)}</p>
        <h1 class="hero-name misreg"><span class="sr-only">${name}</span><span aria-hidden="true">${nameHtml}</span></h1>
        <div class="captions">
          <span class="caption a">${esc(s.tagline)}</span>
          ${s.taglineKicker ? `<span class="caption b">${esc(s.taglineKicker)}</span>` : ''}
        </div>
        ${s.intro ? `<p class="hero-intro">${esc(s.intro)}</p>` : ''}
        <div class="hero-ctas">
          ${first ? `<a class="btn" href="#${esc(first.id)}">${esc(s.ctaPrimary || 'Explore')}</a>` : ''}
          ${contactSec ? `<a class="btn ghost" href="#${esc(contactSec.id)}">${esc(s.ctaSecondary || 'Book')}</a>` : ''}
        </div>
      </div>
      <div class="hero-art">
        ${s.heroImage ? `<figure class="portrait"><img src="${esc(asset(s.heroImage))}" alt="${esc(s.heroImageAlt || s.name)}" fetchpriority="high" style="object-position:${focusPos(s.heroFocus)}"></figure>` : ''}
        <div class="note-fly">${neonNote()}</div>
        <span class="sfx s1" aria-hidden="true">SWISH!</span>
      </div>
    </div>
    ${first ? `<a class="scroll-cue" href="#${esc(first.id)}">scroll the story<i></i></a>` : ''}`;
}

// The light trail that swished the note into place: up through the photo to the left note head.
const TAIL = 'M330 650C250 650 150 610 100 530S25 330 40 215';

// The swish.jpeg note, rebuilt as neon tubes in the site palette.
function neonNote() {
  const heads = [[62, 192], [168, 170]];
  const outer = (cls) => `
    ${heads.map(([x, y], i) => `<ellipse class="tube ${cls}" style="--d:${i * .12}s" pathLength="1" cx="${x}" cy="${y}" rx="34" ry="25" transform="rotate(-22 ${x} ${y})"/>`).join('')}
    <path class="tube ${cls}" style="--d:.3s" pathLength="1" d="M94 182V60M200 160V38"/>
    <path class="tube ${cls}" style="--d:.45s" pathLength="1" d="M94 60L200 22L200 50L94 88Z"/>`;
  return `
    <svg class="neon-note" viewBox="0 0 230 240" aria-hidden="true">
      <g class="swish-tail" filter="url(#neon-glow)">
        ${[[C.coral, 12, .4], [C.amber, 4, 1], [C.core, 1.4, 1]].map(([col, w, o]) =>
          `<path d="${TAIL}" stroke="${col}" stroke-width="${w}" opacity="${o}" pathLength="1"/>`).join('')}
      </g>
      <g filter="url(#neon-glow)">
        ${outer('t-out')}
        ${heads.map(([x, y], i) => `<ellipse class="tube t-in" style="--d:${.5 + i * .1}s" pathLength="1" cx="${x}" cy="${y}" rx="19" ry="12" transform="rotate(-22 ${x} ${y})"/>`).join('')}
        <path class="tube t-in" style="--d:.7s" pathLength="1" d="M102 70L192 38"/>
      </g>
      <g>${outer('t-core')}</g>
    </svg>`;
}

function head(s, n, extra = '') {
  return `
    <header class="sec-head">
      <span class="track-no" aria-hidden="true">${pad(n)}</span>
      <span class="eyebrow reveal"><b>TRACK ${pad(n)}</b>${esc(s.eyebrow)}</span>
      <h2 class="sec-title misreg reveal">${esc(s.title)}</h2>
      ${s.intro ? `<p class="sec-intro reveal">${esc(s.intro)}</p>` : ''}
      ${extra}
    </header>`;
}

function shell(s, n, body, cls = '') {
  return `<section class="sec sec-${esc(s.type)} ${cls}" id="${esc(s.id)}" data-track="${n}">
    ${editPill(s.id)}<div class="sec-inner">${body}</div></section>`;
}

// Only the admin preview gets these. They tell the editor which section to open.
function editPill(id) {
  return isPreview ? `<button class="edit-pill" type="button" data-edit="${esc(id)}">✎ Edit this</button>` : '';
}

function section(s, n) {
  switch (s.type) {
    case 'videos': return shell(s, n, head(s, n) + videos(s));
    case 'spotify': return shell(s, n, `<div class="listen-head">${head(s, n)}<div class="reveal"><div class="vinyl" aria-hidden="true"></div></div></div>` + spotify(s));
    case 'gallery': return shell(s, n, head(s, n) + gallery(s));
    case 'about': return shell(s, n, about(s, n));
    case 'services': return shell(s, n, head(s, n) + services(s));
    case 'quotes': return shell(s, n, head(s, n) + quotes(s));
    case 'contact': return shell(s, n, contact(s, n), 'contact-sec');
    case 'text': return shell(s, n, textSection(s, n));
    default: return '';
  }
}

function videos(s) {
  const items = (s.items || []).map((v) => ({ ...v, id: youtubeId(v.url) })).filter((v) => v.id);
  return `<div class="videos">${items.map((v, i) => `
    <figure class="video ${i === 0 && items.length > 2 ? 'featured' : ''} reveal" style="--i:${i % 3}">
      <button class="yt" type="button" data-id="${esc(v.id)}" data-title="${esc(v.title || 'Video')}" aria-label="Play ${esc(v.title || 'video')}">
        <img src="https://i.ytimg.com/vi/${esc(v.id)}/${i === 0 ? 'maxresdefault' : 'hqdefault'}.jpg" alt="" loading="lazy" ${i === 0 ? 'data-maxres' : ''}>
        <span class="play"><svg viewBox="0 0 24 24"><path d="M5 3l16 9-16 9z"/></svg></span>
      </button>
      <figcaption>${v.title ? `<h3>${esc(v.title)}</h3>` : ''}${v.note ? `<p>${esc(v.note)}</p>` : ''}</figcaption>
    </figure>`).join('')}</div>`;
}

function spotify(s) {
  const items = (s.items || []).map((x) => spotifyRef(x.url)).filter(Boolean);
  return `<div class="spotify-grid">${items.map((ref, i) => {
    const h = spotifyHeight(ref);
    return `<div class="spotify ${h > 152 ? 'wide' : ''} reveal" style="--i:${i % 2}">
      <span class="tag">SIDE A · ${pad(i + 1)}</span>
      <iframe src="${esc(spotifyEmbedUrl(ref))}" height="${h}" loading="lazy" title="Spotify player ${i + 1}"
        allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe>
    </div>`;
  }).join('')}</div>`;
}

// A relative url() inside a CSS variable resolves against the stylesheet (css/), not the page.
// Make it absolute so the gallery's colour layers load the right file.
const cssUrl = (src) => new URL(src, document.baseURI).href.replace(/'/g, '%27');

const FOCUS = { top: '50% 15%', center: '50% 50%', bottom: '50% 85%' };
const focusPos = (f) => FOCUS[f] || (/^\d{1,3}% \d{1,3}%$/.test(f || '') ? f : FOCUS.center);

function gallery(s) {
  const items = (s.items || []).filter((g) => g.src);
  const gi = galleries.push(items) - 1;
  return `<div class="gallery">${items.map((g, i) => {
    const src = asset(g.src);
    const focus = focusPos(g.focus);
    const ar = +g.ar > .2 && +g.ar < 6 ? +g.ar : '';
    return `<button type="button" class="shot ${g.size === 'big' ? 'big' : ''} reveal" style="--i:${i % 4};${ar ? `--ar:${ar};` : ''}--img:url('${cssUrl(src)}');--focus:${focus}"
        aria-label="Open photo: ${esc(g.caption || g.alt || 'photo')}" data-g="${gi}" data-i="${i}">
      <img src="${esc(src)}" alt="${esc(g.alt || g.caption || '')}" loading="lazy" style="object-position:${focus}">
      ${g.caption ? `<span class="cap" aria-hidden="true">${esc(g.caption)}</span>` : ''}
    </button>`;
  }).join('')}</div>`;
}

function about(s, n) {
  const stats = (s.stats || []).filter((x) => x.value || x.label);
  return `<div class="story">
    ${s.image ? `<figure class="story-img reveal"><img src="${esc(asset(s.image))}" alt="${esc(s.imageAlt || '')}" loading="lazy" style="object-position:${focusPos(s.imageFocus)}"></figure>` : ''}
    <div>
      ${head(s, n)}
      <div class="story-body reveal">${paragraphs(s.body)}</div>
      ${stats.length ? `<ul class="stats">${stats.map((x, i) => `<li class="stat reveal" style="--i:${i}"><div><b>${esc(x.value)}</b><small>${esc(x.label)}</small></div></li>`).join('')}</ul>` : ''}
    </div>
  </div>`;
}

const ICONS = {
  mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v4M8 22h8"/>',
  keys: '<rect x="2" y="4" width="20" height="16" rx="1"/><path d="M7 13v7M12 13v7M17 13v7"/><path d="M5.5 4v9h3V4M10.5 4v9h3V4M15.5 4v9h3V4"/>',
  headphones: '<path d="M3 18v-6a9 9 0 0 1 18 0v6"/><path d="M21 19a2 2 0 0 1-2 2h-1v-6h3zM3 19a2 2 0 0 0 2 2h1v-6H3z"/>',
  guitar: '<path d="M14 10l6-6M18 2l4 4"/><path d="M14 10c-2-2-5-1-6 1-1 1.5-3 1-4.5 2.5-2 2-1.5 5.5 1 8s6 3 8 1c1.5-1.5 1-3.5 2.5-4.5 2-1 3-4 1-6z"/><circle cx="10" cy="14" r="1.5"/>',
  drum: '<ellipse cx="12" cy="8" rx="9" ry="3"/><path d="M3 8v8c0 1.7 4 3 9 3s9-1.3 9-3V8M7 2l4 6M17 2l-4 6"/>',
  pen: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/>',
  star: '<path d="M12 2l3 7 7 .6-5.3 4.7 1.6 7.2L12 17.8 5.7 21.5l1.6-7.2L2 9.6 9 9z"/>',
  note: '<circle cx="7" cy="18" r="3"/><circle cx="18" cy="16" r="3"/><path d="M10 18V5l11-2v13"/>',
};


function services(s) {
  return `<div class="services">${(s.items || []).map((x, i) => `
    <article class="service reveal" style="--i:${i}">
      <div class="ico"><svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[x.icon] || ICONS.note}</svg></div>
      <h3>${esc(x.title)}</h3>
      <p>${esc(x.text)}</p>
    </article>`).join('')}</div>`;
}

function quotes(s) {
  return `<div class="quotes">${(s.items || []).map((q, i) => `
    <figure class="bubble reveal" style="--i:${i}">
      <blockquote>${esc(q.quote)}</blockquote>
      <figcaption>${esc(q.by)}</figcaption>
    </figure>`).join('')}</div>`;
}

function textSection(s, n) {
  return `<div class="textsec ${s.image ? '' : 'noimg'}">
    <div>${head(s, n)}<div class="story-body reveal">${paragraphs(s.body)}</div></div>
    ${s.image ? `<img class="reveal" src="${esc(asset(s.image))}" alt="${esc(s.imageAlt || '')}" loading="lazy" style="object-position:${focusPos(s.imageFocus)}">` : ''}
  </div>`;
}

function contact(s, n) {
  const wa = String(s.whatsapp || '').replace(/[^\d]/g, '');
  const tel = String(s.phone || '').replace(/[^\d+]/g, '');
  const socials = (s.socials || []).filter((x) => x.label && /^https?:\/\//.test(x.url || ''));
  const canForm = s.formEndpoint || s.email;
  return `<div class="contact">
    <div>
      ${head({ ...s, intro: '' }, n)}
      ${s.text ? `<p class="contact-text reveal">${esc(s.text)}</p>` : ''}
      <div class="contact-actions reveal">
        ${s.email ? `<a class="btn" href="mailto:${esc(s.email)}">Email</a>
          <button class="btn ghost copy-email" type="button" data-email="${esc(s.email)}">Copy email</button>` : ''}
        ${wa ? `<a class="btn ghost" href="https://wa.me/${wa}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
        ${tel ? `<a class="btn ghost" href="tel:${esc(tel)}">Call</a>` : ''}
      </div>
      ${socials.length ? `<ul class="socials reveal">${socials.map((x) => `<li><a href="${esc(x.url)}" target="_blank" rel="noopener me">${esc(x.label)}</a></li>`).join('')}</ul>` : ''}
      ${s.image ? `<figure class="contact-img reveal"><img src="${esc(asset(s.image))}" alt="${esc(s.imageAlt || '')}" loading="lazy" style="object-position:${focusPos(s.imageFocus)}"></figure>` : ''}
    </div>
    ${canForm ? `<form class="form reveal" id="book-form" novalidate>
      <h3>Tell me your story</h3>
      <div class="row">
        <label>Your name<input type="text" name="name" autocomplete="name" required></label>
        <label>Your email<input name="email" type="email" autocomplete="email" required></label>
      </div>
      <div class="row">
        <label>Type of booking
          <select name="type">
            <option>Live show</option><option>Wedding or private event</option><option>Composing or scoring</option>
            <option>Session work</option><option>A custom song</option><option>Something else</option>
          </select>
        </label>
        <label>Date (if you know it)<input name="date" type="date"></label>
      </div>
      <label>The story<textarea name="message" required placeholder="Venue, city, budget, and the story behind it."></textarea></label>
      <input type="text" class="hp" name="_gotcha" tabindex="-1" autocomplete="off" aria-hidden="true">
      <button class="btn" type="submit">Send it</button>
      <p class="note" role="status"></p>
    </form>` : ''}
  </div>`;
}

function stave(i) {
  const rnd = mulberry32(i * 97);
  const glyphs = ['♪', '♫', '♩', '♬'];
  const notes = Array.from({ length: 5 }, (_, k) =>
    `<i class="reveal" style="--i:${k};left:${8 + k * 19 + rnd() * 8}%;top:${-14 + rnd() * 22}px">${glyphs[Math.floor(rnd() * 4)]}</i>`).join('');
  return `<div class="stave" aria-hidden="true">${notes}</div>`;
}

function footer(c) {
  const s = c.site || {};
  const line = `${s.tagline || ''} ♪ ${s.taglineKicker || ''} ♪ `;
  const run = `<span>${esc(line.repeat(3))}</span>`;
  return `
    <div class="marquee" aria-hidden="true"><div class="marquee-track">${run}${run}</div></div>
    <div class="foot-row">
      <span>© ${new Date().getFullYear()} ${esc(s.name)}. ${esc(s.tagline)} ${esc(s.taglineKicker)}</span>
      <a href="#top">Back to the intro ↑</a>
    </div>`;
}

function staff(sections) {
  return `<div class="lines"></div>
    ${sections.map((s, i) => `<a href="#${esc(s.id)}" data-id="${esc(s.id)}" title="${esc(s.nav || s.title)}">${pad(i + 1)}</a>`).join('')}
    <svg class="head" viewBox="0 0 40 52" aria-hidden="true"><use href="#note-glyph" fill="${C.amber}" color="${C.coral}"/></svg>`;
}

/* ---------------- Behaviour ---------------- */

function bootEffects() {
  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKey);
  document.addEventListener('submit', onSubmit);
  document.addEventListener('load', onImgLoad, true);
  addEventListener('scroll', wake, { passive: true });

  // Smooth wheel scrolling on desktop. Touch keeps the phone's own scrolling.
  if (window.Lenis && !reduced && !isPreview && matchMedia('(pointer: fine)').matches) {
    lenis = new window.Lenis({ lerp: .11, wheelMultiplier: .9, anchors: { offset: -12 }, autoRaf: true });
  }

  // Looping decorations stop while they are off screen.
  const idle = new IntersectionObserver((entries) => {
    entries.forEach((en) => en.target.classList.toggle('off', !en.isIntersecting));
  });
  ['#top', '#footer'].forEach((s) => $(s) && idle.observe($(s)));
  new ResizeObserver(measure).observe(document.body);
  // "click" only fires for a real tap. pointerdown also fires when a finger starts a scroll.
  document.addEventListener('click', (e) => {
    if (isPreview || !e.detail || e.target.closest('input, textarea, select, dialog')) return;
    burst(e.clientX, e.clientY);
  });

  let lastW = innerWidth;
  addEventListener('resize', () => {
    sizeFx();
    measure();
    // Phones fire resize when the address bar hides. The city redraws from the hero observer below.
    if (innerWidth !== lastW) lastW = innerWidth;
    placeStaff();
    wake();
  });

  const lb = $('#lightbox');
  lb.addEventListener('close', () => lenis?.start());
  // Swipe left or right to change photo. Two fingers means pinch zoom, so leave that alone.
  const touches = new Set();
  let startX = null;
  lb.addEventListener('pointerdown', (e) => {
    touches.add(e.pointerId);
    startX = touches.size === 1 && e.pointerType !== 'mouse' ? e.clientX : null;
  });
  const endSwipe = (e) => {
    touches.delete(e.pointerId);
    if (startX == null || e.type !== 'pointerup') { startX = null; return; }
    const dx = e.clientX - startX;
    startX = null;
    if (Math.abs(dx) > 50) stepLightbox(dx < 0 ? 1 : -1);
  };
  lb.addEventListener('pointerup', endSwipe);
  lb.addEventListener('pointercancel', endSwipe);
  lb.addEventListener('click', (e) => {
    if (e.target.closest('.lb-close') || e.target.classList.contains('lb-wrap')) lb.close();
    if (e.target.closest('.lb-prev')) stepLightbox(-1);
    if (e.target.closest('.lb-next')) stepLightbox(1);
  });

  sizeFx();
  if (!reduced && !isPreview) {
    const warm = () => SWISH_COLORS.forEach((c) => { noteSprite(c, true); noteSprite(c, false); });
    if ('requestIdleCallback' in window) requestIdleCallback(warm, { timeout: 3000 });
    else setTimeout(warm, 1500);
  }
}

// Redraw the city when the hero really changes size (width, or height by more than 2px),
// for example when late fonts reflow the text on a phone. Address-bar moves do not change it.
let heroObserver = null;
function watchHero() {
  heroObserver?.disconnect();
  const heroEl = $('#top');
  if (!heroEl) return;
  let pending = 0;
  heroObserver = new ResizeObserver(() => {
    const w = heroEl.clientWidth;
    const h = heroEl.clientHeight;
    if (!skyline.w || (Math.abs(w - skyline.w) < 1 && Math.abs(h - skyline.h) <= 2)) return;
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(drawSkyline);
  });
  heroObserver.observe(heroEl);
}

function refreshEffects() {
  layoutGalleries();
  watchHero();
  observeReveals();
  observeSections();
  const ready = document.fonts ? Promise.race([document.fonts.ready, wait(1500)]) : Promise.resolve();
  ready.then(() => {
    drawSkyline();
    if (!skyline.fontsOk) document.fonts?.ready.then(() => { if (!skyline.fontsOk) drawSkyline(); });
    placeStaff();
    measure();
    const note = $('.neon-note');
    if (note) {
      note.classList.add('lit');
      // Hand the tail over to the scroll position once the draw-on finishes.
      setTimeout(() => { note.classList.add('settled'); wake(); }, 1400);
    }
    wake();
  });
}

function onClick(e) {
  const pill = e.target.closest('.edit-pill');
  if (pill) {
    parent.postMessage({ type: 'deepan-edit', id: pill.dataset.edit }, location.origin);
    return;
  }
  const copy = e.target.closest('.copy-email');
  if (copy) return copyEmail(copy);

  const yt = e.target.closest('button.yt');
  if (yt) {
    // Only one video plays at a time: put the others back to their cover image.
    $$('.yt.playing').forEach(stopVideo);
    const player = document.createElement('div');
    player.className = 'yt playing';
    player.dataset.id = yt.dataset.id;
    player.dataset.title = yt.dataset.title;
    player.innerHTML = `<iframe src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(yt.dataset.id)}?autoplay=1&rel=0&modestbranding=1"
      title="${esc(yt.dataset.title)}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
    yt.replaceWith(player);
    return;
  }
  const shot = e.target.closest('.shot');
  if (shot) return openLightbox(+shot.dataset.g, +shot.dataset.i);

  const menu = e.target.closest('.menu-btn');
  const bar = $('#topbar');
  if (menu) {
    const open = bar.classList.toggle('open');
    menu.setAttribute('aria-expanded', open);
    return;
  }
  if (e.target.closest('.tracklist a')) bar.classList.remove('open');
}

function onKey(e) {
  const lb = $('#lightbox');
  if (lb.open) {
    if (e.key === 'ArrowLeft') stepLightbox(-1);
    if (e.key === 'ArrowRight') stepLightbox(1);
  }
}

function stopVideo(player) {
  const cover = document.createElement('button');
  cover.type = 'button';
  cover.className = 'yt';
  cover.dataset.id = player.dataset.id;
  cover.dataset.title = player.dataset.title;
  cover.setAttribute('aria-label', `Play ${player.dataset.title}`);
  cover.innerHTML = `<img src="https://i.ytimg.com/vi/${encodeURIComponent(player.dataset.id)}/hqdefault.jpg" alt="">
    <span class="play"><svg viewBox="0 0 24 24"><path d="M5 3l16 9-16 9z"/></svg></span>`;
  player.replaceWith(cover);
}

async function copyEmail(btn) {
  const email = btn.dataset.email;
  try {
    await navigator.clipboard.writeText(email);
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = 'Copy email'; }, 2000);
  } catch {
    // No clipboard access: show the address selected, so the visitor can copy it by hand.
    btn.textContent = email;
    const range = document.createRange();
    range.selectNodeContents(btn);
    getSelection().removeAllRanges();
    getSelection().addRange(range);
  }
}

// YouTube serves a 120px grey stub (not an error) when no maxres thumbnail exists.
function onImgLoad(e) {
  const img = e.target;
  // Photos saved before aspect ratios were stored: measure once, then the row settles.
  const shot = img.tagName === 'IMG' && img.closest?.('.shot');
  if (shot && !shot.style.getPropertyValue('--ar') && img.naturalWidth) {
    shot.style.setProperty('--ar', (img.naturalWidth / img.naturalHeight).toFixed(3));
    layoutSoon(shot.closest('.gallery'));
  }
  if (img.tagName === 'IMG' && img.hasAttribute('data-maxres') && img.naturalWidth <= 120) {
    img.removeAttribute('data-maxres');
    img.src = img.src.replace('maxresdefault', 'hqdefault');
  }
}

let lbState = { g: 0, i: 0 };
function openLightbox(g, i) {
  lbState = { g, i };
  showLightbox();
  $('#lightbox').showModal();
  lenis?.stop();
}
function stepLightbox(d) {
  const n = galleries[lbState.g].length;
  lbState.i = (lbState.i + d + n) % n;
  showLightbox();
}
function showLightbox() {
  const item = galleries[lbState.g][lbState.i];
  const lb = $('#lightbox');
  const src = asset(item.src);
  $('img', lb).src = src;
  $('img', lb).alt = item.alt || item.caption || '';
  $('figcaption', lb).innerHTML = `${esc(item.caption || '')} <a href="${esc(src)}" target="_blank" rel="noopener">Full size</a>`;
  const list = galleries[lbState.g];
  [1, -1].forEach((d) => { new Image().src = asset(list[(lbState.i + d + list.length) % list.length].src); });
}

async function onSubmit(e) {
  const form = e.target.closest('#book-form');
  if (!form) return;
  e.preventDefault();
  const note = $('.note', form);
  const data = Object.fromEntries(new FormData(form));
  if (data._gotcha) return;
  if (!data.name || !data.email || !data.message) {
    note.textContent = 'Please add your name, email and the story.';
    return;
  }
  const c = (content.sections || []).find((s) => s.type === 'contact') || {};
  const subject = `${data.type} enquiry from ${data.name}`;
  const body = `Name: ${data.name}\nEmail: ${data.email}\nType: ${data.type}\nDate: ${data.date || 'not set'}\n\n${data.message}`;
  if (/^https:\/\//.test(c.formEndpoint || '')) {
    note.textContent = 'Sending...';
    try {
      const res = await fetch(c.formEndpoint, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, _subject: subject }),
      });
      if (!res.ok) throw new Error(res.status);
      form.reset();
      note.textContent = 'Sent. Expect a reply soon.';
    } catch {
      note.textContent = c.email ? `That did not send. Email ${c.email} instead.` : 'That did not send. Please try again.';
    }
    return;
  }
  location.href = `mailto:${c.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  note.textContent = 'Your email app should open with the message ready to send.';
}

let revealObs;
function observeReveals() {
  revealObs?.disconnect();
  const els = $$('.reveal');
  if (reduced || !('IntersectionObserver' in window)) {
    els.forEach((el) => el.classList.add('in'));
    return;
  }
  revealObs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (en.isIntersecting) {
        en.target.classList.add('in');
        revealObs.unobserve(en.target);
      }
    }
  }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
  els.forEach((el) => revealObs.observe(el));
}

let secObs;
function observeSections() {
  secObs?.disconnect();
  secObs = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const id = en.target.id;
      $$('.tracklist a, .staff a').forEach((a) => a.classList.toggle('on', a.dataset.id === id));
    }
  }, { rootMargin: '-45% 0px -50% 0px' });
  $$('.sec').forEach((s) => secObs.observe(s));
}

function placeStaff() {
  const doc = document.documentElement.scrollHeight - innerHeight;
  $$('.staff a').forEach((a) => {
    const sec = document.getElementById(a.dataset.id);
    if (sec) a.style.top = `${Math.min(100, (sec.offsetTop / Math.max(1, doc)) * 100)}%`;
  });
  // Markers stay invisible until they have their places, so they never jump on screen.
  $('#staff')?.classList.add('placed');
}

/* ---------------- Gallery rows ---------------- */

// Balanced justified rows. Every way of cutting the photos into rows is scored by how far
// each row's height lands from the target, and the best one wins. Featured photos split
// the run and take a row of their own.
const rowObserver = new ResizeObserver((entries) => entries.forEach((en) => layoutGallery(en.target)));
const laidWidth = new WeakMap();

function layoutGalleries() {
  $$('.gallery').forEach((g) => {
    laidWidth.delete(g);
    layoutGallery(g);
    rowObserver.observe(g);
  });
}

const pendingLayout = new Set();
function layoutSoon(g) {
  if (!g || pendingLayout.has(g)) return;
  pendingLayout.add(g);
  requestAnimationFrame(() => {
    pendingLayout.delete(g);
    laidWidth.delete(g);
    layoutGallery(g);
  });
}

function layoutGallery(g) {
  // clientWidth rounds (1177.6 reads as 1178), and a row that is half a pixel too wide wraps.
  // Use the exact width and keep 1px spare; the last photo in each row takes up the slack.
  const exact = g.getBoundingClientRect().width;
  if (!exact || laidWidth.get(g) === exact) return;
  laidWidth.set(g, exact);
  const W = exact - 1;
  const gap = parseFloat(getComputedStyle(g).columnGap) || 16;
  const target = W >= 1000 ? 270 : W >= 700 ? 220 : W >= 420 ? 170 : 130;
  const shots = $$('.shot', g);
  const ar = (s) => parseFloat(s.style.getPropertyValue('--ar')) || 1.4;

  let run = [];
  const flush = () => {
    placeRun(run, W, gap, target, ar);
    run = [];
  };
  shots.forEach((s) => {
    s.classList.remove('row-end');
    if (s.classList.contains('big')) {
      flush();
      s.style.removeProperty('--w');
    } else {
      run.push(s);
    }
  });
  flush();
  g.classList.add('laid');
}

function placeRun(items, W, gap, target, ar) {
  const n = items.length;
  if (!n) return;
  const ratios = items.map(ar);
  const rowHeight = (i, j) => {
    let sum = 0;
    for (let k = i; k < j; k++) sum += ratios[k];
    return (W - gap * (j - i - 1)) / sum;
  };
  // best[j]: lowest cost for the first j photos; cut[j]: where the last row starts.
  const best = [0];
  const cut = [0];
  for (let j = 1; j <= n; j++) {
    best[j] = Infinity;
    for (let i = Math.max(0, j - 6); i < j; i++) {
      const h = rowHeight(i, j);
      // A final row may stay short instead of being stretched huge, but an almost empty
      // one (a lone orphan photo) costs more than evening out the rows above it.
      const cost = j === n && h > target
        ? .3 * (1 - (W * target) / (h * W)) ** 2
        : ((h - target) / target) ** 2;
      if (best[i] + cost < best[j]) {
        best[j] = best[i] + cost;
        cut[j] = i;
      }
    }
  }
  const rows = [];
  for (let j = n; j > 0; j = cut[j]) rows.unshift([cut[j], j]);
  rows.forEach(([i, j], r) => {
    const last = r === rows.length - 1;
    const full = rowHeight(i, j);
    const h = last && full > target ? target : full;
    for (let k = i; k < j; k++) {
      // Floor the widths so rounding never pushes a photo to the next line.
      items[k].style.setProperty('--w', `${Math.floor(ratios[k] * h * 100) / 100}px`);
    }
    // The last photo of a full row soaks up the leftover fraction of a pixel.
    if (!(last && full > target)) items[j - 1].classList.add('row-end');
  });
}

/* ---------------- Mumbattan skyline ---------------- */

const LAYERS = {
  far: { frac: .6, seed: 11, minH: .4, maxH: 1, wMin: 40, wMax: 120, fringe: 'rgba(253,131,38,.35)', fill: 'rgba(211,39,41,.5)', ink: null, windows: 0, hatch: 0, domes: .3, cyber: 'far' },
  mid: { frac: .45, seed: 23, minH: .3, maxH: .95, wMin: 36, wMax: 110, fringe: 'rgba(244,84,94,.55)', fill: C.plum, ink: C.night, windows: .22, hatch: .22, domes: .35, cyber: 'mid' },
  near: { frac: .3, seed: 37, minH: .35, maxH: 1, wMin: 50, wMax: 150, fringe: 'rgba(244,84,94,.7)', fill: C.night, ink: C.ink, windows: .3, hatch: .3, domes: .3, boards: true, flyover: true, wires: true, cyber: 'near' },
};

const skyline = { fontsOk: false, w: 0, h: 0 };

function drawSkyline() {
  const heroEl = $('#top');
  if (!heroEl) return;
  skyline.fontsOk = !document.fonts || document.fonts.status === 'loaded';
  skyline.w = heroEl.clientWidth;
  skyline.h = heroEl.clientHeight;
  const w = heroEl.clientWidth;
  const H = heroEl.clientHeight;
  const dpr = Math.min(devicePixelRatio || 1, lite ? 1.25 : 2);
  const sc = Math.max(.55, Math.min(1.2, w / 1400));
  const boards = content?.site?.billboards?.length ? content.site.billboards : ['♪'];
  $$('.skyline canvas', heroEl).forEach((cv) => {
    const L = LAYERS[cv.dataset.layer];
    // CSS sizes the canvas as a share of the hero from the first frame; only read it here.
    const h = Math.round(cv.clientHeight || H * L.frac);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    paintLayer(ctx, w, h, sc, L, boards);
  });
}

function paintLayer(ctx, w, h, sc, L, boards) {
  const rnd = mulberry32(L.seed);
  const blds = [];
  let x = -20 * sc;
  while (x < w + 20) {
    const bw = (L.wMin + rnd() * (L.wMax - L.wMin)) * sc;
    const t = x / w;
    // Keep the middle low so the copy reads; let the edges climb.
    const profile = .62 + .38 * Math.min(1, Math.abs(t - .42) * 2.2);
    const bh = h * (L.minH + rnd() * (L.maxH - L.minH)) * profile;
    const r = rnd();
    const kind = r < L.domes ? 'dome' : r < L.domes + .12 ? 'minaret' : r < L.domes + .45 ? 'tower' : 'block';
    blds.push(building(x, bw, Math.min(bh, h - 8), kind, h, sc, rnd));
    x += bw * (.72 + rnd() * .38);
  }

  // Off-register fill: a colour plate slipped a few pixels left of the ink.
  ctx.save();
  ctx.translate(-4 * sc, 1);
  ctx.fillStyle = L.fringe;
  blds.forEach((b) => ctx.fill(b.path));
  ctx.restore();

  ctx.fillStyle = L.fill;
  blds.forEach((b) => ctx.fill(b.path));

  if (L.hatch) {
    ctx.strokeStyle = `rgba(20,4,16,${L.hatch})`;
    ctx.lineWidth = 1;
    blds.forEach((b) => {
      ctx.save();
      ctx.clip(b.path);
      ctx.beginPath();
      for (let k = b.x + b.w * .5; k < b.x + b.w + h; k += 6 * sc) {
        ctx.moveTo(k, b.top - 60);
        ctx.lineTo(k - h, b.top - 60 + h);
      }
      ctx.stroke();
      ctx.restore();
    });
  }

  if (L.windows) {
    ctx.save();
    if (L.cyber) {
      ctx.shadowColor = C.amber;
      ctx.shadowBlur = lite ? 3 : 6;
    }
    blds.forEach((b) => {
      const ww = 4 * sc + 1;
      const wh = 6 * sc + 1;
      for (let wy = b.bodyTop + 10 * sc; wy < h - 10; wy += wh * 2.1) {
        for (let wx = b.x + 6 * sc; wx < b.x + b.w - 8 * sc; wx += ww * 2.4) {
          if (rnd() < L.windows) {
            ctx.fillStyle = rnd() < .7 ? C.amber : C.blush;
            ctx.fillRect(wx, wy, ww, wh);
          }
        }
      }
    });
    ctx.restore();
  }

  if (L.ink) {
    ctx.strokeStyle = L.ink;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    blds.forEach((b) => ctx.stroke(b.path));
    blds.forEach((b) => b.finial && (ctx.beginPath(), ctx.moveTo(...b.finial[0]), ctx.lineTo(...b.finial[1]), ctx.stroke()));
  }

  if (L.wires) {
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 1.2;
    for (let i = 0; i < blds.length - 3; i += 3) {
      const a = blds[i];
      const b = blds[i + 2];
      const ax = a.x + a.w * .8, ay = a.top + 8;
      const bx = b.x + b.w * .2, by = b.top + 8;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.quadraticCurveTo((ax + bx) / 2, Math.max(ay, by) + 30 * sc, bx, by);
      ctx.stroke();
    }
  }

  if (L.boards) {
    let k = 0;
    blds.forEach((b, i) => {
      if (i % 4 !== 1 || b.kind === 'dome' || b.kind === 'minaret') return;
      const text = boards[k++ % boards.length];
      const bw = Math.max(54 * sc, b.w * .85);
      const bh = 26 * sc;
      const bx = b.x + (b.w - bw) / 2;
      const by = b.top - bh - 8 * sc;
      ctx.fillStyle = C.ink;
      ctx.fillRect(bx + bw * .2, by + bh, 2, 8 * sc);
      ctx.fillRect(bx + bw * .8, by + bh, 2, 8 * sc);
      const lit = k % 2 ? C.amber : C.blush;
      withGlow(ctx, lit, 18, () => {
        ctx.fillStyle = lit;
        ctx.fillRect(bx, by, bw, bh);
      });
      ctx.strokeStyle = C.ink;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx, by, bw, bh);
      ctx.fillStyle = C.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const devanagari = /[ऀ-ॿ]/.test(text);
      ctx.font = `${Math.round(bh * (devanagari ? .62 : .8))}px ${devanagari ? "'Rozha One'" : "'Bangers'"}, sans-serif`;
      ctx.fillText(text, bx + bw / 2, by + bh / 2 + (devanagari ? 2 : 1), bw - 8);
      // Screen scanlines.
      ctx.fillStyle = 'rgba(20,4,16,.16)';
      for (let sy = by + 2; sy < by + bh - 1; sy += 3) ctx.fillRect(bx + 1, sy, bw - 2, 1);
    });
  }

  if (L.flyover) {
    const y = h * .7;
    const x0 = w * .02, x1 = w * .58;
    ctx.fillStyle = C.ink;
    for (let px = x0 + 30; px < x1; px += 110 * sc) ctx.fillRect(px, y, 10 * sc, h - y);
    ctx.save();
    ctx.translate(-3 * sc, 1);
    ctx.fillStyle = 'rgba(244,84,94,.7)';
    ctx.fillRect(x0, y - 12 * sc, x1 - x0, 14 * sc);
    ctx.restore();
    ctx.fillStyle = C.night;
    ctx.fillRect(x0, y - 12 * sc, x1 - x0, 14 * sc);
    ctx.strokeStyle = C.ink;
    ctx.lineWidth = 2;
    ctx.strokeRect(x0, y - 12 * sc, x1 - x0, 14 * sc);
    for (let cx = x0 + 20; cx < x1 - 20; cx += 26 + rnd() * 60) {
      const col = rnd() < .5 ? C.amber : C.coral;
      withGlow(ctx, col, 10, () => {
        ctx.fillStyle = col;
        ctx.fillRect(cx, y - 17 * sc, 12 * sc, 4 * sc);
      });
    }
  }

  if (L.cyber) cyberPass(ctx, w, h, sc, L, blds, boards);
}

/* ---------------- Cyberpunk pass ----------------
   Drawn on top of the comic city with its own random seed, so the buildings,
   domes and billboards stay where they were. Neon uses the palette only. */

const NEON = [C.coral, C.amber, C.blush];

function withGlow(ctx, color, blur, draw) {
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = lite ? blur * .6 : blur;
  draw();
  ctx.restore();
}

function cyberPass(ctx, w, h, sc, L, blds, boards) {
  const rnd = mulberry32(L.seed + 991);
  const pick = (list) => list[Math.floor(rnd() * list.length)];
  const tallest = [...blds].sort((a, b) => a.top - b.top);

  if (L.cyber === 'far') {
    // Searchlights sweeping up from the streets.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    [.12, .5, .86].forEach((fx, i) => {
      const bx = w * fx;
      const ang = (i - 1) * .35 + (rnd() - .5) * .3;
      const len = h * 1.1;
      const tx = bx + Math.sin(ang) * len;
      const ty = h - Math.cos(ang) * len;
      const grad = ctx.createLinearGradient(bx, h, tx, ty);
      grad.addColorStop(0, 'rgba(253,131,38,.42)');
      grad.addColorStop(1, 'rgba(253,131,38,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(bx - 3 * sc, h);
      ctx.lineTo(tx - 70 * sc, ty);
      ctx.lineTo(tx + 70 * sc, ty);
      ctx.lineTo(bx + 3 * sc, h);
      ctx.closePath();
      ctx.fill();
    });
    ctx.restore();

    // Sky traffic: flying cars in two lanes, each a glowing head with a fading tail.
    [[.34, -.02], [.46, .015]].forEach(([lane, slope]) => {
      // Right half only, so no streak crosses the intro text.
      for (let x = w * .5 + rnd() * 80 * sc; x < w; x += (70 + rnd() * 130) * sc) {
        const y = h * lane + slope * x + (rnd() - .5) * 6;
        const dir = rnd() < .5 ? 1 : -1;
        const len = (30 + rnd() * 40) * sc;
        const col = pick(NEON);
        const tail = ctx.createLinearGradient(x, y, x - dir * len, y - dir * slope * len);
        tail.addColorStop(0, col);
        tail.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.strokeStyle = tail;
        ctx.lineWidth = 2.4 * sc;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - dir * len, y - dir * slope * len);
        ctx.stroke();
        withGlow(ctx, col, 8, () => {
          ctx.fillStyle = C.core;
          ctx.fillRect(x - 2.5 * sc, y - 1.6 * sc, 5 * sc, 3.2 * sc);
        });
      }
    });

    // Neon haze hanging over the rooftops.
    const haze = ctx.createLinearGradient(0, h * .35, 0, h);
    haze.addColorStop(0, 'rgba(245,145,146,0)');
    haze.addColorStop(.6, 'rgba(244,84,94,.16)');
    haze.addColorStop(1, 'rgba(253,131,38,.22)');
    ctx.fillStyle = haze;
    ctx.fillRect(0, h * .35, w, h * .65);

    // Light strips up the tower faces.
    blds.forEach((b) => {
      if (rnd() > .5) return;
      const sx = b.x + b.w * (.25 + rnd() * .5);
      withGlow(ctx, C.blush, 6, () => {
        ctx.strokeStyle = 'rgba(245,145,146,.9)';
        ctx.lineWidth = 1.8 * sc;
        ctx.beginPath();
        ctx.moveTo(sx, b.bodyTop + 6 * sc);
        ctx.lineTo(sx, h);
        ctx.stroke();
      });
    });

    // Beacons on the tallest towers.
    tallest.slice(0, 7).forEach((b) => {
      const mx = b.x + b.w * .5;
      const my = b.top - 22 * sc;
      ctx.strokeStyle = 'rgba(37,9,28,.8)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(mx, b.top);
      ctx.lineTo(mx, my);
      ctx.stroke();
      withGlow(ctx, C.coral, 12, () => {
        ctx.fillStyle = C.core;
        ctx.beginPath();
        ctx.arc(mx, my, 3 * sc, 0, Math.PI * 2);
        ctx.fill();
      });
    });
  }

  if (L.cyber === 'mid' || L.cyber === 'near') {
    // Neon along some rooftops.
    blds.forEach((b) => {
      if (b.kind === 'dome' || b.kind === 'minaret' || rnd() > (L.cyber === 'near' ? .3 : .4)) return;
      const col = pick(NEON);
      withGlow(ctx, col, 10, () => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.6 * sc;
        ctx.beginPath();
        ctx.moveTo(b.x + 2, b.bodyTop + 3 * sc);
        ctx.lineTo(b.x + b.w - 2, b.bodyTop + 3 * sc);
        ctx.stroke();
      });
    });

    // Hanging vertical neon signs.
    const words = [...boards.filter((t) => /^[A-Z0-9 !?&]+$/i.test(t)), 'OPEN', '24H', 'RADIO', 'LIVE'];
    blds.forEach((b) => {
      if (b.kind === 'dome' || b.kind === 'minaret' || b.w < 36 * sc || rnd() > (L.cyber === 'near' ? .4 : .35)) return;
      const word = pick(words).toUpperCase().slice(0, 6);
      const col = pick(NEON);
      const fs = (L.cyber === 'near' ? 16 : 12) * sc;
      const sw = fs * 1.5;
      const sh = word.length * fs * 1.05 + fs * .9;
      const sx = rnd() < .5 ? b.x - sw * .35 : b.x + b.w - sw * .65;
      const sy = b.bodyTop + (10 + rnd() * 20) * sc;
      if (sy + sh > h - 6) return;
      ctx.fillStyle = C.ink;
      ctx.fillRect(sx, sy, sw, sh);
      withGlow(ctx, col, 16, () => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2.2 * sc;
        ctx.strokeRect(sx + 1.5, sy + 1.5, sw - 3, sh - 3);
        ctx.fillStyle = C.core;
        ctx.font = `${Math.round(fs)}px 'Bangers', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        [...word].forEach((ch, i) => ctx.fillText(ch, sx + sw / 2, sy + fs * .95 + i * fs * 1.05));
      });
    });
  }

  if (L.cyber === 'mid') {
    const marks = ['♪', 'DJ', '♫', 'HI-FI', 'BEAT'];
    blds.forEach((b) => {
      if (b.kind === 'dome' || b.kind === 'minaret' || b.w < 50 * sc || rnd() > .3) return;
      const text = pick(marks);
      const col = pick(NEON);
      const fs = 13 * sc;
      const bw = Math.min(b.w * .8, Math.max(30 * sc, text.length * fs * .75 + 12 * sc));
      const bx = b.x + (b.w - bw) / 2;
      const by = b.bodyTop + (6 + rnd() * 24) * sc;
      if (by + fs * 1.6 > h - 6) return;
      ctx.fillStyle = C.ink;
      ctx.fillRect(bx, by, bw, fs * 1.6);
      withGlow(ctx, col, 16, () => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 2 * sc;
        ctx.strokeRect(bx + 2, by + 2, bw - 4, fs * 1.6 - 4);
        ctx.fillStyle = C.core;
        ctx.font = `${Math.round(fs)}px 'Bangers', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + bw / 2, by + fs * .85, bw - 6);
      });
    });
  }

  if (L.cyber === 'near') {
    // String lights along the wires (same curves as the wires above).
    for (let i = 0; i < blds.length - 3; i += 3) {
      const a = blds[i];
      const b = blds[i + 2];
      const ax = a.x + a.w * .8, ay = a.top + 8;
      const bx = b.x + b.w * .2, by = b.top + 8;
      const cx = (ax + bx) / 2, cy = Math.max(ay, by) + 30 * sc;
      const col = pick(NEON);
      withGlow(ctx, col, 7, () => {
        ctx.fillStyle = col;
        for (let t = .08; t < .95; t += .12) {
          const u = 1 - t;
          const px = u * u * ax + 2 * u * t * cx + t * t * bx;
          const py = u * u * ay + 2 * u * t * cy + t * t * by;
          ctx.beginPath();
          ctx.arc(px, py + 2, 1.5 * sc, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }
  }
}


function building(x, bw, bh, kind, ground, sc, rnd) {
  const p = new Path2D();
  const top = ground - bh;
  let bodyTop = top;
  let finial = null;
  if (kind === 'dome') {
    const dh = Math.min(bw * .75, bh * .45);
    bodyTop = top + dh;
    p.rect(x, bodyTop, bw, ground - bodyTop);
    p.moveTo(x + bw * .08, bodyTop);
    p.bezierCurveTo(x - bw * .04, bodyTop - dh * .55, x + bw * .34, bodyTop - dh * .82, x + bw * .5, top);
    p.bezierCurveTo(x + bw * .66, bodyTop - dh * .82, x + bw * 1.04, bodyTop - dh * .55, x + bw * .92, bodyTop);
    p.closePath();
    finial = [[x + bw * .5, top], [x + bw * .5, top - 14 * sc]];
    // Small corner chhatris.
    if (bw > 60 * sc) {
      [x + bw * .1, x + bw * .9].forEach((cx) => {
        p.moveTo(cx - 8 * sc, bodyTop + 2);
        p.quadraticCurveTo(cx, bodyTop - 18 * sc, cx + 8 * sc, bodyTop + 2);
        p.closePath();
      });
    }
  } else if (kind === 'minaret') {
    const mw = Math.max(12 * sc, bw * .3);
    const mx = x + (bw - mw) / 2;
    const cap = mw * .9;
    bodyTop = top + cap;
    p.rect(mx, bodyTop, mw, ground - bodyTop);
    p.rect(mx - 3 * sc, bodyTop + bh * .25, mw + 6 * sc, 5 * sc);
    p.moveTo(mx - 2 * sc, bodyTop);
    p.quadraticCurveTo(mx + mw / 2, top - cap * .4, mx + mw + 2 * sc, bodyTop);
    p.closePath();
    finial = [[mx + mw / 2, top + cap * .2], [mx + mw / 2, top - 10 * sc]];
    return { path: p, x: mx, w: mw, top, bodyTop, kind, finial };
  } else if (kind === 'tower') {
    const slant = rnd() < .5 ? bw * .25 : 0;
    p.moveTo(x, ground);
    p.lineTo(x, top + slant);
    p.lineTo(x + bw, top);
    p.lineTo(x + bw, ground);
    p.closePath();
    bodyTop = top + slant;
    finial = [[x + bw * .7, top + 2], [x + bw * .7, top - 26 * sc]];
  } else {
    p.rect(x, top, bw, bh);
    if (rnd() < .45) {
      // Rooftop water tank on legs, a Mumbai staple.
      const tw = Math.min(26 * sc, bw * .35);
      const tx = x + bw * (.15 + rnd() * .4);
      p.rect(tx, top - 16 * sc, tw, 11 * sc);
      p.rect(tx + 2, top - 5 * sc, 2, 5 * sc);
      p.rect(tx + tw - 4, top - 5 * sc, 2, 5 * sc);
    } else if (rnd() < .5) {
      p.rect(x + bw * .2, top - bh * .12, bw * .6, bh * .12);
    }
  }
  return { path: p, x, w: bw, top, bodyTop, kind, finial };
}

/* ---------------- Scroll loop, background swishes, click bursts ---------------- */

// Two canvases: swishes sit behind the content, so they never cover text or videos.
// Only the short click burst draws on top.
const fx = { bg: null, top: null, w: 0, h: 0, dpr: 1 };
const swishes = [];
const sparks = [];
const bursts = [];
const SWISH_COLORS = [C.amber, C.coral, C.blush];
const MAX_SWISH = lite ? 1 : 2;
const SPAWN_GAP = lite ? 1200 : 650;
const SWISH_ALPHA = .6;
let running = false;
let lastY = scrollY;
let travelled = 0;
let idleAt = 0;

function sizeFx() {
  const dpr = Math.min(devicePixelRatio || 1, lite ? 1 : 1.5);
  if (dpr !== fx.dpr) sprites.clear();
  fx.dpr = dpr;
  fx.w = innerWidth;
  fx.h = innerHeight;
  for (const key of ['bg', 'top']) {
    const cv = $(key === 'bg' ? '#fx' : '#fx-top');
    if (!cv) continue;
    cv.width = Math.round(fx.w * fx.dpr);
    cv.height = Math.round(fx.h * fx.dpr);
    fx[key] = cv.getContext('2d');
    fx[key].setTransform(fx.dpr, 0, 0, fx.dpr, 0, 0);
  }
}

function wake() {
  if (running) return;
  running = true;
  idleAt = performance.now();
  requestAnimationFrame(tick);
}

function tick(now) {
  const y = scrollY;
  const dy = y - lastY;
  lastY = y;
  if (dy) idleAt = now;

  scrollBound(y);
  tuckBar(y, dy);

  if (!reduced && fx.bg) {
    travelled += Math.abs(dy);
    if (travelled > SPAWN_GAP && swishes.length < MAX_SWISH) {
      travelled = 0;
      launchSwish(Math.sign(dy) || 1);
    }
    drawFx(now);
  }

  if (swishes.length || sparks.length || bursts.length || now - idleAt < 160) {
    requestAnimationFrame(tick);
  } else {
    running = false;
    fx.bg?.clearRect(0, 0, fx.w, fx.h);
    fx.top?.clearRect(0, 0, fx.w, fx.h);
  }
}

function tuckBar(y, dy) {
  const bar = $('#topbar');
  if (!bar || !dy) return;
  const keep = y < 80 || bar.classList.contains('open') || bar.contains(document.activeElement);
  if (keep || dy < -4) bar.classList.remove('tuck');
  else if (dy > 4) bar.classList.add('tuck');
}

// Sizes are measured on resize and load, never inside the scroll loop (that forces layout every frame).
const dims = { doc: 1, hero: 1, staff: 1 };
function measure() {
  dims.doc = Math.max(1, document.documentElement.scrollHeight - innerHeight);
  dims.hero = $('#top')?.offsetHeight || innerHeight;
  dims.staff = $('#staff')?.offsetHeight || 1;
}

let barScrolled = null;
function scrollBound(y) {
  const scrolled = y > 40;
  if (scrolled !== barScrolled) {
    barScrolled = scrolled;
    $('#topbar')?.classList.toggle('scrolled', scrolled);
  }
  if (cssScroll || reduced) return;

  // Fallback for browsers without scroll-driven animations.
  const headEl = $('.staff .head');
  if (headEl) headEl.style.transform = `translate3d(0, ${(y / dims.doc) * dims.staff}px, 0)`;
  const H = dims.hero;
  const heroEl = $('#top');
  if (heroEl && y < H * 1.1) {
    $$('[data-depth]', heroEl).forEach((el) => { el.style.transform = `translate3d(0, ${y * el.dataset.depth}px, 0)`; });
    const p = Math.min(1, y / (H * .55));
    const fly = $('.note-fly', heroEl);
    if (fly) fly.style.transform = `translate3d(${p * -40}px, ${p * -H * .28}px, 0) rotate(${p * -18}deg) scale(${1 + p * .15})`;
  }
  $$('.vinyl').forEach((v) => { v.style.transform = `rotate(${y * .25}deg)`; });
}

function launchSwish(dir) {
  if (reduced || !fx.bg) return;
  const w = fx.w, h = fx.h;
  const fromLeft = Math.random() < .5;
  const sx = fromLeft ? -.08 * w : 1.08 * w;
  const ex = fromLeft ? (.75 + Math.random() * .4) * w : (.25 - Math.random() * .4) * w;
  let sy = (.62 + Math.random() * .3) * h;
  let ey = (.04 + Math.random() * .3) * h;
  if (dir < 0) { sy = h - sy; ey = h - ey; }
  const bend = (Math.random() - .5) * h * .9;
  swishes.push({
    p: [[sx, sy], [sx + (ex - sx) * .33, sy - bend], [sx + (ex - sx) * .66, ey + bend], [ex, ey]],
    born: performance.now(),
    dur: 1000 + Math.random() * 400,
    color: SWISH_COLORS[Math.floor(Math.random() * SWISH_COLORS.length)],
    width: (2.2 + Math.random() * 1.2) * (lite ? .8 : 1),
    emitted: 0,
    beamed: Math.random() < .5,
  });
  wake();
}

function bez(p, t) {
  const u = 1 - t;
  return [
    u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
    u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
  ];
}

const easeOut = (t) => 1 - Math.pow(1 - t, 3);

function drawFx(now) {
  const ctx = fx.bg;
  ctx.clearRect(0, 0, fx.w, fx.h);
  ctx.globalCompositeOperation = 'lighter';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let i = swishes.length - 1; i >= 0; i--) {
    const s = swishes[i];
    const t = (now - s.born) / s.dur;
    const headT = easeOut(Math.min(1, t));
    const tailT = easeOut(Math.max(0, Math.min(1, (t - .28) / .9)));
    if (tailT >= .999) { swishes.splice(i, 1); continue; }

    // Tapered ribbon: thin at the tail, full width at the head.
    const N = 24;
    const pts = [];
    for (let k = 0; k <= N; k++) pts.push(bez(s.p, tailT + (headT - tailT) * (k / N)));
    for (let seg = 0; seg < 4; seg++) {
      neonLine(ctx, pts.slice(seg * 6, seg * 6 + 7), s.color, s.width * (.35 + seg * .22), SWISH_ALPHA);
    }

    const [hx, hy] = pts[N];
    const [px, py] = pts[N - 2];
    if (headT < 1) drawSprite(ctx, noteSprite(s.color, s.beamed), hx, hy, Math.atan2(hy - py, hx - px) + Math.PI / 2, 64, SWISH_ALPHA);

    const due = Math.floor(headT * 2);
    while (s.emitted < due) {
      s.emitted++;
      sparks.push({
        x: hx, y: hy, vx: (Math.random() - .5) * .9, vy: -.4 - Math.random() * .8,
        rot: Math.random() * 6, vr: (Math.random() - .5) * .04,
        born: now, life: 1100 + Math.random() * 700,
        color: SWISH_COLORS[Math.floor(Math.random() * 3)], size: .6 + Math.random() * .5, beamed: Math.random() < .35,
      });
    }
  }
  drawFloaters(ctx, sparks, now, 1, SWISH_ALPHA);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;

  const top = fx.top;
  if (top) {
    top.clearRect(0, 0, fx.w, fx.h);
    top.lineCap = 'round';
    drawBursts(top, now);
    top.globalAlpha = 1;
  }
}

// Tap: one fluorescent note ignites like the swish.jpeg sign, a faint ripple spreads,
// and a few small notes scatter. All of it is gone in under a second.
function burst(x, y) {
  if (reduced || !fx.top) return;
  const now = performance.now();
  // Lift the note above the finger so a thumb does not hide it.
  const ny = y - 26;
  bursts.push({ kind: 'ring', x, y, born: now, life: 480, color: C.amber });
  bursts.push({ kind: 'ring', x, y, born: now + 70, life: 480, color: C.coral });
  bursts.push({
    kind: 'hero', x, y: ny, born: now, life: 720, color: C.coral, beamed: true,
    rot: (Math.random() - .5) * .5, drift: (Math.random() - .5) * 26,
  });
  const n = lite ? 2 : 4;
  for (let k = 0; k < n; k++) {
    bursts.push({
      kind: 'spark', x, y: ny, born: now + 40, life: 560 + Math.random() * 120,
      color: SWISH_COLORS[(k + 1) % 3], beamed: false,
      a: -Math.PI / 2 + (k - (n - 1) / 2) * .9 + (Math.random() - .5) * .4,
      dist: 40 + Math.random() * 30, rot: (Math.random() - .5) * .8, spin: (Math.random() - .5) * 1.6,
    });
  }
  wake();
}

// A neon sign switching on: two quick drop-outs, then steady.
function flicker(ms) {
  if (ms < 40) return 1;
  if (ms < 70) return .2;
  if (ms < 110) return 1;
  if (ms < 140) return .45;
  return 1;
}

function drawBursts(ctx, now) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i];
    const ms = now - b.born;
    const age = ms / b.life;
    if (age < 0) continue;
    if (age >= 1) { bursts.splice(i, 1); continue; }
    const e = easeOut(age);
    if (b.kind === 'ring') {
      const r = 6 + 44 * e;
      const a = (1 - age) * .5;
      for (const [lw, k] of [[7, .22], [1.6, 1]]) {
        ctx.globalAlpha = a * k;
        ctx.strokeStyle = b.color;
        ctx.lineWidth = lw * (1 - age * .6);
        ctx.beginPath();
        ctx.arc(b.x, b.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    } else if (b.kind === 'hero') {
      const fade = age < .55 ? 1 : 1 - (age - .55) / .45;
      drawSprite(ctx, noteSprite(b.color, true), b.x + b.drift * e, b.y - 34 * e, b.rot * (1 - e), 96 * (.9 + .12 * e), fade * flicker(ms));
    } else {
      const x = b.x + Math.cos(b.a) * b.dist * e;
      const y = b.y + Math.sin(b.a) * b.dist * e;
      drawSprite(ctx, noteSprite(b.color, false), x, y, b.rot + b.spin * age, 54, (1 - age) * flicker(ms));
    }
  }
}

function drawFloaters(ctx, list, now, drag, strength) {
  for (let i = list.length - 1; i >= 0; i--) {
    const sp = list[i];
    const age = (now - sp.born) / sp.life;
    if (age >= 1) { list.splice(i, 1); continue; }
    sp.vx *= drag;
    sp.vy *= drag;
    sp.x += sp.vx * 2;
    sp.y += sp.vy * 2;
    sp.rot += sp.vr * 2;
    const alpha = age < .12 ? age / .12 : 1 - (age - .12) / .88;
    drawSprite(ctx, noteSprite(sp.color, sp.beamed), sp.x, sp.y, sp.rot, 50 * sp.size, alpha * strength);
  }
}

function neonLine(ctx, pts, color, w, alpha) {
  if (pts.length < 2) return;
  const passes = lite ? [[w * 3, .18, color], [w, .95, C.core]] : [[w * 5, .1, color], [w * 2.4, .3, color], [w, .95, C.core]];
  for (const [lw, a, col] of passes) {
    ctx.globalAlpha = a * alpha;
    ctx.strokeStyle = col;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k][0], pts[k][1]);
    ctx.stroke();
  }
}

/* ---------------- Fluorescent note sprites ---------------- */

// Tube colour, inner line, inner rings. Coral with an amber line and blush rings
// is the swish.jpeg sign (pink tube, yellow line, blue rings) moved into the palette.
const NOTE_THEMES = {
  [C.coral]: [C.coral, C.amber, C.blush],
  [C.amber]: [C.amber, C.blush, C.coral],
  [C.blush]: [C.blush, C.amber, C.coral],
};
const sprites = new Map();

// Glow is costly (shadowBlur), so each note is drawn once and then only stamped.
function noteSprite(color, beamed) {
  const key = `${color}|${beamed}|${fx.dpr}`;
  let cv = sprites.get(key);
  if (cv) return cv;
  const k = 1.3 * fx.dpr;
  cv = document.createElement('canvas');
  cv.width = cv.height = Math.ceil(100 * k);
  const g = cv.getContext('2d');
  g.scale(k, k);
  g.translate(beamed ? 33 : 43.5, beamed ? 66 : 64.5); // centre the glyph in a 100-unit square
  g.lineCap = 'round';
  g.lineJoin = 'round';
  const [tube, inner, ring] = NOTE_THEMES[color] || NOTE_THEMES[C.coral];
  const ell = (cx, cy, rx, ry) => {
    g.moveTo(cx + rx * Math.cos(-.4), cy + rx * Math.sin(-.4));
    g.ellipse(cx, cy, rx, ry, -.4, 0, Math.PI * 2);
  };
  const body = () => {
    g.beginPath();
    ell(0, 0, 9, 6.5);
    g.moveTo(8.4, -2.5);
    g.lineTo(8.4, -34);
    if (beamed) {
      ell(26, -5, 9, 6.5);
      g.moveTo(34.4, -7.5);
      g.lineTo(34.4, -39);
      g.moveTo(8.4, -34);
      g.lineTo(34.4, -39);
      g.lineTo(34.4, -31);
      g.lineTo(8.4, -26);
      g.closePath();
    } else {
      g.moveTo(8.4, -34);
      g.bezierCurveTo(16, -29, 22, -22, 15, -11);
    }
  };
  const rings = () => {
    g.beginPath();
    ell(0, 0, 4.4, 2.9);
    if (beamed) ell(26, -5, 4.4, 2.9);
  };
  const pass = (shape, col, lw, blur, alpha, dx = 0, dy = 0) => {
    g.save();
    g.translate(dx, dy);
    g.globalAlpha = alpha;
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.shadowColor = col;
    g.shadowBlur = blur * k; // shadowBlur ignores the transform, so scale it by hand
    shape();
    g.stroke();
    g.restore();
  };
  pass(body, tube, 7, 22, .5); // bloom
  pass(body, tube, 3.4, 10, 1); // the tube
  pass(body, inner, 1.15, 4, 1, -1.7, 1.7); // second line running beside the tube
  pass(body, C.core, .8, 0, .9); // hot core
  pass(rings, ring, 4, 14, .55);
  pass(rings, ring, 1.6, 6, 1);
  pass(rings, C.core, .6, 0, .8);
  sprites.set(key, cv);
  return cv;
}

function drawSprite(ctx, cv, x, y, rot, size, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  ctx.globalAlpha = Math.min(1, alpha);
  ctx.drawImage(cv, -size / 2, -size / 2, size, size);
  ctx.restore();
}

/* ---------------- Utils ---------------- */

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
