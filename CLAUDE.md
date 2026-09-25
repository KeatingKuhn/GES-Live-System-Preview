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

## How to make a change

1. Find the page, read its current content, and describe the exact change
   in one or two plain sentences.
2. Get a clear "yes" before changing the live site. Small text fixes the
   owner spelled out exactly can go straight through.
3. Make the change, then re-fetch the page (and its public URL) to confirm
   it took. Give the owner the page link. Mention that a caching plugin may
   delay what visitors see.
4. If something goes wrong, WordPress keeps revisions
   (`/wp/v2/pages/<id>/revisions`) - restore from there.

## The Build Your System estimator (this repo)

The estimator app lives in this repo and is embedded via an iframe on the
"Build Your System" page (ID 3373). After changing it: edit `src/`, run
`npm run build`, commit, then `npm run deploy:check` and `npm run deploy`
(details in README.md and `scripts/deploy-wp.js`; `WP_HOST_PAGE_ID=3373`).
