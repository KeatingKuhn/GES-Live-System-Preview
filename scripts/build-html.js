// Inlines styles.css and the compiled app.js directly into the root
// index.html, from src/index.template.html - so the ONE file that ends
// up on GitHub at index.html is fully self-contained (aside from the
// React/Google Fonts CDN links, which need no local file at all). Run via
// `npm run build` (chained after the esbuild step that produces app.js),
// never by hand-editing the root index.html - that file is a build
// output, same as app.js already was.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const template = fs.readFileSync(path.join(root, 'src/index.template.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'app.js'), 'utf8');

// </style> and </script> can't appear literally inside their own inlined
// content without prematurely closing the tag - neither file has a
// legitimate reason to contain those substrings, so this is just a safety
// net, not an expected real substitution.
const safeCss = css.replace(/<\/style>/gi, '<\\/style>');
const safeJs = js.replace(/<\/script>/gi, '<\\/script>');

const out = template
  .replace('/*__STYLES__*/', safeCss)
  .replace('/*__SCRIPT__*/', safeJs);

fs.writeFileSync(path.join(root, 'index.html'), out);
console.log(`index.html  ${(out.length / 1024).toFixed(1)}kb (self-contained)`);
