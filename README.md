# EMALY GROUP LLC — Mission Edition Website (V4)

One-page marketing site for EMALY GROUP LLC, built as a single continuous space
mission: the visitor scrolls from the launch pad (hero) through the problem,
products, flight path, process and terms, ending at the **Pre-Flight Check** —
an interactive qualifying quiz that captures the lead and fires a rocket-launch
animation on submit.

## Stack

Pure static site — no build step, no framework, no external assets beyond
Google Fonts (falls back to system fonts offline).

| File | Purpose |
|---|---|
| `index.html` | All 13 sections + quiz panel markup |
| `styles.css` | Design system, starfield, planets, trajectory, responsive rules |
| `script.js` | Starfield generation, scroll rocket, count-ups, orbit animation, quiz engine |

## Run locally

```sh
python3 -m http.server 8000
# open http://localhost:8000
```

Or deploy the three files to any static host (GitHub Pages, Netlify, Vercel…).

## Lead capture

Quiz answers + contact fields submit together as one lead record
(platforms, follower range, niche, sales history, product interest, weekly time).

- Records are always saved to `localStorage` under the key `emaly_leads`.
- To POST leads to a backend/CRM, set the `LEAD_ENDPOINT` constant at the top
  of `script.js` to your webhook URL (e.g. a form service or serverless function).

## Notable behaviors

- **Traveling rocket** rides the dotted trajectory line with scroll progress
  (hidden under `prefers-reduced-motion`; the static line + planet markers remain).
- **Quiz branching**: "Not sure yet" on Q5 — or "My own app" with an audience
  under 50K — shows the ebook recommendation screen before Q6.
- **Launch sequence** on submit: panel shake → particle scatter → rocket flies
  off-screen → confirmation. Reduced-motion users get an amber flash fade instead.
- Mobile-first at 390px; sticky bottom CTA appears after the hero (mobile only).
