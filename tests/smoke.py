import json, os, subprocess, sys, shutil, time

ROOT = "/tmp/vibo-mcp"
HOME = "/tmp/vibo-test-home"
shutil.rmtree(HOME, ignore_errors=True)
env = dict(os.environ, VIBO_HOME=HOME)

p = subprocess.Popen(
    ["node", "dist/cli.js"], cwd=ROOT, env=env,
    stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, bufsize=1,
)

def send(msg):
    p.stdin.write(json.dumps(msg) + "\n"); p.stdin.flush()

def recv(want_id, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        line = p.stdout.readline()
        if not line:
            break
        line = line.strip()
        if not line.startswith("{"):
            continue
        m = json.loads(line)
        if m.get("id") == want_id:
            return m
    raise RuntimeError(f"no response for id={want_id}")

results = []
def check(name, cond, detail=""):
    results.append((name, bool(cond), detail))

i = 0
def call(name, args):
    global i
    i += 1
    send({"jsonrpc": "2.0", "id": i, "method": "tools/call", "params": {"name": name, "arguments": args}})
    return recv(i)

send({"jsonrpc": "2.0", "id": 0, "method": "initialize", "params": {"protocolVersion": "2025-06-18", "capabilities": {}, "clientInfo": {"name": "t", "version": "1"}}})
init = recv(0)
send({"jsonrpc": "2.0", "method": "notifications/initialized"})
check("initialize", init["result"]["serverInfo"]["version"] == "0.3.0", init["result"]["serverInfo"])

i += 1
send({"jsonrpc": "2.0", "id": i, "method": "tools/list"})
tl = recv(i)
tools = [t["name"] for t in tl["result"]["tools"]]
check("tools/list", len(tools) >= 7, ",".join(tools))
check("tool size < 6000 chars", len(json.dumps(tl)) < 6000, str(len(json.dumps(tl))))

r = call("memory_add", {"label": "client-anna-prefs", "content": "Anna orders coffee without sugar, delivery to Khimki, budget 24000 RUB per month"})
check("add works without key", r["result"]["structuredContent"]["added"] is True, r["result"]["content"][0]["text"])

r = call("memory_add", {"label": "client-anna-prefs", "content": "Anna orders coffee without sugar, delivery to Khimki, budget 24000 RUB per month"})
check("dedup", r["result"]["structuredContent"]["added"] is False, r["result"]["content"][0]["text"])

r = call("memory_add", {"label": "vibo-secret", "content": "Server root password stored as a secret", "level": "L3"})
check("add L3", r["result"]["structuredContent"]["total"] == 2, r["result"]["content"][0]["text"])

r = call("memory_search", {"query": "Anna coffee preferences"})
facts = r["result"]["structuredContent"]["facts"]
check("search finds Anna", any(f["label"] == "client-anna-prefs" for f in facts), str([f["label"] for f in facts]))
check("L3 hidden by default", all(f["level"] != "L3" for f in facts), str([f["level"] for f in facts]))

r = call("memory_search", {"query": "password secret", "include_secrets": True})
check("L3 visible when asked", any(f["level"] == "L3" for f in r["result"]["structuredContent"]["facts"]), "ok")

r = call("memory_verify", {"claims": ["Anna budget is 24000 RUB per month", "Anna budget is 99000 RUB per month", "Anna works at Gazprom"]})
st = [x["status"] for x in r["result"]["structuredContent"]["results"]]
check("verify confirmed correct claim", st[0] in ("confirmed", "partial"), str(st))
check("verify contradicts wrong number", st[1] in ("contradicts", "partial"), str(st))

r = call("memory_provenance", {"limit": 5})
check("chain intact", r["result"]["structuredContent"]["chain_ok"] is True, r["result"]["content"][0]["text"][:80])

r = call("memory_forget", {"target": "vibo-secret"})
check("forget needs confirm", r["result"].get("isError") is True, r["result"]["content"][0]["text"][:60])

r = call("memory_forget", {"target": "vibo-secret", "confirm": True})
check("forget confirmed", r["result"]["structuredContent"]["removed"] == 1, r["result"]["content"][0]["text"])

r = call("memory_usage", {})
check("usage reports facts", r["result"]["structuredContent"]["facts"] == 1, r["result"]["content"][0]["text"].splitlines()[0])

for action, payload in [("add", {"text": "we discussed pricing at 5 usd per month"}),
                        ("add", {"text": "second message about refunds"}),
                        ("context", {}),
                        ("ask", {"query": "pricing"})]:
    r = call("thread_memory", dict(action=action, **payload))
    check(f"thread {action}", r["result"]["structuredContent"]["ok"] is True, r["result"]["content"][0]["text"][:60])

r = call("web_search", {"url": "https://example.com"})
check("web_search honest", r["result"]["structuredContent"]["available"] is False, r["result"]["content"][0]["text"][:50])

p.stdin.close()
p.wait(timeout=10)

okc = sum(1 for _, c, _ in results if c)
for name, c, d in results:
    print(("PASS " if c else "FAIL ") + name + ("" if c else f"  <- {d}"))
print(f"\n{okc}/{len(results)} passed")
sys.exit(0 if okc == len(results) else 1)
