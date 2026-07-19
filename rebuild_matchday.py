#!/usr/bin/env python3
"""Categorise app/public/fixtures.json into two tabs and drop finished-results clutter:

  • simulation — past World Cup matches we captured a replay feed + proof for. Presented as
    UPCOMING, bettable markets: bet SOL, play the simulated live feed, settle on-chain by real proof.
  • real       — genuinely upcoming / live fixtures from the feed (not replayed). Bet + cancel now;
    they settle for real once played.

Finished fixtures with no replay are removed (you can't bet on a match that's already over)."""
import json, glob, os, re, time

PUB = "app/public"
fx = json.load(open(f"{PUB}/fixtures.json"))

feeds = {}
for p in glob.glob(f"{PUB}/feed-*.json"):
    m = re.search(r"feed-(\d+)\.json", os.path.basename(p))
    if not m:  # skip non-fixture files like feed-raw.json / feed-sample.json
        continue
    feeds[int(m.group(1))] = json.load(open(p))
have_proof = {int(m.group(1))
              for p in glob.glob(f"{PUB}/proof-*.json")
              if (m := re.search(r"proof-(\d+)\.json", os.path.basename(p)))}
interactive = [fid for fid in feeds if fid in have_proof]

by_id = {f["fixtureId"]: f for f in fx}
now = int(time.time() * 1000)

# simulation markets (the playable replays). Order by "heat" (closest top-two odds = most
# competitive) so the hottest/most-seeded markets lead the grid and match the Hot picks.
def _heat(fid):
    o = (feeds[fid].get("frames") or [{}])[0].get("odds")
    if not o or not any(x > 0 for x in o):
        return -1
    p = [1 / x if x > 0 else 0 for x in o]
    s = sum(p) or 1
    n = sorted([x / s for x in p], reverse=True)
    return 1 - (n[0] - n[1])
ordered = sorted(interactive, key=lambda fid: -_heat(fid))
for i, fid in enumerate(ordered):
    fd = feeds[fid]
    f = by_id.get(fid)
    if f is None:
        f = {"fixtureId": fid, "home": fd.get("homeTeam", "Home"), "away": fd.get("awayTeam", "Away"),
             "competition": "World Cup", "competitionId": 72}
        fx.append(f); by_id[fid] = f
    f["category"] = "simulation"
    f["status"] = "UPCOMING"
    f["kickoff"] = now + (i + 1) * 90 * 60 * 1000
    f["score"] = None
    f["finalOutcome"] = None
    f["featured"] = True
    f["simulated"] = True
    f["odds"] = fd["frames"][0]["odds"] if fd.get("frames") else None

sim_ids = set(interactive)
kept = [f for f in fx if f["fixtureId"] in sim_ids]

# real = upcoming/live fixtures, deduped by team pair (prefer entries that carry odds)
real_seen = {}
for f in fx:
    if f["fixtureId"] in sim_ids or f.get("status") not in ("UPCOMING", "LIVE"):
        continue
    key = (str(f.get("home", "")).lower(), str(f.get("away", "")).lower())
    cur = real_seen.get(key)
    if cur is None or (f.get("odds") and not cur.get("odds")):
        real_seen[key] = f
for f in real_seen.values():
    f["category"] = "real"
    f["featured"] = False
    f["finalOutcome"] = None
    if f.get("status") != "LIVE":
        f["score"] = None
    kept.append(f)

# simulation first (soonest kickoff), then real (live first, then odds-having, then soonest)
kept.sort(key=lambda f: (0, f.get("kickoff") or 0) if f.get("category") == "simulation"
          else (1, 0 if f.get("status") == "LIVE" else 1, 0 if f.get("odds") else 1, f.get("kickoff") or 0))
json.dump(kept, open(f"{PUB}/fixtures.json", "w"), indent=2)

sim = [f for f in kept if f["category"] == "simulation"]
real = [f for f in kept if f["category"] == "real"]
print("simulation (bet + play + settle by proof):")
for f in sim:
    print(f"  {f['fixtureId']}  {f['home']} vs {f['away']}  odds={f['odds']}")
print(f"real (live/upcoming): {len(real)}")
for f in real[:8]:
    print(f"  {f['status']:8} {f['home']} vs {f['away']}  odds={f['odds']}")
print(f"total kept: {len(kept)}  (dropped {len(fx)-len(kept)} finished)")
