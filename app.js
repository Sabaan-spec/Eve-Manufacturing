/* EVE Forge — Manufacturing Profit Calculator
 * Pure client-side. Live prices via CCP ESI (CORS-enabled). No backend, no keys.
 */

"use strict";

// --- Market hubs: region + main trade station -----------------------------
const HUBS = {
  jita:    { name: "Jita",    region: 10000002, station: 60003760 },
  amarr:   { name: "Amarr",   region: 10000043, station: 60008494 },
  dodixie: { name: "Dodixie", region: 10000032, station: 60011866 },
  rens:    { name: "Rens",    region: 10000030, station: 60004588 },
  hek:     { name: "Hek",     region: 10000042, station: 60005686 },
};

const ESI = "https://esi.evetech.net/latest";
const PRICE_TTL = 5 * 60 * 1000; // 5 min cache

// --- State ----------------------------------------------------------------
let RECIPES = {};         // productTypeId -> { name, productQty, materials:[{id,name,qty}] }
let ITEMS = [];           // [{id, name, productQty, materials, cat}]
let priceCache = new Map(); // key `${region}:${typeId}` -> { ts, sell, buy }
let current = null;       // currently selected item
let activeSuggestion = -1;

// --- DOM ------------------------------------------------------------------
const $ = (id) => document.getElementById(id);
const els = {};
["search","suggestions","hub","me","runs","buystrat","sellstrat","banner",
 "result","empty","product-name","product-meta","refresh","s-matcost",
 "s-revenue","s-profit","s-margin","mat-body","price-note"].forEach(id => els[id] = $(id));

// --- Helpers --------------------------------------------------------------
const isk = (n) => {
  if (n == null || isNaN(n)) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + " ISK";
};
const intf = (n) => n.toLocaleString("en-US");

function meAdjust(baseQty, runs, mePct) {
  // EVE material formula: max(runs, ceil(round(base * runs * (1 - ME/100), 2)))
  const mod = 1 - (mePct / 100);
  const raw = Math.round(baseQty * runs * mod * 100) / 100;
  return Math.max(runs, Math.ceil(raw - 1e-9));
}

// --- Data load ------------------------------------------------------------
async function loadRecipes() {
  const res = await fetch("data/recipes.json", { cache: "no-cache" });
  if (!res.ok) throw new Error("Could not load recipes.json");
  const data = await res.json();

  if (data._note) {
    els.banner.hidden = false;
    els.banner.textContent = data._note;
  }
  const items = data.recipes || data; // allow either {recipes:{}} or flat map
  RECIPES = items;
  ITEMS = Object.entries(items).map(([id, r]) => ({
    id: Number(id),
    name: r.name,
    productQty: r.productQty || 1,
    materials: r.materials || [],
    cat: r.cat || "",
  })).sort((a, b) => a.name.localeCompare(b.name));
}

// --- Price fetching (ESI) -------------------------------------------------
async function getPrice(typeId, hubKey) {
  const hub = HUBS[hubKey];
  const key = `${hub.region}:${typeId}`;
  const cached = priceCache.get(key);
  if (cached && (Date.now() - cached.ts) < PRICE_TTL) return cached;

  const url = `${ESI}/markets/${hub.region}/orders/?datasource=tranquility&order_type=all&type_id=${typeId}`;
  let orders = [];
  try {
    const res = await fetch(url, { headers: { "Accept": "application/json" } });
    if (res.ok) orders = await res.json();
  } catch (e) { /* network/CORS error -> leave empty */ }

  // Prefer orders at the hub station; fall back to whole region.
  const atStation = orders.filter(o => o.location_id === hub.station);
  const scope = atStation.length ? atStation : orders;

  const sells = scope.filter(o => !o.is_buy_order).map(o => o.price);
  const buys  = scope.filter(o =>  o.is_buy_order).map(o => o.price);

  const result = {
    ts: Date.now(),
    sell: sells.length ? Math.min(...sells) : null, // cheapest you can buy at
    buy:  buys.length  ? Math.max(...buys)  : null, // best price you can sell to
    regionWide: !atStation.length && orders.length > 0,
  };
  priceCache.set(key, result);
  return result;
}

// --- Rendering ------------------------------------------------------------
function renderSuggestions(q) {
  const query = q.trim().toLowerCase();
  els.suggestions.innerHTML = "";
  activeSuggestion = -1;
  if (!query) { els.suggestions.hidden = true; return; }

  const matches = ITEMS.filter(i => i.name.toLowerCase().includes(query)).slice(0, 40);
  if (!matches.length) { els.suggestions.hidden = true; return; }

  for (const m of matches) {
    const li = document.createElement("li");
    li.innerHTML = `<span>${m.name}</span><span class="cat">${m.cat || ""}</span>`;
    li.addEventListener("mousedown", (e) => { e.preventDefault(); selectItem(m); });
    els.suggestions.appendChild(li);
  }
  els.suggestions.hidden = false;
}

function selectItem(item) {
  current = item;
  els.search.value = item.name;
  els.suggestions.hidden = true;
  calculate();
}

