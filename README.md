# GES Live System Preview

## Deploying to WordPress

**`index.html` is the entire site.** Download its raw contents from GitHub
and drop that one file into WordPress - nothing else in this repo needs to
come with it. Styles and the compiled app are already inlined directly
into it; the only external references it makes are the Google Fonts and
React CDN links, which need no local file at all.

To grab it: open `index.html` in this repo → **Raw** → save the page (or
copy/paste its contents).

**Embed it via `<iframe>` - never paste its markup directly into a raw
HTML/Custom HTML block.** The app's CSS and JS (`src/data.js`,
`src/app.js`) are written and QA'd on the assumption that this file runs
as its own top-level document inside an `<iframe>`, exactly like the
Gravity Forms lead-gate embed already does at `GATE_CONFIG.embedFormUrl`
(see the comment there). Concretely, `styles.css` sets `body{overflow:
hidden}` plus a full-viewport `position:relative` dark theme with a
`z-index:9999` overlay, and the app mounts full-bleed absolutely-
positioned panels against that `body` - all deliberate for a page that
owns its own document, but if pasted directly into the surrounding
WordPress page instead of an iframe, that CSS applies to the WordPress
page itself: it visually paints over and hides the entire surrounding
page (theme header, other content, footer) and can leave the WHOLE
WordPress page unable to scroll. Upload/host `index.html` at its own URL
(a WordPress page/attachment on the same domain works well - see the
lead-gate's same-origin note in `src/data.js`) and point a
`<iframe src="that-url">` at it from wherever it should appear on the
page. It handles a wide range of fixed iframe heights gracefully (tested
down to 600px) as well as "fill available space" sizing - no minimum
height needs to be hardcoded.

## Development

Everything else in this repo (`src/`, `package.json`, `app.js`,
`styles.css`) is source and build tooling, not something WordPress needs:

- Edit the real source in `src/data.js`, `src/canvas.js`, `src/app.js`,
  and `src/index.template.html`. The root `styles.css` is also real,
  hand-edited source - there's no `src/` copy of it, so edit it directly.
- Run `npm install` once (installs esbuild), then `npm run build` to
  compile it all into the root `index.html` - esbuild bundles
  `src/app.js` into `app.js`, then `scripts/build-html.js` reads that
  `app.js` and the root `styles.css` and inlines both directly into
  `index.html` from the template. The build is deterministic: running it
  twice with no source changes produces a byte-identical `index.html`.
- Never hand-edit the root `index.html` or `app.js` - both are build
  output and get overwritten on the next `npm run build`. (`styles.css`
  is the one root-level file that's the opposite: it's never written by
  the build, only read, so it's safe - and correct - to edit by hand.)
