import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";

import { initializeCorpus } from "../dist/corpus.js";
import {
  compileSearchScopePattern,
  searchEntriesWithScopePatternCompiler,
} from "../dist/entries.js";

const entryCount = 240;
const samples = 9;
const warmupSamples = 2;
const patterns = ["apps/api/**", "apps/web/**", "packages/core/**", "src/[ab].ts"];
const queries = [
  { query: "cache workflow", path: "apps/api/routes/cache.ts" },
  { query: "cache workflow", path: "apps/web/pages/cache.ts" },
  { query: "cache workflow", path: "packages/core/cache.ts" },
  { query: "cache workflow", path: "src/a.ts" },
];

function entrySource(index) {
  const scope = [
    patterns[index % patterns.length],
    patterns[(index + 1) % patterns.length],
    patterns[(index + 2) % patterns.length],
  ];
  const metadata = {
    schema_version: 1,
    id: `benchmark-${String(index).padStart(3, "0")}`,
    kind: "gotcha",
    title: `Cache workflow ${index}`,
    triggers: ["cache workflow"],
    scope: { paths: scope },
    status: "active",
    created_at: "2026-08-25T00:00:00Z",
    created_by: "benchmark",
  };
  return `---\n${Object.entries(metadata)
    .map(([key, value]) => `${key}: ${JSON.stringify(value)}`)
    .join("\n")}\n---\n## Situation\n\nBenchmark fixture.\n\n## Resolution\n\nUse the documented workflow.\n`;
}

function createFixture() {
  const cwd = mkdtempSync(join(tmpdir(), "common-knowledge-search-benchmark-"));
  initializeCorpus(cwd);
  for (let index = 0; index < entryCount; index += 1) {
    writeFileSync(
      join(cwd, ".repo-memory", "entries", `benchmark-${String(index).padStart(3, "0")}.md`),
      entrySource(index),
      "utf8",
    );
  }
  return cwd;
}

function measure(cwd, cachePatterns) {
  let compilations = 0;
  const compiler = (pattern) => {
    compilations += 1;
    return compileSearchScopePattern(pattern);
  };
  const started = performance.now();
  for (const options of queries) {
    searchEntriesWithScopePatternCompiler(
      cwd,
      options.query,
      { path: options.path },
      compiler,
      cachePatterns,
    );
  }
  return { elapsedMilliseconds: performance.now() - started, compilations };
}

function median(values) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

const cwd = createFixture();
try {
  for (let index = 0; index < warmupSamples; index += 1) {
    measure(cwd, false);
    measure(cwd, true);
  }

  const baseline = [];
  const reconstructed = [];
  for (let index = 0; index < samples; index += 1) {
    baseline.push(measure(cwd, false));
    reconstructed.push(measure(cwd, true));
  }

  const uniquePatternsPerSearch = patterns.length;
  for (const sample of reconstructed) {
    assert.ok(
      sample.compilations <= uniquePatternsPerSearch * queries.length,
      "reconstructed strategy compiled a pattern more than once in a candidate search",
    );
  }
  for (const [index, sample] of reconstructed.entries()) {
    assert.ok(
      sample.compilations < (baseline[index]?.compilations ?? 0),
      "reconstructed strategy did not reduce Scope-pattern compilation work",
    );
  }

  console.log("Search benchmark (non-gating explanatory evidence)");
  console.log(`fixture: ${entryCount} generated Entries; ${queries.length} fixed path queries`);
  console.log(`warm-up samples: ${warmupSamples}; measured samples: ${samples}`);
  console.log(
    `naive repeated-work baseline: median ${median(baseline.map((sample) => sample.elapsedMilliseconds)).toFixed(2)} ms; ` +
      `Scope compilations ${median(baseline.map((sample) => sample.compilations))}`,
  );
  console.log(
    `reconstructed per-search strategy: median ${median(reconstructed.map((sample) => sample.elapsedMilliseconds)).toFixed(2)} ms; ` +
      `Scope compilations ${median(reconstructed.map((sample) => sample.compilations))}`,
  );
  console.log(
    `deterministic reduction: at most ${uniquePatternsPerSearch} unique patterns per candidate search; ` +
      "reconstructed compilation count is lower than the baseline for every measured sample.",
  );
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
