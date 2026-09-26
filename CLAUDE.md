# Working on goldeagleservices.com

The site owner talks to Claude in plain language ("change the phone number
on the Contact page") and expects Claude to make the change on the live
WordPress site. They are not a developer - keep replies short and
non-technical, and don't ask them to run commands.

## WordPress access

The environment provides `WP_URL`, `WP_USER` and `WP_APP_PASSWORD` (an
Editor-role Application Password). Use them with the WordPress REST API:

```sh
curl -s -u "$WP_USER:$WP_APP_PASSWORD" "$WP_URL/wp-json/wp/v2/pages?per_page=100&context=edit"
```

Never print, echo or commit those values.

- Pages: `/wp-json/wp/v2/pages`, posts: `/wp/v2/posts`, images: `/wp/v2/media`.
- Read a page with `?context=edit` to get `content.raw` (Gutenberg block
  markup), edit that, and POST `{"content": ...}` back to the same URL.
- Nearly every page is **Gutenberg** and safe to edit this way. Two pages
  are **Elementor** - "Build Your System Submission Form" (ID 3506) and
  "Home Maintenance Plan" (ID 1667). Their visible layout is not in
  `content.raw`; don't edit them through the API - tell the owner and
  suggest making the change in the Elementor editor instead.
- Service pages are built from theme ACF blocks (`acf/section-text`,
  `acf/section-cta`, ...). Add new sections with those blocks so they match
  the design. `unfiltered_html` is allowed, so a `wp:html` block can carry
  JSON-LD; the homepage (ID 2540) has `HVACBusiness` data and the FAQ page
  (ID 2640) has `FAQPage` data - keep them in sync when facts change.
- Cloudflare blocks requests with a fake browser user agent; use curl's
  default.

## Resource Center (sister site)

resources.goldeagleservices.com is a separate WordPress site (Yoast SEO)
with long-form homeowner guides. Access it the same way with `RES_WP_URL`,
`RES_WP_USER` and `RES_WP_APP_PASSWORD` (also Editor role, same rules
below). Its job is to be the education hub AI assistants learn from, tied
back to the business: link articles to the matching main-site service page,
and link service pages to articles ("Learn More From Our Resource Center"
sections on AC, Heating, Ductwork, IAQ and Mold).

## Owner's developer to-do list

Things only the web developer or the owner can do (theme code, plugins,
settings, accounts) go on the pinned list at
https://claude.ai/artifact/WR3J1YfsDKMn6wYhJoojEU, collection `tasks`
(fields: title, detail, area, status open/done, createdAt, doneAt). Add
new items there instead of leaving them only in chat.

## How to make a change

The owner trusts Claude to handle routine work end-to-end and wants to
spend as little effort as possible. Don't ask for approval on each step:
do the work, then report. What stays non-negotiable is that the site
never breaks and every change can be undone.

**Just do it, then report** (no approval needed):
- Edits that carry out what the owner asked for, even loosely ("clean up
  X", "fix typos on the service pages"), across as many pages as needed.
- Removing leftovers, broken shortcodes, stray text, typos and outdated
  references.
- Unpublishing a post or page (set `"status": "draft"`) when it's clearly
  part of the requested cleanup. That hides it but keeps it, so it can be
  republished any time.

When finished, give one short summary: what changed, on which pages
(with links), and anything left undone and why.

**Ask first** (one short question, with a recommendation):
- Wording that changes meaning rather than fixing it: prices, promises,
  warranties, legal text beyond removing obvious junk, new marketing copy.
- Anything ambiguous, where a wrong guess would need undoing.

**New pages and posts** are created as drafts; send the preview link and
publish when the owner says so.

**Always, for every edit (the safety net - costs the owner nothing):**
1. Back up the page's current `content.raw` to a file in the scratchpad
   before saving.
2. After saving, re-fetch it via the API and load the public URL. If it
   doesn't return HTTP 200, the change isn't there, or other content went
   missing, restore the backup immediately and say what happened.
3. Mention that the site's cache (Cloudflare / host) can delay what
   visitors see by up to about 10 minutes.

**Never:** permanently delete pages, posts or media; change menus, site
settings, users, plugins or themes; edit the two Elementor pages listed
above through the API. If a task needs one of these, say so and give the
owner the exact click-path in WP Admin, or say who can do it.

To undo a change later, WordPress keeps revisions
(`/wp/v2/pages/<id>/revisions`); the owner can also use Revisions →
Restore in the page editor.

## The Build Your System estimator (this repo)

The estimator app lives in this repo and is embedded via an iframe on the
"Build Your System" page (ID 3373). After changing it: edit `src/` (or
`styles.css`, which is edited directly), run `npm run build`, commit, then
`npm run deploy:check` and `npm run deploy` (details in README.md and
`scripts/deploy-wp.js`; `WP_HOST_PAGE_ID=3373`).

- **Merge and deploy without asking.** The owner's standing rule: for
  estimator changes, test them, open the PR, merge it yourself, deploy, and
  confirm live matches `main` - then report. No approval step needed.
- **Always deploy.** The owner's standing rule: any estimator change that
  reaches GitHub must also go live. After deploying, confirm the live file
  matches `main` (the served file differs only by Cloudflare's injected
  `/cdn-cgi/challenge-platform` script, which the deploy check ignores).
- Deploys upload a new Media Library file per commit
  (`ges-live-system-preview-<hash>.html`) and repoint the page's iframe; the
  previous file stays for rollback. The old `wp-content/uploads/index.html`
  is only a backup now.
- **Never use "Edit with Elementor"** on page 3373 (or any page) - it can
  replace the page content and wipe the iframe. Edit it only through the
  API or the block editor. Elementor removal is planned.
- Never paste the app's raw HTML/JS into a WordPress block - content filters
  can mangle JS (`&&`). Page-level tweaks on 3373 live in its `wp:html`
  `<style>` block (footer hidden, header not sticky, no page scroll) and its
  "How it works & FAQ" panel, opened by a CSS-only `:target` button and
  backed by FAQPage JSON-LD. Keep the page one screen with no scroll.
- The lead gate embeds Gravity Form 9 from `/build-your-system-submission-form/`
  (`GATE_CONFIG.embedFormUrl`); the estimator restyles that form on load, so
  replacing the host page doesn't change its look. A non-Elementor
  replacement page (draft 3922) takes over that URL when Elementor is removed.
