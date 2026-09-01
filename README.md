# FlechaCard

**One tap. Straight to you.**

Marketing website for FlechaCard — an NFC business card that shares your
contact, links and portfolio the moment it touches a phone. No app needed,
one-time purchase, profile editable forever.

## Structure

```
index.html      # landing page (hero demo, how it works, features,
                #   cards & pricing, testimonials, FAQ, CTA, footer)
create.html     # build/edit a card profile, get a share link + QR code
card.html       # displays a card from its link; "Save contact" downloads
                #   a vCard (.vcf)
css/style.css   # design tokens + all styling
js/main.js      # landing page: hero card demo, mobile menu, scroll reveals
js/app.js       # create/card pages: profile encoding, QR, vCard
```

Static site with no build step — open `index.html` in a browser, or serve
the folder with any static host (GitHub Pages, Netlify, Vercel, etc.).

## Backend mode (Supabase)

With a Supabase project configured, cards are stored in the database
behind short permanent links (`card.html?c=<slug>`) that never change
when edited. The secret edit key travels only in the owner's edit link
(`create.html?c=<slug>&k=<key>`).

Setup:
1. Run `supabase/setup.sql` in the Supabase dashboard (SQL Editor → Run).
   It creates the `cards` table plus `create_card`/`update_card`
   functions; row-level security blocks all direct writes and hides the
   `edit_key` column from the public.
2. Put the project URL and anon key in `js/config.js`.

With `js/config.js` left empty the site runs in link-only mode (data
encoded in the URL), and legacy hash links keep working in both modes.

## How cards work (link mode)

A card's profile is a small JSON object encoded (base64url) into the URL
hash of `card.html`. An optional profile photo is compressed client-side
(center-cropped square JPEG, ≤ ~1.8 KB) and appended to the hash as its
own base64url segment (`#<profile>.<photo>`), and it's also embedded in
the downloaded vCard so the photo lands in the phone's contacts. That
means:

- No accounts, no database, no server — works on free static hosting.
- The link *is* the card. Point an NFC tag or the generated QR code at it.
- Editing opens `create.html` pre-filled and produces a new link, so
  re-write your NFC tag / QR when you change details.
- The QR code is drawn client-side (qrcode-generator via jsdelivr CDN);
  if the CDN is unreachable the QR block hides and the link still works.

## Design

- **Palette**: deep cobalt ink `#0F1E45`, porcelain `#F6F3EC`, copper
  `#BE6B33` (a nod to the copper NFC coil inside every card), electric
  cobalt `#2D5BE3` for interactive elements.
- **Type**: Bricolage Grotesque (display), Instrument Sans (body),
  Spline Sans Mono (labels), loaded from Google Fonts.
- **Signature**: the hero is a live demo — tilt the card with your pointer
  and tap it to see the shared profile pop up on a phone.

Responsive down to mobile, keyboard-focus visible, `prefers-reduced-motion`
respected, and all content remains visible with JavaScript disabled.

## Payments (PaySuite)

