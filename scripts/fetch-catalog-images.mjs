// One-time script: fetches a real photo per catalog entry from the
// Pexels API and writes imageUrl/photographerName/photographerUrl
// directly into lib/landscaping/catalog-data.ts.
//
// Usage:
//   PEXELS_API_KEY=your_key_here node scripts/fetch-catalog-images.mjs
//
// Written in plain JS (not TS) deliberately - no tsx/ts-node is in this
// project's devDependencies, and adding one just for a script that runs
// once isn't worth it. Processes catalog-data.ts as text instead of
// importing it, which works cleanly because every entry is written on
// a single line - a real constraint of this approach, not a hidden risk,
// so re-run this after any manual reformatting of that file.
//
// Rate limits: Pexels' free tier is 200 requests/hour, 20,000/month -
// this script makes one request per catalog entry (currently ~65),
// comfortably inside that even before any approval step.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CATALOG_PATH = join(__dirname, "..", "lib", "landscaping", "catalog-data.ts");

const API_KEY = process.env.PEXELS_API_KEY;
if (!API_KEY) {
  console.error("Set PEXELS_API_KEY first. Get a free key at https://www.pexels.com/api/");
  process.exit(1);
}

async function searchPexels(query) {
  const res = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`, {
    headers: { Authorization: API_KEY },
  });
  if (!res.ok) {
    console.error(`Pexels request failed for "${query}": ${res.status}`);
    return null;
  }
  const data = await res.json();
  const photo = data.photos?.[0];
  if (!photo) return null;
  return {
    imageUrl: photo.src.large,
    photographerName: photo.photographer,
    photographerUrl: photo.photographer_url,
  };
}

// Matches a single-line PlantEntry or GardenStyleEntry object literal
// and captures its `name` field. Deliberately narrow - only touches
// lines that already have this exact shape.
const ENTRY_LINE_RE = /^(\s*\{[^}]*\bname:\s*"([^"]+)"[^}]*\})(,?)\s*$/;

async function main() {
  let content = readFileSync(CATALOG_PATH, "utf8");
  const lines = content.split("\n");
  let updated = 0;
  let skipped = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(ENTRY_LINE_RE);
    if (!match) continue;
    if (line.includes("imageUrl:")) {
      skipped++;
      continue; // already populated, don't re-spend a request
    }

    const [, objectLiteral, name, trailingComma] = match;
    process.stdout.write(`Fetching "${name}"... `);

    const result = await searchPexels(`${name} plant`);
    if (!result) {
      console.log("no result, skipping");
      continue;
    }

    const withImage = objectLiteral.replace(
      /\}$/,
      `, imageUrl: ${JSON.stringify(result.imageUrl)}, photographerName: ${JSON.stringify(result.photographerName)}, photographerUrl: ${JSON.stringify(result.photographerUrl)} }`
    );
    lines[i] = withImage + trailingComma;
    updated++;
    console.log("done");

    // Stay comfortably under the free-tier rate limit even on a fresh,
    // unapproved key.
    await new Promise((r) => setTimeout(r, 300));
  }

  writeFileSync(CATALOG_PATH, lines.join("\n"));
  console.log(`\nUpdated ${updated} entries, skipped ${skipped} already-populated ones.`);
}

main();
