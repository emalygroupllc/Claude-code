# FlechaCard

**One tap. Straight to you.**

Marketing website for FlechaCard — an NFC business card that shares your
contact, links and portfolio the moment it touches a phone. No app needed,
one-time purchase, profile editable forever.

## Structure

```
index.html      # single-page site (hero demo, how it works, features,
                #   cards & pricing, testimonials, FAQ, CTA, footer)
css/style.css   # design tokens + all styling
js/main.js      # hero card demo, mobile menu, scroll reveals
```

Static site with no build step — open `index.html` in a browser, or serve
the folder with any static host (GitHub Pages, Netlify, Vercel, etc.).

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
