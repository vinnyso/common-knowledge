#!/usr/bin/env python3
"""Evaluate a saved candidate in a separate author-only copy; never calls a model."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tarfile
import time
import xml.etree.ElementTree as ET
from verify import verify_assets

ROOT = Path(__file__).resolve().parent
CHECKS = {"reference-import": ["CKReferenceTest"], "dispatch-export": ["CKDispatchTest"], "csv-quoting": ["CKCsvTest", "CKCsvEndpointTest"]}


def run_gate(work, command, env, name):
    log = work.parent / f"{work.name}-{name}.log"
    started = time.monotonic()
    with log.open("w") as output:
        result = subprocess.run(command, cwd=work, env=env, stdout=output, stderr=subprocess.STDOUT, check=False, timeout=600)
    reports = []
    for folder in ("surefire-reports", "failsafe-reports"):
        for report in sorted((work / "target" / folder).glob("TEST-*.xml")):
            suite = ET.parse(report).getroot()
            reports.append({key: suite.attrib.get(key) for key in ("name", "tests", "failures", "errors", "skipped")})
    return {"exit_code": result.returncode, "seconds": round(time.monotonic()-started, 3), "command": command,
            "log": str(log), "log_sha256": hashlib.sha256(log.read_bytes()).hexdigest(), "reports": reports}


def reports_complete(gate, required):
    suites={r["name"]:r for r in gate["reports"]}
    return all(name in suites and int(suites[name]["tests"]) >= count and int(suites[name]["skipped"]) == 0
               for name,count in required.items())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--revision", required=True)
    parser.add_argument("--scenario", choices=CHECKS, required=True)
    parser.add_argument("--work", type=Path, required=True, help="new author-only path; never task-agent checkout")
    parser.add_argument("--cache", type=Path, required=True)
    args = parser.parse_args()
    frozen = verify_assets()
    freeze_digest=hashlib.sha256((ROOT/"freeze.json").read_bytes()).hexdigest()
    revision = subprocess.check_output(["git", "-C", str(args.source), "rev-parse", "--verify", args.revision+"^{commit}"], text=True).strip()
    if revision != args.revision:
        parser.error("revision must be a full immutable commit SHA")
    args.work.mkdir(parents=True, exist_ok=False)
    archive = subprocess.check_output(["git", "-C", str(args.source), "archive", revision])
    import io
    with tarfile.open(fileobj=io.BytesIO(archive)) as saved:
        saved.extractall(args.work, filter="data")
    # Guard public evidence before installing private tests. Candidate additions are allowed.
    for name, expected in frozen["protected_application_files"].items():
        actual = args.work / name
        if not actual.is_file() or hashlib.sha256(actual.read_bytes()).hexdigest() != expected:
            raise SystemExit(f"protected application input changed: {name}")
    original_build_files={p for p in frozen["protected_application_files"] if p.startswith(".mvn/")}
    actual_build_files={p.relative_to(args.work).as_posix() for p in (args.work/".mvn").rglob("*") if p.is_file()}
    if actual_build_files != original_build_files:
        raise SystemExit("Maven Wrapper/configuration inventory changed")
    env = os.environ.copy()
    env.update(npm_config_cache=str(args.cache.resolve()), npm_config_offline="true")
    maven = ["./mvnw", "-o", "-B", "-ntp", f"-Dmaven.repo.local={args.cache.resolve() / 'm2'}"]
    public = run_gate(args.work, maven+["-Pconsole", "clean", "verify"], env, "public")
    public["evidence_valid"]=reports_complete(public,frozen["public_test_counts"])
    tests = args.work / "src/test/java/com/northstar/orders"
    for name in CHECKS[args.scenario]+([] if args.scenario == "csv-quoting" else ["CKBoundaryTest"]):
        target=tests/f"{name}.java"
        if target.exists():
            raise SystemExit(f"candidate occupies private check path: {target.name}")
        shutil.copyfile(ROOT/"private/checks"/target.name, target)
    # Remove stale public reports so each result contains only its own test evidence.
    for folder in ("surefire-reports", "failsafe-reports"):
        shutil.rmtree(args.work/"target"/folder, ignore_errors=True)
    functional = run_gate(args.work, maven+["-Dtest="+",".join(CHECKS[args.scenario]), "test"], env, "functional")
    functional["evidence_valid"]=reports_complete(functional,{"com.northstar.orders."+name:1 for name in CHECKS[args.scenario]})
    architectural = None
    if args.scenario != "csv-quoting":
        shutil.rmtree(args.work/"target/surefire-reports", ignore_errors=True)
        architectural = run_gate(args.work, maven+["-Dtest=CKBoundaryTest", "-Dck.scenario="+args.scenario, "test"], env, "architectural")
        architectural["evidence_valid"]=reports_complete(architectural,{"com.northstar.orders.CKBoundaryTest":1})
    verify_assets()
    if hashlib.sha256((ROOT/"freeze.json").read_bytes()).hexdigest() != freeze_digest:
        raise SystemExit("freeze changed during evaluation")
    result = {"record_type":"evaluator-result", "model_calls":0, "freeze_sha256":freeze_digest, "candidate":revision, "scenario":args.scenario,
              "public":public, "functional":functional, "architectural":architectural,
              "limits":["Architectural checks inspect the mapped handler and reachable public application bean; independent review assesses residual semantic boundaries."]}
    destination = args.work.parent / f"{args.work.name}-result.json"
    destination.write_text(json.dumps(result, indent=2)+"\n")
    print(destination)
    print(json.dumps({"public":public["exit_code"],"functional":functional["exit_code"],"architectural":None if architectural is None else architectural["exit_code"]}))
    gates=[public,functional]+([] if architectural is None else [architectural])
    return 0 if all(gate["exit_code"] == 0 and gate["evidence_valid"] for gate in gates) else 1


if __name__ == "__main__":
    raise SystemExit(main())
