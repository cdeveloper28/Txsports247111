#!/usr/bin/env python3
"""Assemble a complete Anchor IDL from the single-threaded `cargo test --features idl-build`
section blocks (anchor idl build's own post-processor chokes on declare_program!'s qualified
type names, so we merge the raw sections ourselves)."""
import re, json, sys

log = open("idlraw.log").read()
sections = {}
for m in re.finditer(r"--- IDL begin (\w+) ---\n(.*?)\n--- IDL end \1 ---", log, re.S):
    kind = m.group(1)
    sections.setdefault(kind, []).append(json.loads(m.group(2)))

idl = sections["program"][0]  # address, metadata, instructions, accounts, types

# events + their types
existing = {t["name"] for t in idl.get("types", [])}
idl["events"] = [e["event"] for e in sections.get("event", [])]
for e in sections.get("event", []):
    for t in e.get("types", []):
        if t["name"] not in existing:
            idl.setdefault("types", []).append(t)
            existing.add(t["name"])

# errors
if sections.get("errors"):
    idl["errors"] = sections["errors"][0]

# Normalize fully-qualified names (declare_program! emits `crate::mod::Type`) to the last segment,
# in both definitions and `defined` references, so the anchor TS client's accessors work.
# Discriminators are unaffected (the on-chain macro derived them from the simple struct names).
def strip(name):
    return name.split("::")[-1] if isinstance(name, str) and "::" in name else name

def walk(o):
    if isinstance(o, dict):
        if isinstance(o.get("name"), str):
            o["name"] = strip(o["name"])
        d = o.get("defined")
        if isinstance(d, dict) and isinstance(d.get("name"), str):
            d["name"] = strip(d["name"])
        for v in o.values():
            walk(v)
    elif isinstance(o, list):
        for v in o:
            walk(v)

walk(idl)

# Ensure a clean address string (program block can be empty; the address section is double-encoded).
addr = idl.get("address") or ""
if not addr and sections.get("address"):
    addr = sections["address"][0]
idl["address"] = addr.strip('"') if isinstance(addr, str) else addr

names = [t["name"] for t in idl.get("types", [])]
assert len(names) == len(set(names)), f"type name collision after normalization: {names}"

json.dump(idl, open("target/idl/worldcup_market.json", "w"), indent=2)
print("wrote target/idl/worldcup_market.json")
print("instructions:", [i["name"] for i in idl["instructions"]])
print("accounts:", [a["name"] for a in idl.get("accounts", [])])
print("events:", [e["name"] for e in idl.get("events", [])])
print("errors:", len(idl.get("errors", [])))
print("types:", len(idl.get("types", [])))
