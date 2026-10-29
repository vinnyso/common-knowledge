import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import test from "node:test";
import Ajv from "ajv";

test("an auth file with a logged-out client stops before inventory discovery", () => {
  const probe = spawnSync("python3", ["-c", `
import json,os,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path("evaluation/legacy-orders").resolve()))
from client_audit import audit
with tempfile.TemporaryDirectory(prefix="ck50-client-test-") as scratch:
    root=Path(scratch)
    for name in ["app","home","codex","tmp","bin"]:
        (root/name).mkdir()
    features=json.loads(Path("evaluation/legacy-orders/conditions.json").read_text())["common"]["disabled_features"]
    config='default_permissions = "ck40"'+chr(10)+'approval_policy = "never"'+chr(10)+'web_search = "disabled"'+chr(10)+'[features]'+chr(10)
    config+=''.join(name+' = false'+chr(10) for name in features)
    (root/"codex/config.toml").write_text(config)
    (root/"codex/auth.json").write_text('{"OPENAI_API_KEY": null}')
    executable=root/"bin/codex"
    executable.write_text('#!'+sys.executable+chr(10)+'''
import json,sys
from pathlib import Path
root=Path.cwd().parent
for line in sys.stdin:
    message=json.loads(line)
    with (root/"requests.jsonl").open("a") as log:
        log.write(json.dumps(message)+chr(10))
    method=message["method"]
    if "id" not in message:
        continue
    result={}
    if method=="account/read":
        result={"account":None,"requiresOpenaiAuth":True}
    elif method=="mcpServerStatus/list":
        result={"data":[],"nextCursor":None}
    elif method=="skills/list":
        result={"data":[{"cwd":str(root/"app"),"skills":[],"errors":[]}]}
    print(json.dumps({"id":message["id"],"result":result}),flush=True)
''')
    executable.chmod(0o755)
    os.environ["PATH"]=str(root/"bin")+os.pathsep+os.environ["PATH"]
    try:
        audit(root,"baseline")
    except ValueError as error:
        assert "authenticated ChatGPT account" in str(error)
    else:
        raise AssertionError("logged-out file accepted")
    requests=[json.loads(line) for line in (root/"requests.jsonl").read_text().splitlines()]
    assert [request["method"] for request in requests]==["initialize","initialized","account/read"]
    assert requests[-1]["params"]=={"refreshToken":True}
`], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
});

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

test("authenticated client inventory rejects connected apps, mutation tools and external skills", () => {
  const probe = spawnSync("python3", ["-c", `
import sys
from pathlib import Path
sys.path.insert(0, ${JSON.stringify(assets)})
from client_audit import validate_authentication, validate_inventory
for response in [{},{"account":None},{"account":{"type":"apiKey"}}]:
    try:
        validate_authentication(response)
    except ValueError as error:
        assert "authenticated ChatGPT account" in str(error)
    else:
        raise AssertionError("logged-out or wrong-route client accepted")
assert validate_authentication({"account":{"type":"chatgpt","email":"private","id":"private"}})=={"type":"chatgpt","token_refresh_requested":True}
run=Path("/private/tmp/ck40-runs/synthetic-audit")
skills={"data":[{"cwd":str(run/"app"),"skills":[],"errors":[]}]}
empty={"data":[],"nextCursor":None}
ck={"name":"common_knowledge","tools":{name:{"name":name} for name in ["read","search","validate"]}}
assert validate_inventory("baseline",empty,skills,run)["mcp"]==[]
assert validate_inventory("current_ck",{"data":[ck]},skills,run)["mcp"][0]["tools"]==["read","search","validate"]
def rejected(condition,mcp,found_skills,expected):
    try:
        validate_inventory(condition,mcp,found_skills,run)
    except ValueError as error:
        assert expected in str(error),str(error)
    else:
        raise AssertionError("unsafe inventory accepted")
apps={"name":"codex_apps","tools":{}}
rejected("baseline",{"data":[apps]},skills,"unexpected MCP server")
rejected("current_ck",{"data":[ck,apps]},skills,"unexpected MCP server")
rejected("current_ck",empty,skills,"unexpected MCP server")
for names in [["read","search"],["read","search","validate","proposal_apply"]]:
    server={"name":"common_knowledge","tools":{name:{"name":name} for name in names}}
    rejected("current_ck",{"data":[server]},skills,"unexpected CK tool")
rejected("baseline",{"data":[],"nextCursor":"more"},skills,"incomplete")
rejected("baseline",empty,{"data":[{"cwd":str(run/"app"),"skills":[],"errors":["unreadable"]}]},"discovery failed")
for scope,path in [("user",run/"codex/skills/user/SKILL.md"),("system",Path("/outside/SKILL.md"))]:
    external={"data":[{"cwd":str(run/"app"),"skills":[{"enabled":True,"scope":scope,"path":str(path)}]}]}
    rejected("baseline",empty,external,"unexpected user or plugin skill")
`], { encoding: "utf8" });
  assert.equal(probe.status, 0, probe.stderr);
});
