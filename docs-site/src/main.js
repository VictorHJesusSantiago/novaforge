import { marked } from 'marked';
import { DOCS } from './docs.js';

/**
 * A deliberately small hash router — three routes (`#/`, `#/docs/<slug>`, `#/play`), no
 * framework. This site's whole job is "render markdown, embed two running apps"; anything more
 * than `location.hash` plus a `render()` call on `hashchange` would be scaffolding with no job
 * to do.
 */

const nav = /** @type {HTMLElement} */ (document.getElementById('nav'));
const main = /** @type {HTMLElement} */ (document.getElementById('main'));

const PLAY_APPS = [
  { id: 'breakout', title: 'Breakout', devPort: 5173 },
  { id: 'editor', title: 'Editor', devPort: 5174 },
  { id: 'asteroids', title: 'Asteroids', devPort: 5180 },
  { id: 'platformer', title: 'Platformer', devPort: 5181 },
];

function buildNav() {
  const links = [
    ['#/', 'Home'],
    ['#/play', 'Play'],
    ...DOCS.map((doc) => [`#/docs/${doc.slug}`, doc.title]),
  ];
  nav.replaceChildren(
    ...links.map(([href, label]) => {
      const a = document.createElement('a');
      a.href = href;
      a.textContent = label;
      return a;
    }),
  );
}

function renderHome() {
  main.innerHTML = `
    <h1>NovaForge</h1>
    <p>A 2D game engine and visual editor built from scratch in plain JavaScript — ECS core,
    Canvas2D and WebGL2 renderers behind one draw-list abstraction, SAT/quadtree physics,
    a keyframe animation system, and a browser-based scene editor.</p>
    <p>This site renders the project's own <code>docs/</code> — the SPEC, the architecture notes,
    every ADR, and the roadmap — directly from source, and embeds the two example apps running
    live, not screenshotted.</p>
    <div class="nf-docs__home-grid">
      <a class="nf-docs__card" href="#/play"><h3>Play</h3><p>Run Breakout and the editor, live, in this page.</p></a>
      <a class="nf-docs__card" href="#/docs/spec"><h3>SPEC</h3><p>The contract: numbered invariants referenced from code and tests.</p></a>
      <a class="nf-docs__card" href="#/docs/architecture"><h3>Architecture</h3><p>How a frame actually happens.</p></a>
      <a class="nf-docs__card" href="#/docs/roadmap"><h3>Roadmap</h3><p>What's built, what's stated as an honest gap.</p></a>
    </div>
  `;
}

/**
 * @param {string} slug
 * @returns {void}
 */
function renderDoc(slug) {
  const doc = DOCS.find((d) => d.slug === slug);
  if (doc === undefined) {
    main.innerHTML = `<p>No such doc: <code>${escapeHtml(slug)}</code>. <a href="#/">Back home</a>.</p>`;
    return;
  }
  // marked.parse()'s return type is `string | Promise<string>` because of its async-extension
  // hook — this site registers none, so the call is always synchronous.
  main.innerHTML = /** @type {string} */ (marked.parse(doc.markdown));
}

/**
 * @param {string} [activeId]
 * @returns {void}
 */
function renderPlay(activeId = PLAY_APPS[0].id) {
  const app = PLAY_APPS.find((a) => a.id === activeId) ?? PLAY_APPS[0];
  const src = import.meta.env.DEV
    ? `http://localhost:${app.devPort}/`
    : `./play/${app.id}/index.html`;

  main.innerHTML = `
    <h1>Play</h1>
    <p>Both apps below are the real, running engine — the same code that ships in
    <code>examples/${escapeHtml(app.id)}</code>, not a recording.</p>
    <div class="nf-docs__play-tabs">
      ${PLAY_APPS.map(
        (a) =>
          `<button data-app="${a.id}" class="${a.id === app.id ? 'active' : ''}">${a.title}</button>`,
      ).join('')}
    </div>
    <div class="nf-docs__play">
      <iframe src="${src}" title="${escapeHtml(app.title)}" allow="autoplay"></iframe>
    </div>
  `;

  for (const button of main.querySelectorAll('[data-app]')) {
    const el = /** @type {HTMLElement} */ (button);
    el.addEventListener('click', () => renderPlay(el.dataset.app));
  }
}

/**
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function render() {
  const hash = location.hash.replace(/^#/, '') || '/';
  for (const a of nav.querySelectorAll('a')) {
    a.classList.toggle('active', a.getAttribute('href') === `#${hash}`);
  }

  if (hash === '/') return renderHome();
  if (hash === '/play') return renderPlay();
  const docMatch = hash.match(/^\/docs\/(.+)$/);
  if (docMatch) return renderDoc(docMatch[1]);

  main.innerHTML = `<p>Not found. <a href="#/">Back home</a>.</p>`;
}

buildNav();
window.addEventListener('hashchange', render);
render();
