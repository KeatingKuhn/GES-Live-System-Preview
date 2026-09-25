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

The owner's top priority is that the site never breaks. These rules are
mandatory - no exceptions, even for "tiny" edits:

1. **New pages and posts are always created with `"status": "draft"`.**
   Give the owner the preview link. Publish only when they explicitly say
   to publish that specific item.
2. **Edits to existing pages need an explicit "yes" every time.** Before
   saving, show the owner the exact before and after text in plain
   language, then wait. A general "go ahead" earlier in the conversation
   does not cover a new change.
3. **Back up before every edit.** Save the page's current `content.raw` to
   a file in the scratchpad before POSTing a change, so it can be put
   back even if WordPress revisions fail.
4. **Verify after every edit.** Re-fetch the page via the API and load its
   public URL. If it doesn't return HTTP 200, or the change isn't there,
   or other content is missing, immediately restore the backup and tell
   the owner what happened. Mention that a caching plugin may delay what
   visitors see.
5. **One page at a time.** A change touching several pages needs the owner
   to approve the full list of pages first.
6. **Never:** delete pages, posts or media; change menus, site settings,
   users, plugins or themes; edit the two Elementor pages listed above.
   If the owner asks for one of these, explain it's outside what this
   setup does safely and suggest they do it in WP Admin.

To undo a change later, WordPress keeps revisions
(`/wp/v2/pages/<id>/revisions`); the owner can also use Revisions →
Restore in the page editor.

## The Build Your System estimator (this repo)

The estimator app lives in this repo and is embedded via an iframe on the
"Build Your System" page (ID 3373). After changing it: edit `src/`, run
`npm run build`, commit, then `npm run deploy:check` and `npm run deploy`
(details in README.md and `scripts/deploy-wp.js`; `WP_HOST_PAGE_ID=3373`).
