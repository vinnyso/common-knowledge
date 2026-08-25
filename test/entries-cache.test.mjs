import test from "node:test";
import assert from "node:assert/strict";
import { __testing } from "../src/search-cache.mjs";

test("tokens produces lowercase alphanumeric tokens", () => {
  const out = __testing.tokens("Hello, world! 123");
  assert.deepEqual(out, ["hello", "world", "123"]);
});

test("bracket classes: simple inclusion and exclusion", () => {
  assert(__testing.scopeMatches("[ab].ts", "a.ts"), "a.ts should match [ab].ts");
  assert(__testing.scopeMatches("[ab].ts", "b.ts"), "b.ts should match [ab].ts");
  assert(!__testing.scopeMatches("[ab].ts", "c.ts"), "c.ts should not match [ab].ts");
});

test("bracket ranges and negation", () => {
  assert(__testing.scopeMatches("[a-c].ts", "b.ts"));
  assert(!__testing.scopeMatches("[a-c].ts", "d.ts"));
  assert(__testing.scopeMatches("[!ab].ts", "c.ts"));
  assert(!__testing.scopeMatches("[!ab].ts", "a.ts"));
});

test("compileScopePattern caches compiled RegExp objects", () => {
  const p = "[ab].ts";
  const r1 = __testing.compileScopePattern(p);
  const r2 = __testing.compileScopePattern(p);
  assert.strictEqual(r1, r2);
});

test("compileScopePattern handles wildcards and ** correctly", () => {
  assert(__testing.scopeMatches("src/**/*.ts", "src/a/b/c/file.ts"));
  assert(__testing.scopeMatches("src/**/file.ts", "src/file.ts"));
  assert(__testing.scopeMatches("src/*/file.ts", "src/one/file.ts"));
  assert(!__testing.scopeMatches("src/*/file.ts", "src/a/b/file.ts"));
});
