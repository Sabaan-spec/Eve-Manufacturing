#!/usr/bin/env python3
"""
build_recipes.py — generate the complete, exact recipe dataset for EVE Forge.

The live site (index.html) ships with a small embedded SAMPLE dataset. This
script produces a full data/recipes.json from CCP's Static Data Export (SDE,
hosted as CSV by Fuzzwork). When that file is present next to index.html, the
page loads it automatically and the yellow "sample" banner disappears.

Usage:
    python build_recipes.py              # all manufacturable items
    python build_recipes.py --only-ships # restrict to ships
Then upload the generated data/recipes.json into the repo (same folder as
index.html, inside a data/ directory). No EVE account or API key needed.
"""

import argparse, csv, io, json, os, sys, urllib.request

BASE = "https://www.fuzzwork.co.uk/dump/latest"
FILES = {
    "types":     f"{BASE}/invTypes.csv",
    "groups":    f"{BASE}/invGroups.csv",
    "products":  f"{BASE}/industryActivityProducts.csv",
    "materials": f"{BASE}/industryActivityMaterials.csv",
}
MANUFACTURING = "1"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "data", "recipes.json")


def fetch_csv(url):
    print(f"  downloading {url} ...", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "eve-forge-recipe-builder"})
    with urllib.request.urlopen(req, timeout=120) as resp:
        return list(csv.DictReader(io.StringIO(resp.read().decode("utf-8", "replace"))))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only-ships", action="store_true")
    ap.add_argument("--include-unpublished", action="store_true")
    args = ap.parse_args()

    print("Fetching SDE tables...")
    try:
        types = fetch_csv(FILES["types"])
        groups = fetch_csv(FILES["groups"])
        products = fetch_csv(FILES["products"])
        materials = fetch_csv(FILES["materials"])
    except Exception as e:
        print(f"\nFAILED to download SDE data: {e}", file=sys.stderr)
        sys.exit(1)

    name_of, pub_of, group_of = {}, {}, {}
    for t in types:
        name_of[t["typeID"]] = t["typeName"]
        pub_of[t["typeID"]] = t.get("published", "1") in ("1", "True", "true")
        group_of[t["typeID"]] = t.get("groupID", "")

    cat_of_group, gname_of_group = {}, {}
    for g in groups:
        cat_of_group[g["groupID"]] = g.get("categoryID", "")
        gname_of_group[g["groupID"]] = g.get("groupName", "")

    bp_to_product = {}
    for p in products:
        if p["activityID"] == MANUFACTURING:
            bp_to_product[p["typeID"]] = (p["productTypeID"], int(p["quantity"]))

    bp_materials = {}
    for m in materials:
        if m["activityID"] == MANUFACTURING:
            bp_materials.setdefault(m["typeID"], []).append((m["materialTypeID"], int(m["quantity"])))

    recipes = {}
    for bp, (prod, pqty) in bp_to_product.items():
        mats = bp_materials.get(bp)
        if not mats:
            continue
        if not args.include_unpublished and not pub_of.get(prod, False):
            continue
        gid = group_of.get(prod, "")
        if args.only_ships and cat_of_group.get(gid, "") != "6":
            continue
        recipes[prod] = {
            "name": name_of.get(prod, f"Type {prod}"),
            "cat": gname_of_group.get(gid, ""),
            "productQty": pqty,
            "materials": [{"id": int(mid), "name": name_of.get(mid, f"Type {mid}"), "qty": q} for mid, q in mats],
        }

    payload = {"_generated": "full-sde",
               "recipes": dict(sorted(recipes.items(), key=lambda kv: recipes[kv[0]]["name"]))}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    print(f"\nWrote {len(recipes):,} recipes to {os.path.relpath(OUT)}")
    print("Upload data/recipes.json into the repo (next to index.html). The sample banner will disappear.")


if __name__ == "__main__":
    main()
