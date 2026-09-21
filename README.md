# GES Live System Preview

## Deploying to WordPress

**`index.html` is the entire site.** Download its raw contents from GitHub
and drop that one file into WordPress - nothing else in this repo needs to
come with it. Styles and the compiled app are already inlined directly
into it; the only external references it makes are the Google Fonts and
React CDN links, which need no local file at all.

To grab it: open `index.html` in this repo → **Raw** → save the page (or
copy/paste its contents).

## Development

Everything else in this repo (`src/`, `package.json`, `app.js`,
`styles.css`) is source and build tooling, not something WordPress needs:

- Edit the real source in `src/data.js`, `src/canvas.js`, `src/app.js`,
  and `src/index.template.html`.
- Run `npm run build` to compile it all into the root `index.html` -
  esbuild bundles `src/app.js` into `app.js`, then `scripts/build-html.js`
  inlines `app.js` and `styles.css` directly into `index.html` from the
  template.
- Never hand-edit the root `index.html`, `app.js`, or `styles.css` -
  they're all build output and get overwritten on the next `npm run
  build`.
