"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { HEIGHT_ENTRIES, type HeightEntry } from "@/lib/plumbing-electrical/standard-heights-data";

const RUST = "#b45526";
const RUST_SOFT = "#f2e3d8";
const INK = "#1c1a17";
const INK_SOFT = "#56504a";
const RULE = "#e4dfd6";
const PAPER_SHADE = "#f7f5f1";

type Trade = "all" | "plumbing" | "electrical";

export function StandardHeightsSheet({ initialTrade }: { initialTrade: Trade }) {
  const [query, setQuery] = useState("");
  const [trade, setTrade] = useState<Trade>(initialTrade);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return HEIGHT_ENTRIES.filter((d) => {
      if (trade !== "all" && d.trade !== trade) return false;
      if (!q) return true;
      const hay = `${d.name} ${d.section} ${d.keywords} ${d.notes}`.toLowerCase();
      return hay.includes(q);
    });
  }, [query, trade]);

  const sections = useMemo(() => {
    const map = new Map<string, { trade: HeightEntry["trade"]; section: string; items: HeightEntry[] }>();
    for (const d of filtered) {
      const key = `${d.trade}::${d.section}`;
      if (!map.has(key)) map.set(key, { trade: d.trade, section: d.section, items: [] });
      map.get(key)!.items.push(d);
    }
    return Array.from(map.values());
  }, [filtered]);

  return (
    <div style={{ background: PAPER_SHADE, minHeight: "100vh", fontFamily: "-apple-system, Inter, Segoe UI, Roboto, Helvetica, Arial, sans-serif" }}>
      <div style={{ maxWidth: 720, margin: "0 auto", background: "#fff", minHeight: "100vh", boxShadow: `0 0 0 1px ${RULE}` }}>
        <header style={{ padding: "24px 20px 16px", borderBottom: `3px solid ${INK}` }}>
          <Link href="/dashboard/plumbing-electrical" style={{ fontSize: 12, color: INK_SOFT, textDecoration: "none" }}>
            ← Plumbing &amp; Electrical
          </Link>
          <p style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: RUST, fontWeight: 700, margin: "10px 0 6px" }}>
            ADRITH · Reference — view only
          </p>
          <h1 style={{ fontSize: 21, margin: "0 0 4px", color: INK, letterSpacing: "-0.01em" }}>
            Plumbing &amp; Electrical Standards
          </h1>
          <p style={{ fontSize: 13, color: INK_SOFT, margin: 0, lineHeight: 1.5 }}>
            Standard installation heights and points, room by room. Every figure in millimetres and feet/inches.
          </p>
        </header>

        <div style={{ position: "sticky", top: 0, background: "#fff", padding: "12px 20px", borderBottom: `1px solid ${RULE}`, zIndex: 10 }}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder='Search — try "toilet", "geyser", "AC point", "switch"…'
            style={{
              width: "100%",
              padding: "11px 14px",
              fontSize: 15,
              border: `1.5px solid ${INK}`,
              borderRadius: 3,
              fontFamily: "inherit",
              background: "#fff",
              color: INK,
              boxSizing: "border-box",
            }}
          />
          {query.trim() && (
            <p style={{ fontSize: 11, color: INK_SOFT, marginTop: 6 }}>
              {filtered.length} result{filtered.length === 1 ? "" : "s"} for &quot;{query}&quot;
            </p>
          )}
        </div>

        <div style={{ display: "flex", borderBottom: `1px solid ${RULE}` }}>
          {(["all", "plumbing", "electrical"] as Trade[]).map((t) => (
            <button
              key={t}
              onClick={() => setTrade(t)}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "11px 8px",
                fontSize: 12,
                fontWeight: 700,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: trade === t ? RUST : INK_SOFT,
                borderBottom: trade === t ? `3px solid ${RUST}` : "3px solid transparent",
                background: "none",
                border: "none",
                borderBottomWidth: 3,
                borderBottomStyle: "solid",
                borderBottomColor: trade === t ? RUST : "transparent",
                cursor: "pointer",
                fontFamily: "inherit",
              }}
            >
              {t}
            </button>
          ))}
        </div>

        <main style={{ padding: "4px 20px 60px" }}>
          {sections.length === 0 ? (
            <p style={{ padding: "40px 10px", textAlign: "center", color: INK_SOFT, fontSize: 13.5 }}>
              No matches. Try a simpler word — &quot;tap&quot;, &quot;switch&quot;, &quot;toilet&quot;.
            </p>
          ) : (
            sections.map((s) => (
              <div key={`${s.trade}::${s.section}`}>
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                    color: INK,
                    margin: "26px 0 2px",
                    paddingBottom: 8,
                    borderBottom: `2px solid ${INK}`,
                  }}
                >
                  {s.trade === "plumbing" ? "🔧" : "⚡"} {s.section}
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 6 }}>
                  <tbody>
                    {s.items.map((d, i) => (
                      <tr key={i} style={{ borderBottom: `1px solid ${RULE}` }}>
                        <td style={{ padding: "10px 8px 10px 4px", verticalAlign: "top", fontSize: 13.5, fontWeight: 600, width: "34%", color: INK }}>
                          {d.name}
                          {d.flag && (
                            <span
                              style={{
                                display: "inline-block",
                                fontSize: 9.5,
                                fontWeight: 700,
                                letterSpacing: "0.04em",
                                textTransform: "uppercase",
                                padding: "1px 6px",
                                borderRadius: 2,
                                background: RUST_SOFT,
                                color: RUST,
                                marginLeft: 6,
                              }}
                            >
                              {d.flag}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: "10px 8px 10px 4px", verticalAlign: "top", fontSize: 13.5, width: "34%", color: INK, whiteSpace: "nowrap" }}>
                          {d.imperial}
                          <span style={{ color: INK_SOFT, fontSize: 12, display: "block" }}>{d.mm}</span>
                        </td>
                        <td style={{ padding: "10px 4px", verticalAlign: "top", fontSize: 12, color: INK_SOFT, lineHeight: 1.5 }}>{d.notes}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))
          )}
        </main>

        <footer style={{ padding: "16px 20px 40px", fontSize: 11, color: INK_SOFT, borderTop: `1px solid ${RULE}`, marginTop: 20, lineHeight: 1.6 }}>
          Sourced from IS 2064:1993, IS 2556 Part 4, IS 732, NBC 2016 (Parts
          3, 8 &amp; 9), IS 1172, and standardised Indian site practice.
          Figures marked CONVENTION are common site practice rather than a
          direct code clause. General reference material — always confirm
          against the actual project drawing before cutting a wall.
        </footer>
      </div>
    </div>
  );
}
