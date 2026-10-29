#!/usr/bin/env python3
"""Inspect the actual authenticated client before a trial; never starts a task turn."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import select
import subprocess
import time
import tomllib

ROOT = Path(__file__).resolve().parent


def validate_authentication(response):
    account=response.get("account")
    if not isinstance(account,dict) or account.get("type") != "chatgpt":
        raise ValueError("authenticated ChatGPT account is required")
    # Do not retain the email, account identifier or token material.
    return {"type":"chatgpt", "token_refresh_requested":True}


def validate_backend_authentication(response):
    if not isinstance(response,dict) or not isinstance(response.get("rateLimits"),dict) or not response["rateLimits"]:
        raise ValueError("authenticated backend read returned no rate-limit snapshot")
    # The pinned client makes an authenticated GET and propagates backend errors.
    # Retain no usage, account identifiers or token material.
    return {"backend_authenticated_read":"account/rateLimits/read"}


def validate_inventory(condition, mcp, skills, run):
    if mcp.get("nextCursor"):
        raise ValueError("incomplete MCP inventory")
    servers=mcp["data"]
    expected=[] if condition=="baseline" else ["common_knowledge"]
    if sorted(server["name"] for server in servers) != expected:
        raise ValueError("unexpected MCP server inventory")
    inventory=[]
    for server in servers:
        names=sorted(tool["name"] for tool in server["tools"].values())
        if names != ["read", "search", "validate"]:
            raise ValueError("unexpected CK tool inventory")
        if server.get("toolsError"):
            raise ValueError("CK tool discovery failed")
        inventory.append({"server":server["name"], "tools":names})
    skill_inventory=[]
    if len(skills["data"]) != 1 or Path(skills["data"][0]["cwd"]).resolve() != run/"app":
        raise ValueError("unexpected skill discovery checkout")
    for group in skills["data"]:
        if group.get("errors"):
            raise ValueError("skill discovery failed")
        for skill in group["skills"]:
            if not skill["enabled"]:
                continue
            path=Path(skill["path"]).resolve()
            if skill["scope"] != "system" or skill.get("pluginId") is not None or not path.is_relative_to(run/"codex/skills/.system"):
                raise ValueError("unexpected user or plugin skill")
            skill_inventory.append({"name":skill["name"], "scope":"system", "sha256":hashlib.sha256(path.read_bytes()).hexdigest()})
    return {"mcp":inventory, "bundled_system_skills":sorted(skill_inventory,key=lambda value:value["name"])}


def audit(run, condition):
    conditions=json.loads((ROOT/"conditions.json").read_text())
    config=tomllib.loads((run/"codex/config.toml").read_text())
    if any(config.get("features",{}).get(name) is not False for name in conditions["common"]["disabled_features"]):
        raise ValueError("missing frozen client feature exclusion")
    if config.get("web_search") != "disabled" or config.get("approval_policy") != "never" or config.get("default_permissions") != "ck40":
        raise ValueError("unexpected client permission configuration")
    if not (run/"codex/auth.json").is_file():
        raise ValueError("supply necessary file-based authentication before auditing the client")
    env={key:os.environ[key] for key in conditions["common"]["environment_allowlist"] if key in os.environ}
    for key,path in (("HOME",run/"home"),("CODEX_HOME",run/"codex"),("TMPDIR",run/"tmp")):
        env[key]=str(path)
    process=subprocess.Popen(["codex","app-server"],cwd=run/"app",env=env,stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,bufsize=0)
    def send(value):
        process.stdin.write((json.dumps(value)+"\n").encode())
        process.stdin.flush()
    def request(identifier,method,params):
        send({"id":identifier,"method":method,"params":params})
        deadline=time.monotonic()+60
        while time.monotonic()<deadline:
            if not select.select([process.stdout],[],[],1)[0]:
                continue
            line=process.stdout.readline()
            if not line:
                raise RuntimeError("client exited before inventory completed")
            response=json.loads(line)
            if response.get("id")==identifier:
                if "error" in response:
                    raise RuntimeError("client rejected inventory request: "+method)
                return response["result"]
        raise TimeoutError("client inventory timed out: "+method)
    try:
        request(1,"initialize",{"clientInfo":{"name":"ck50_inventory","version":"1"}})
        send({"method":"initialized","params":{}})
        authentication=validate_authentication(request(2,"account/read",{"refreshToken":True}))
        authentication.update(validate_backend_authentication(request(3,"account/rateLimits/read",{"excludeResetCreditDetails":True})))
        mcp=request(4,"mcpServerStatus/list",{"detail":"toolsAndAuthOnly","limit":100})
        skills=request(5,"skills/list",{"cwds":[str(run/"app")],"forceReload":True})
        return {"authentication":authentication, **validate_inventory(condition,mcp,skills,run)}
    finally:
        process.terminate()
        try:
            process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait()


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run",type=Path,required=True)
    parser.add_argument("--condition",choices=("baseline","current_ck"),required=True)
    parser.add_argument("--output",type=Path,required=True,help="new author-only evidence path outside the run")
    args=parser.parse_args()
    run=args.run.resolve()
    output=args.output.resolve()
    if run.parent != Path("/private/tmp/ck40-runs"):
        parser.error("run must be directly below /private/tmp/ck40-runs")
    # A sibling trial path is also task-visible to its owner, so require author storage.
    if not output.is_relative_to(Path("/private/tmp/ck-issue40")):
        parser.error("output must be in excluded /private/tmp/ck-issue40 author storage")
    if output.exists():
        parser.error("output must not exist")
    result={"record_type":"client-inventory","scored":False,"model_calls":0,"condition":args.condition}
    try:
        result.update(audit(run,args.condition),passed=True)
    except Exception as error:
        result.update(passed=False,error=str(error))
        raise
    finally:
        output.write_text(json.dumps(result,indent=2)+"\n")
    print(output)


if __name__=="__main__":
    main()