async function calculate() {
  if (!current) return;
  const hubKey = els.hub.value;
  const me = Math.max(0, Math.min(10, Number(els.me.value) || 0));
  const runs = Math.max(1, Math.floor(Number(els.runs.value) || 1));
  const buyStrat = els.buystrat.value;   // how we pay for materials
  const sellStrat = els.sellstrat.value; // how we get paid for product

  els.empty.hidden = true;
  els.result.hidden = false;
  els.result.classList.add("spin");

  els["product-name"].textContent = current.name;
  els["product-meta"].textContent =
    `${current.materials.length} materials · ${current.productQty * runs} unit(s) output · ME ${me}% · ${runs} run(s) · ${HUBS[hubKey].name}`;

  // Gather all type ids we need priced (materials + product)
  const ids = current.materials.map(m => m.id);
  ids.push(current.id);
  const priceMap = {};
  await Promise.all([...new Set(ids)].map(async id => {
    priceMap[id] = await getPrice(id, hubKey);
  }));

  // Materials table
  els["mat-body"].innerHTML = "";
  let matCost = 0;
  let anyRegionWide = false;
  let anyMissing = false;

  for (const m of current.materials) {
    const qty = meAdjust(m.qty, runs, me);
    const p = priceMap[m.id] || {};
    const unit = buyStrat === "buy" ? p.buy : p.sell;
    const sub = (unit != null) ? unit * qty : null;
    if (sub != null) matCost += sub; else anyMissing = true;
    if (p.regionWide) anyRegionWide = true;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${m.name}</td>
      <td class="num">${intf(qty)}</td>
      <td class="num ${unit==null?'miss':''}">${unit==null?'no orders':isk(unit)}</td>
      <td class="num ${sub==null?'miss':''}">${sub==null?'—':isk(sub)}</td>`;
    els["mat-body"].appendChild(tr);
  }

  // Product value
  const pp = priceMap[current.id] || {};
  const prodUnit = sellStrat === "buy" ? pp.buy : pp.sell;
  const outputUnits = current.productQty * runs;
  const revenue = (prodUnit != null) ? prodUnit * outputUnits : null;
  if (pp.regionWide) anyRegionWide = true;

  const profit = (revenue != null) ? revenue - matCost : null;
  const margin = (revenue != null && revenue > 0) ? (profit / revenue) * 100 : null;

  els["s-matcost"].textContent = isk(matCost);
  els["s-revenue"].textContent = revenue == null ? "no orders" : isk(revenue);

  const profitEl = els["s-profit"];
  profitEl.textContent = profit == null ? "—" : isk(profit);
  profitEl.className = "stat-val " + (profit == null ? "" : profit >= 0 ? "good" : "bad");

  const marginEl = els["s-margin"];
  marginEl.textContent = margin == null ? "—" : margin.toFixed(1) + "%";
  marginEl.className = "stat-val " + (margin == null ? "" : margin >= 0 ? "good" : "bad");

  // Notes
  const notes = [];
  notes.push(`Materials priced at hub ${buyStrat === "buy" ? "buy orders" : "sell orders"}; product at ${sellStrat === "buy" ? "buy orders" : "sell orders"}.`);
  if (anyRegionWide) notes.push("Some prices fell back to region-wide orders (no orders at the hub station).");
  if (anyMissing) notes.push("Some materials had no market orders — material cost is understated.");
  notes.push("Prices cached up to 5 min. Excludes job install fees, taxes & facility bonuses.");
  els["price-note"].textContent = notes.join(" ");

  els.result.classList.remove("spin");
}

// --- Events ---------------------------------------------------------------
els.search.addEventListener("input", (e) => renderSuggestions(e.target.value));
els.search.addEventListener("focus", (e) => { if (e.target.value) renderSuggestions(e.target.value); });
els.search.addEventListener("keydown", (e) => {
  const items = [...els.suggestions.querySelectorAll("li")];
  if (!items.length) return;
  if (e.key === "ArrowDown") { e.preventDefault(); activeSuggestion = Math.min(activeSuggestion + 1, items.length - 1); }
  else if (e.key === "ArrowUp") { e.preventDefault(); activeSuggestion = Math.max(activeSuggestion - 1, 0); }
  else if (e.key === "Enter") {
    e.preventDefault();
    const name = (activeSuggestion >= 0 ? items[activeSuggestion].textContent : els.search.value).trim();
    const match = ITEMS.find(i => i.name === name) || ITEMS.find(i => i.name.toLowerCase().includes(els.search.value.trim().toLowerCase()));
    if (match) selectItem(match);
    return;
  } else return;
  items.forEach((li, i) => li.classList.toggle("active", i === activeSuggestion));
});
document.addEventListener("click", (e) => {
  if (!els.suggestions.contains(e.target) && e.target !== els.search) els.suggestions.hidden = true;
});

["hub","me","runs","buystrat","sellstrat"].forEach(id =>
  els[id].addEventListener("change", () => current && calculate()));
els.refresh.addEventListener("click", () => { priceCache.clear(); calculate(); });

// --- Init -----------------------------------------------------------------
(async function init() {
  try {
    await loadRecipes();
    els.search.placeholder = `Start typing… ${ITEMS.length} items loaded`;
  } catch (err) {
    els.banner.hidden = false;
    els.banner.textContent = "Failed to load recipe data: " + err.message;
  }
})();
