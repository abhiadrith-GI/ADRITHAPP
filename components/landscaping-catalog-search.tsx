"use client";

import { useMemo, useState } from "react";
import { PLANT_ENTRIES, GARDEN_STYLE_ENTRIES, PLANTER_MATERIALS } from "@/lib/landscaping/catalog-data";

const CATEGORY_LABELS: Record<string, string> = {
  interior: "Interior Plants",
  "exterior-tree": "Trees",
  "exterior-shrub": "Flowering Shrubs",
  "exterior-succulent": "Succulents",
  "exterior-climber": "Climbers",
  "lawn-grass": "Lawn Grass",
};

export function LandscapingCatalogSearch() {
  const [query, setQuery] = useState("");
  const [openPlant, setOpenPlant] = useState<string | null>(null);

  const filteredPlants = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return PLANT_ENTRIES;
    return PLANT_ENTRIES.filter((p) => `${p.name} ${p.benefit} ${p.keywords}`.toLowerCase().includes(q));
  }, [query]);

  const filteredStyles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return GARDEN_STYLE_ENTRIES;
    return GARDEN_STYLE_ENTRIES.filter((s) => `${s.name} ${s.description} ${s.keywords}`.toLowerCase().includes(q));
  }, [query]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof PLANT_ENTRIES>();
    for (const p of filteredPlants) {
      if (!map.has(p.category)) map.set(p.category, []);
      map.get(p.category)!.push(p);
    }
    return Array.from(map.entries());
  }, [filteredPlants]);

  return (
    <div>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search plants, grass, garden styles…"
        className="mb-4 w-full rounded-lg border border-white/20 bg-[var(--adrith-card)] px-3 py-2.5 text-sm outline-none"
      />

      {grouped.length === 0 && filteredStyles.length === 0 && (
        <p className="text-center text-sm text-[var(--adrith-dim-2)]">Nothing matches that search.</p>
      )}

      {grouped.map(([category, plants]) => (
        <div key={category} className="mb-5">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            {CATEGORY_LABELS[category] ?? category}
          </p>
          <div className="flex flex-col gap-1.5">
            {plants.map((p) => (
              <div key={p.name} className="rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => setOpenPlant(openPlant === p.name ? null : p.name)}
                  className="flex w-full items-center justify-between text-left"
                >
                  <span className="text-sm font-medium">{p.name}</span>
                  <span className="text-xs text-[var(--adrith-dim-2)]">{openPlant === p.name ? "−" : "+"}</span>
                </button>
                {openPlant === p.name && (
                  <div className="mt-2 space-y-1 text-xs text-[var(--adrith-dim-2)]">
                    <p>
                      <span className="text-[var(--adrith-rust)]">Benefit: </span>
                      {p.benefit}
                    </p>
                    <p>
                      <span className="text-[var(--adrith-rust)]">Care: </span>
                      {p.care}
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}

      {filteredStyles.length > 0 && (
        <div className="mb-5">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            Garden Styles
          </p>
          <div className="flex flex-col gap-1.5">
            {filteredStyles.map((s) => (
              <div key={s.name} className="rounded-lg border border-white/15 bg-[var(--adrith-card)] px-3 py-2.5">
                <p className="text-sm font-medium">{s.name}</p>
                <p className="mt-1 text-xs text-[var(--adrith-dim-2)]">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {!query && (
        <div className="mb-2">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-wider text-[var(--adrith-dim)]">
            Planter Materials
          </p>
          <div className="flex flex-wrap gap-1.5">
            {PLANTER_MATERIALS.map((m) => (
              <span
                key={m.material}
                title={m.description}
                className="rounded-full border border-white/15 px-2.5 py-1 text-xs text-[var(--adrith-dim-2)]"
              >
                {m.material}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
