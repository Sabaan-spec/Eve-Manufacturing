# EVE Forge — Manufacturing Profit Calculator

A zero-backend website for EVE Online players. Pick something to build and it pulls
**live market prices straight from CCP's ESI API** (in your browser) to show what the
materials cost, what the finished item sells for, and whether the build is profitable —
across the five major trade hubs (Jita, Amarr, Dodixie, Rens, Hek).

**Live site:** https://sabaan-spec.github.io/Eve-Manufacturing/

The whole app is a single self-contained `index.html` (HTML + CSS + JS + embedded
recipe data), so it runs on GitHub Pages with no server, database, or API key.

## What it does

- Search any item and see its blueprint material requirements.
- Live buy/sell prices per material and for the finished product, fetched from ESI.
- Adjusts material amounts for Material Efficiency (ME%) and number of runs.
- Value materials/products at sell orders (instant) or buy orders.
- Shows material cost, product value, profit, and margin, color-coded.
- Prices cached 5 minutes; "Refresh prices" forces an update.

> Profit = product value − material cost. It does **not** yet include manufacturing
> job install fees, sales taxes, or facility/structure/rig bonuses.

## Full recipe data

`index.html` ships with a small embedded **sample** dataset (9 T1 frigates) — hence the
yellow banner on the page. To load every manufacturable item with exact CCP quantities:

```bash
python build_recipes.py            # all items   (or: --only-ships)
```

This downloads the EVE Static Data Export and writes `data/recipes.json`. Upload that
file into the repo next to `index.html` (inside a `data/` folder). The page auto-detects
it on load and the banner disappears. Re-run after major EVE patches to stay current.

## How pricing works

For each material and the product, the app calls
`GET https://esi.evetech.net/latest/markets/{regionId}/orders/?type_id={typeId}&order_type=all`,
filters to the hub's main station (falling back to region-wide), and takes the lowest
sell price (cost to buy) and highest buy price (instant sell). ESI sends
`Access-Control-Allow-Origin: *`, so the browser calls it directly — no proxy needed.

## Credits & legal

Market data via [CCP ESI](https://esi.evetech.net/). SDE mirror by
[Fuzzwork](https://www.fuzzwork.co.uk/). EVE Online and all related trademarks are
property of **CCP hf.** Unofficial, non-commercial fan tool, not affiliated with CCP.