Card orders are paid by M-Pesa, e-Mola or card through
[PaySuite](https://paysuite.co.mz). Because this is a static site, the
gateway secret can never live in `js/` — the whole payment path runs in
two Supabase Edge Functions.

```
encomendar.html   # order form: pick material, quantity, delivery details
js/order.js       #   creates the order, starts the payment, waits
obrigado.html     # post-payment status page (polls until confirmed)

supabase/orders.sql                     # products + orders tables, RPCs
supabase/functions/_shared/paysuite.ts  # every PaySuite-specific detail
supabase/functions/paysuite-checkout/   # starts a payment (secret key)
supabase/functions/paysuite-webhook/    # receives + verifies confirmation
```

### Two rules the code is built around

1. **The price never comes from the browser.** The site sends only a
   product code; `create_order` looks the price up in the `products`
   table. Editing the JavaScript cannot change what is charged.
2. **The webhook never decides anything.** Its endpoint is public, so a
   confirmation body is treated as a hint, not as truth: the function
   verifies the signature, then calls PaySuite back to ask the real
   status, and only marks an order paid if the amount matches.

### Setup

1. Run `supabase/orders.sql` in the SQL Editor (after `setup.sql`).
2. Store the secrets — these never enter the repo or the browser:
   ```
   supabase secrets set PAYSUITE_API_KEY=...
   supabase secrets set PAYSUITE_WEBHOOK_SECRET=...
   supabase secrets set SITE_URL=https://flechacard.com
   ```
3. Deploy both functions:
   ```
   supabase functions deploy paysuite-checkout
   supabase functions deploy paysuite-webhook --no-verify-jwt
   ```
   (`--no-verify-jwt` because PaySuite has no Supabase session; the
   signature is what authenticates it.)
4. In the PaySuite dashboard, set the webhook/callback URL to
   `https://<project>.supabase.co/functions/v1/paysuite-webhook`.
5. Confirm the API shape. Everything PaySuite-specific — base URL,
   request body, field names, signature header — is isolated in
   `supabase/functions/_shared/paysuite.ts`, written against the
   conventional REST shape and reading several possible field names for
   each value. Check it against your PaySuite API docs and adjust that
   one file; nothing else needs to change.

Prices live in the `products` table, not in the HTML. To change one,
update the row — the order page reads the catalogue on load.

## Hosting

Static files plus two Edge Functions, so any static host works. These
notes assume **Cloudflare Pages** (free, unmetered bandwidth, fast from
Mozambique); Netlify reads the same two config files if you prefer it.

```
_redirects   # unknown paths → 404.html with a 200, so /<slug> card
             #   links behave like normal pages
_headers     # CSP, clickjacking and referrer protection, cache rules
```

### Deploy

1. Connect the repo in Cloudflare Pages → Create project → Connect to Git.
2. Build settings: **no framework, no build command**, output directory
   `/`. There is no build step — the files ship as they are.
3. First deploy lands on `<project>.pages.dev`. Test it there before
   pointing a domain at it.
4. Custom domain: Pages → Custom domains → add it, then create the CNAME
   it shows you. HTTPS is automatic.
5. Once the domain is live, set `siteBase` in `js/config.js` to
   `https://yourdomain/` and update Supabase → Authentication → URL
   Configuration, or confirmation emails will lead nowhere.

Left empty, `siteBase` falls back to whatever address is serving the
site, so `pages.dev` works for testing without any config change.

### After changing what the site loads

`_headers` contains a Content-Security-Policy naming every allowed
external source (Google Fonts, jsdelivr, Supabase). Adding a new script,
font or API means adding it there too — otherwise the browser blocks it
silently and the only clue is an error in the developer console.

### Cloudflare: Workers vs Pages

Cloudflare now steers new projects into **Workers**, whose Git setup
runs `npx wrangler deploy`. That path needs `wrangler.jsonc` (assets
only — the site has no server code) and `.assetsignore`, which keeps
`supabase/` and the rest of the source off the public CDN.

One thing to verify on that path: card links must be served with a
**200**, which is what `_redirects` is for. Workers static assets read
`_redirects`, but confirm it after the first deploy — open a card link
and check the status in the browser's Network tab. A 404 there means the
rewrite is not being applied; Pages and Netlify both handle it, so
switch rather than fight it.

Whichever you pick, set the **production branch** to the branch this
site actually lives on. The repository's default branch holds an older
copy of FlechaCard, and deploying it silently ships a site with no
accounts, dashboard or payments.

### GitHub Pages (no third-party account needed)

Pages serves this repo as-is. `.nojekyll` is what makes that work: without
it GitHub runs the files through Jekyll, which ignores anything starting
with an underscore and would quietly drop `_headers` and `_redirects`.

Settings → Pages → Source: **Deploy from a branch** → branch
`claude/flechacard-website-hyuf80`, folder `/ (root)`.

Two differences from Pages/Netlify, neither a blocker:

- **Card links return 404, not 200.** GitHub Pages serves `404.html` for
  unknown paths — which is exactly how card links resolve — but always
  with a 404 status, and it does not read `_redirects`. Browsers render
  the card correctly; some link previews and NFC readers treat a 404 as
  broken. Fine for testing, worth moving off before printing cards.
- **`_headers` is ignored**, so the CSP and other security headers are
  not applied.

The site lands on a subpath (`…github.io/Claude-code/`). That works —
every link is relative and `404.html` sets its `<base>` from the path —
and a custom domain later moves it to the root.
