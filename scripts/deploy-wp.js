// Publishes the built index.html to WordPress and points the live page's
// <iframe> at it - replacing the manual "open index.html -> Raw -> copy
// into WordPress" step. Run via `npm run deploy` (which builds first).
//
// How it works: the WordPress REST API can't overwrite an existing Media
// Library file in place, so every deploy uploads index.html as a NEW
// attachment (ges-live-system-preview-<commit>.html), then rewrites the
// iframe src on the host page to the new file's URL. Older uploads are
// left in the Media Library untouched, so rolling back is just pointing
// the iframe at a previous file. The upload lands under /wp-content/uploads
// on the same domain as the host page, which keeps the same-origin access
// the lead-gate relies on (see GATE_CONFIG in src/data.js) working.
//
// Configuration (environment variables - never commit these):
//   WP_URL            Site root, e.g. https://goldeagleservices.com
//   WP_USER           WordPress username that owns the Application Password
//   WP_APP_PASSWORD   Application Password (Users -> Profile in WP Admin)
//   WP_HOST_PAGE_ID   ID of the page containing the estimator's <iframe>
//                     (the number in the page's edit URL: post.php?post=123)
//   WP_IFRAME_MATCH   Optional substring identifying the estimator iframe's
//                     current src, if the page has more than one .html iframe
//
// Flags:
//   --check        Only verify credentials and find the iframe; change nothing
//   --dry-run      Show what would change; upload nothing, edit nothing
//   --allow-dirty  Deploy even if index.html differs from the last commit
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const root = path.join(__dirname, '..');
const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const DRY_RUN = args.has('--dry-run');
const ALLOW_DIRTY = args.has('--allow-dirty');

function fail(msg) {
  console.error(`\ndeploy failed: ${msg}`);
  process.exit(1);
}

const env = (name, required = true) => {
  const v = (process.env[name] || '').trim();
  if (!v && required) fail(`${name} is not set. See the configuration notes at the top of scripts/deploy-wp.js.`);
  return v;
};

const WP_URL = env('WP_URL').replace(/\/+$/, '');
const WP_USER = env('WP_USER');
const WP_APP_PASSWORD = env('WP_APP_PASSWORD');
const WP_HOST_PAGE_ID = env('WP_HOST_PAGE_ID', !CHECK);
const WP_IFRAME_MATCH = env('WP_IFRAME_MATCH', false);

const AUTH = 'Basic ' + Buffer.from(`${WP_USER}:${WP_APP_PASSWORD}`).toString('base64');

