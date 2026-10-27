import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
import Ajv from "ajv";

const assets = resolve("evaluation/legacy-orders");
function run(root, args = []) {
  return spawnSync("python3", [join(root, "verify.py"), ...args], { encoding: "utf8" });
}

test("evaluation freeze detects changed prompts, added answers and missing explicit bundle", () => {
  const scratch = mkdtempSync(join(tmpdir(), "ck40-assets-"));
  try {
    const copy = join(scratch, "assets");
    cpSync(assets, copy, { recursive: true, filter: (path) => !path.includes("__pycache__") });
    assert.equal(run(copy).status, 0);
    const task = join(copy, "tasks/reference-import.txt");
    const original = readFileSync(task);
    writeFileSync(task, "changed task\n");
    assert.match(run(copy).stderr, /frozen content differs: tasks\/reference-import.txt/u);
    writeFileSync(task, original);
    writeFileSync(join(copy, "private/leaked-answer.txt"), "unexpected material\n");
    assert.match(run(copy).stderr, /frozen file inventory differs/u);
    rmSync(join(copy, "private/leaked-answer.txt"));
    assert.match(run(copy, ["--restore", join(scratch, "app")]).stderr, /requires an explicit --bundle/u);
    writeFileSync(join(copy, "private/freeze.json"), "{}\n");
    assert.match(run(copy).stderr, /frozen file inventory differs/u);
    rmSync(join(copy, "private/freeze.json"));
    const invalid = join(scratch, "invalid.bundle");
    writeFileSync(invalid, "not the approved artifact\n");
    assert.match(run(copy, ["--bundle", invalid]).stderr, /bundle size\/digest mismatch/u);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
});

test("outcome records preserve unavailable observations and reject fabricated success shorthand", () => {
  const schema = JSON.parse(readFileSync(join(assets, "result.schema.json"), "utf8"));
  const validate = new Ajv({ strict: true }).compile(schema);
  const sample = {
    record_type: "outcome", run_id: "synthetic-validator-example", scenario: "reference-import", condition: "baseline",
    attempt: { status: "infrastructure_invalid", reason: "client startup failed" }, candidate: null,
    freeze_sha256: "0".repeat(64), task_sha256: "0".repeat(64), application_revision: "0".repeat(40), ck_revision: "0".repeat(40),
    client: { version: "synthetic", model: "synthetic", settings: {}, runtime: {} },
    knowledge: Object.fromEntries(["retrieved", "read_before_decision", "applicable", "followed", "stale", "conflicting", "noisy"].map((key) => [key, "unavailable"])),
    outcome: { public: "not_run", functional: "not_run", architectural: "not_run" },
    evidence: { tool_events: null, candidate_diff: null, evaluator: null, isolation: null },
    effort_seconds: { preparation: null, execution: null, correction: null, review: null }, gaps: ["Synthetic schema test; not a trial record"],
  };
  assert.equal(validate(sample), true, JSON.stringify(validate.errors));
  const incomplete = structuredClone(sample);
  delete incomplete.knowledge.read_before_decision;
  assert.equal(validate(incomplete), false);
  const contradictory = structuredClone(sample);
  contradictory.candidate = "0".repeat(40);
  contradictory.outcome.functional = "pass";
  assert.equal(validate(contradictory), false);
  const invented = structuredClone(sample);
  invented.knowledge.followed = "probably";
  assert.equal(validate(invented), false);
});

test("evaluator cannot accept an empty or skipped test run as acceptance evidence", () => {
  const probe = spawnSync("python3", ["-c", `
import sys
sys.path.insert(0, ${JSON.stringify(assets)})
from evaluate import reports_complete
required={"acceptance": 4}
assert not reports_complete({"reports": []}, required)
assert not reports_complete({"reports": [{"name":"acceptance","tests":"4","skipped":"4"}]}, required)
assert not reports_complete({"reports": [{"name":"acceptance","tests":"1","skipped":"0"}]}, required)
assert reports_complete({"reports": [{"name":"acceptance","tests":"4","skipped":"0"}]}, required)
`], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
});
