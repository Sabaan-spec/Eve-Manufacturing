# EVE Forge — Manufacturing Profit Calculator

A zero-backend website for EVE Online players. Pick something to build, and it pulls
**live market prices straight from CCP's ESI API** (in your browser) to show what the
materials cost, what the finished item sells for, and whether the build is profitable —
across the five major trade hubs (Jita, Amarr, Dodixie, Rens, Hek).

Because it's 100% static (HTML/CSS/JS + a JSON data file), it runs perfectly on
**GitHub Pages** for free, with no server, database, or API key.

---

## What it does

- Search any manufacturable item and see its blueprint material requirements.
- Live **buy/sell** prices per material and for the finished product, fetched from ESI.
- Adjusts material amounts for **Material Efficiency (ME%)** and number of **runs**.
- Lets you choose to value materials/products at **sell** orders (instant) or **buy** orders.
- Shows **material cost, product value, profit, and margin**, color-coded.
- Prices are cached for 5 minutes; hit **Refresh prices** to force an update.

> Profit shown = product value − material cost. It does **not** yet include manufacturing
> job install fees, sales taxes, or facility/structure/rig bonuses. It's a clean
> material-vs-output comparison — the dominant factor for most T1 builds.

---

## File layout

```
eve-manufacturing/
├── index.html            # the page
├── css/style.css         # styling
├── js/app.js             # search + ESI price fetching + profit math
├── data/recipes.json     # item recipes (ships with a small SAMPLE set)
├── tools/build_recipes.py# generates the FULL, exact dataset from CCP's SDE
├── .nojekyll             # tells GitHub Pages to serve files as-is
└── README.md
```

---

## ⚠️ Important: get the full, accurate recipe data

The bundled `data/recipes.json` is a **small sample** so the site works immediately.
The type IDs are real, but the material *quantities* are representative T1-frigate
figures for demonstration. You'll see a yellow banner on the page while sample data is active.

To replace it with **every manufacturable item and its exact CCP material requirements**,
run the generator once (needs Python 3 and internet):

```bash
cd eve-manufacturing/tools
python build_recipes.py            # all items
# or:
python build_recipes.py --only-ships
```

It downloads the EVE Static Data Export (industry tables, hosted as CSV by Fuzzwork),
builds the complete recipe map, and overwrites `data/recipes.json`. Reload the page —
the banner disappears and every item is now exact. Re-run it after major EVE patches to
stay current.

---

## Deploy to GitHub Pages

**1. Create the repository**

- Go to <https://github.com/new>, name it e.g. `eve-manufacturing`, make it **Public**, create it.

**2. Upload the files**

Easiest (no command line): on the new repo page click **uploading an existing file**,
then drag in *the contents* of the `eve-manufacturing` folder (the `index.html`, the
`css`/`js`/`data`/`tools` folders, and `.nojekyll`). Commit.

Or with git:

```bash
cd eve-manufacturing
git init
git add .
git commit -m "EVE Forge manufacturing calculator"
git branch -M main
git remote add origin https://github.com/<YOUR-USERNAME>/eve-manufacturing.git
git push -u origin main
```

**3. Turn on Pages**

- In the repo: **Settings → Pages**.
- Under **Build and deployment → Source**, choose **Deploy from a branch**.
- Branch: **main**, folder: **/ (root)**. Save.
- Wait ~1 minute, then your site is live at:
  `https://<YOUR-USERNAME>.github.io/eve-manufacturing/`

**4. (Recommended) Run the generator first** so your live site has the full dataset,
then commit the updated `data/recipes.json`.

---

## Test it locally first

A simple double-click on `index.html` won't work because browsers block `fetch()` of
local files. Serve it over HTTP instead:

```bash
cd eve-manufacturing
python -m http.server 8000
# open http://localhost:8000
```

---

## How pricing works (under the hood)

For each material and the product, the app calls:

```
GET https://esi.evetech.net/latest/markets/{regionId}/orders/?type_id={typeId}&order_type=all
```

It filters to the hub's main station when possible (falls back to region-wide), then takes
the **lowest sell** price (what you'd pay to buy) and the **highest buy** price (what you'd
get selling instantly). ESI sends `Access-Control-Allow-Origin: *`, so the browser can call
it directly — no proxy needed.

---

## Extending it

- **More hubs / structures:** add entries to the `HUBS` object in `js/app.js`.
- **Job fees & taxes:** factor `adjusted_price` from `/markets/prices/` × system cost index
  into the profit calc.
- **Multi-level builds:** recurse into components that are themselves manufacturable
  (the SDE data the generator pulls already contains those sub-recipes).

---

## Credits & legal

Market data via [CCP ESI](https://esi.evetech.net/). Static Data Export mirror by
[Fuzzwork](https://www.fuzzwork.co.uk/). EVE Online and all related logos and images are
trademarks or registered trademarks of **CCP hf.** This is an unofficial, non-commercial
fan tool and is not affiliated with or endorsed by CCP.
