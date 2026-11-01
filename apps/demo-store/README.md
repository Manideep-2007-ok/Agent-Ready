# Chai & Co. demo store

Static site (no build) used as the AgentReady demo target. Tea and mugs, prices in rupees.

## Deploy

- `npx vercel apps/demo-store --prod`, or
- Vercel dashboard: import the repo, set Root Directory to `apps/demo-store`, framework "Other".

Local: `npx serve apps/demo-store -l 5600`.

## Flaws (saved in localStorage, default off)

- All on: `/?flaws=on`   All off: `/?flaws=off`
- One at a time: `?popup=on`, `?priceImg=on`, `?iconCart=on`, `?hiddenReturns=on` (use `off` to clear)

| Flaw | Effect |
|---|---|
| popup | Full-screen sale overlay with no close button |
| priceImg | Prices shown only as images (no text, no alt) |
| iconCart | Add to cart is an icon-only button with no label |
| hiddenReturns | No Returns link in the footer (still at Help > Policies > Shipping > More > Returns) |

Dev test: `node apps/demo-store/test-flaws.mjs` (needs playwright).