async function wp(route, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(`${WP_URL}/wp-json${route}`, {
    method,
    headers: { Authorization: AUTH, ...headers },
    body,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (!res.ok) {
    const detail = data && data.message ? data.message : String(text).slice(0, 300);
    fail(`${method} ${route} returned HTTP ${res.status}: ${detail}`);
  }
  return data;
}

// Every <iframe src="..."> on the page whose src is an .html file - the
// estimator's own embed. (The Gravity Forms lead-gate iframe lives inside
// the estimator itself, not on this page, so it never shows up here.)
function findEstimatorIframes(html) {
  const found = [];
  const re = /<iframe\b[^>]*?\bsrc\s*=\s*(["'])(.*?)\1/gi;
  let m;
  while ((m = re.exec(html))) {
    const src = m[2];
    if (WP_IFRAME_MATCH ? src.includes(WP_IFRAME_MATCH) : /\.html?(\?|#|$)/i.test(src)) {
      found.push(src);
    }
  }
  return [...new Set(found)];
}

function gitShortHash() {
  try { return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); }
  catch { return String(Date.now()); }
}

function indexHtmlIsCommitted() {
  try {
    return execSync('git status --porcelain -- index.html', { cwd: root }).toString().trim() === '';
  } catch { return true; }
}

async function main() {
  const me = await wp('/wp/v2/users/me?context=edit');
  console.log(`Connected to ${WP_URL} as "${me.username || me.name}" (roles: ${(me.roles || []).join(', ') || 'unknown'})`);
  if (CHECK && !WP_HOST_PAGE_ID) {
    console.log('Credentials OK. Set WP_HOST_PAGE_ID to also check the host page.');
    return;
  }

  const page = await wp(`/wp/v2/pages/${encodeURIComponent(WP_HOST_PAGE_ID)}?context=edit`);
  const raw = page.content && page.content.raw;
  if (typeof raw !== 'string') fail(`page ${WP_HOST_PAGE_ID} returned no editable content.`);
  console.log(`Host page: "${page.title && page.title.raw}" (${page.link})`);

  // Elementor renders its pages from its own layout data, not from the
  // regular page content - it only keeps a plain-HTML copy there. Editing
  // that copy would "succeed" without changing what visitors see, so refuse.
  const rendered = (page.content && page.content.rendered) || '';
  if (/data-elementor-type=|class="elementor elementor-\d/.test(rendered)) {
    fail(
      `page ${WP_HOST_PAGE_ID} is built with Elementor, whose layout the REST API can't safely edit. ` +
      'Host the estimator iframe on a Gutenberg page instead (a Custom HTML block containing the <iframe>) and set WP_HOST_PAGE_ID to that page.'
    );
  }

  const iframes = findEstimatorIframes(raw);
  if (iframes.length === 0) {
    fail(`no estimator <iframe> found in page ${WP_HOST_PAGE_ID}'s content. Add one in a Custom HTML block, or set WP_IFRAME_MATCH to part of its src.`);
  }
  if (iframes.length > 1) {
    fail(`found ${iframes.length} candidate iframes - set WP_IFRAME_MATCH to pick one:\n  ${iframes.join('\n  ')}`);
  }
  const oldSrc = iframes[0];
  console.log(`Current iframe src: ${oldSrc}`);
  if (CHECK) {
    console.log('Check passed - ready to deploy.');
    return;
  }

  if (!indexHtmlIsCommitted() && !ALLOW_DIRTY) {
    fail('index.html has uncommitted changes (or the build produced something different from what\'s committed). Commit it first so the live site always matches a commit, or pass --allow-dirty.');
  }

  const file = fs.readFileSync(path.join(root, 'index.html'));
  const filename = `ges-live-system-preview-${gitShortHash()}.html`;
  if (DRY_RUN) {
    console.log(`[dry run] would upload index.html (${(file.length / 1024).toFixed(1)}kb) as ${filename}`);
    console.log(`[dry run] would replace the iframe src on page ${WP_HOST_PAGE_ID}`);
    return;
  }

  const media = await wp('/wp/v2/media', {
    method: 'POST',
    headers: {
      'Content-Type': 'text/html',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
    body: file,
  });
  const newSrc = media.source_url;
  if (!newSrc) fail('upload succeeded but WordPress returned no file URL.');
  console.log(`Uploaded: ${newSrc} (media ID ${media.id})`);

  // Make sure the uploaded file is actually served before pointing the live
  // page at it - a host or security plugin that blocks .html uploads would
  // otherwise leave visitors looking at a broken iframe.
  const check = await fetch(newSrc);
  const served = Buffer.from(await check.arrayBuffer());
  if (!check.ok || !served.equals(file)) {
    fail(`uploaded file isn't being served correctly (HTTP ${check.status}, ${served.length} of ${file.length} bytes). The live page was NOT changed.`);
  }

  const updated = raw.split(oldSrc).join(newSrc);
  await wp(`/wp/v2/pages/${encodeURIComponent(WP_HOST_PAGE_ID)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: updated }),
  });
  console.log(`Updated page ${WP_HOST_PAGE_ID}: iframe now points at ${filename}`);
  console.log(`Previous version stays in the Media Library for rollback: ${oldSrc}`);
  console.log('If the site uses a caching plugin or CDN, purge its cache to see the change immediately.');
}

main().catch((err) => fail(err && err.message ? err.message : String(err)));
