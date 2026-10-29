#!/usr/bin/env python3
"""Probe macOS file isolation and the installed client's shell sandbox; no model calls."""
import argparse
import json
import os
from pathlib import Path
import shutil
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.request import urlopen



def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--run",type=Path,required=True,help="new path under /private/tmp/ck40-runs")
    parser.add_argument("--private-file",type=Path,required=True)
    args=parser.parse_args()
    root=args.run.resolve()
    if root.parent != Path("/private/tmp/ck40-runs"):
        parser.error("run must be directly below /private/tmp/ck40-runs")
    if not args.private_file.is_file():
        parser.error("private-file must exist so denied access is meaningful")
    root.mkdir(parents=True,exist_ok=False)
    for name in ("app","home","codex","tmp"):
        (root/name).mkdir()
    (root/"app/visible").write_text("public probe\n")
    (root/"app/escape").symlink_to(args.private_file.resolve())
    sibling=root.with_name(root.name+"-other")
    sibling.mkdir(); (sibling/"answer").write_text("excluded session\n")
    env={"PATH":"/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin","HOME":str(root/"home"),"CODEX_HOME":str(root/"codex"),"TMPDIR":str(root/"tmp"),"TZ":"UTC","LANG":"en_US.UTF-8"}
    codex=shutil.which("codex")
    if not codex:
        raise RuntimeError("installed client is required")
    prefix=[codex,"sandbox","--permission-profile","ck40","-C",str(root/"app")]
    exclusions=sorted([p.resolve() for p in Path("/private/tmp").iterdir() if p.name!="ck40-runs"]+[p.resolve() for p in root.parent.iterdir() if p!=root])
    # Preserve ancestor metadata needed by getcwd/cd and deny each other subtree.
    denies="".join(json.dumps(str(p))+' = "deny"\n' for p in exclusions)
    conditions=json.loads((Path(__file__).resolve().parent/"conditions.json").read_text())
    features="".join(name+' = false\n' for name in conditions["common"]["disabled_features"])
    config=f'default_permissions = "ck40"\napproval_policy = "never"\nweb_search = "disabled"\n[features]\n{features}[permissions.ck40.filesystem]\n":root" = "read"\n"/Users" = "deny"\n"/Volumes" = "deny"\n"/private/var/folders" = "deny"\n{denies}"{root}" = "write"\n[permissions.ck40.network]\nenabled = false\n'
    (root/"codex/config.toml").write_text(config)
    probes=[]
    def probe(name,command,allow):
        result=subprocess.run(prefix+command,cwd=root/"app",env=env,capture_output=True,text=True)
        passed=(result.returncode==0)==allow
        probes.append({"name":name,"command":command,"expected":"allow" if allow else "deny","exit_code":result.returncode,"stderr":result.stderr,"passed":passed})
        if not passed:
            print(result.stderr)
            raise RuntimeError(f"isolation probe failed: {name}")
    probe("read-public",["/bin/cat",str(root/"app/visible")],True)
    probe("resolve-own-directory",["/bin/sh","-c",'cd "$PWD" && pwd -P'],True)
    probe("write-own-checkout",["/bin/sh","-c","printf probe > writable"],True)
    probe("read-author-material",["/bin/cat",str(args.private_file.resolve())],False)
    probe("read-other-session",["/bin/cat",str(sibling/"answer")],False)
    probe("read-original-user-memory",["/bin/cat",str(Path.home()/".codex/memories/MEMORY.md")],False)
    probe("symlink-escape",["/bin/cat",str(root/"app/escape")],False)
    probe("write-author-material",["/usr/bin/touch",str(sibling/"forbidden")],False)
    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            self.send_response(200); self.end_headers(); self.wfile.write(b"probe")
        def log_message(self,*args):
            pass
    server=HTTPServer(("127.0.0.1",0),Handler)
    threading.Thread(target=server.serve_forever,daemon=True).start()
    url=f"http://127.0.0.1:{server.server_port}/"
    assert urlopen(url,timeout=3).read()==b"probe"
    command=["/usr/bin/curl","--silent","--show-error","--fail","--max-time","3",url]
    probe("client-shell-network-denied",command,False)
    assert probes[-1]["exit_code"] in (7,28), "curl must run and fail to connect, not a client startup failure"
    assert "curl:" in probes[-1]["stderr"], "network denial must come from curl"
    assert urlopen(url,timeout=3).read()==b"probe"
    server.shutdown()
    (root/"app/escape").unlink()
    for name in ("visible","writable"):
        (root/"app"/name).unlink()
    (root/"app").rmdir()
    report={"record_type":"isolation-preparation","scored":False,"run":str(root),"config":config,"excluded_subtrees":[str(p) for p in exclusions],"probes":probes,"limits":["No model/task-agent was invoked; repeat these probes against each actual #50 launch binding.","The native permission profile restricts agent tool reads and writes. The client itself uses a fresh HOME/CODEX_HOME and only the allowlisted config; audit executable locations and exclude other tools/configuration stores.","Network is allowed for the outer model client; task-shell network must remain disabled through the tested client sandbox. No browser, web or remote connector tool may be exposed."]}
    (root/"isolation-result.json").write_text(json.dumps(report,indent=2)+"\n")
    print(root/"isolation-result.json")


if __name__ == "__main__":
    main()
