import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";
import { ESLint } from "eslint";

const eslint = new ESLint();
const filePath = resolve("src/index.ts");

for (const [rule, code] of [
  ["no-floating-promises", "Promise.resolve(1);"],
  ["no-misused-promises", "if (Promise.resolve(true)) { console.log('bad'); }"],
  ["switch-exhaustiveness-check", 'function choose(value: "read" | "write") { switch (value) { case "read": return 1; } }'],
]) {
  test(`correctness lint rejects ${rule}`, async () => {
    const [result] = await eslint.lintText(code, { filePath });
    assert.ok(result.messages.some((message) =>
      message.ruleId === `@typescript-eslint/${rule}` && message.severity === 2));
    assert.equal(result.fatalErrorCount, 0);
  });
}

test("correctness lint accepts handled promises and exhaustive switches", async () => {
  const [result] = await eslint.lintText(`
    async function run() { await Promise.resolve(1); }
    void run();
    function choose(value: "read" | "write") {
      switch (value) { case "read": return 1; case "write": return 2; }
    }
  `, { filePath });
  assert.equal(result.errorCount, 0, JSON.stringify(result.messages));
});
