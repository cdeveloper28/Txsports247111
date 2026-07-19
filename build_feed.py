#!/usr/bin/env python3
"""Turn the raw TxODDS feed (app/public/feed-raw.json) into a small per-fixture replay
(app/public/feed-<id>.json): a downsampled StablePrice 1X2 odds timeline merged with the real
score progression, live match stats (possession %, shots, corners, cards) and a key-event timeline
(goals, cards, penalties). Uses the documented TxLINE Stats key encoding:
  1/2 = P1/P2 goals · 3/4 = yellow cards · 5/6 = red cards · 7/8 = corners
  StatusId phase: 1 NS · 2 H1 · 3 HT · 4 H2 · 5 Ended
Where a fixture has no real StablePrice odds, a simulated live 1X2 price is synthesised."""
import json, re, os, math

RAW = "app/public/feed-raw.json"
N = 16

d = json.load(open(RAW))
fixture_id = d["fixtureId"]
OUT = f"app/public/feed-{fixture_id}.json"

# Clamp the replay to the finalised, on-chain-provable result.
proven_h = proven_a = None
try:
    pf = json.load(open(f"fixtures/{fixture_id}.json"))
    proven_h, proven_a = int(pf["home"]), int(pf["away"])
except Exception:
    pass

odds = [
    o for o in (d.get("oddsUpd") or [])
    if o.get("Bookmaker") == "TXLineStablePriceDemargined"
    and o.get("SuperOddsType") == "1X2_PARTICIPANT_RESULT"
    and isinstance(o.get("Prices"), list) and len(o["Prices"]) == 3
]
odds.sort(key=lambda o: o.get("Ts", 0))

# ---- parse scores SSE into records using documented Stats keys ----
start_time = None
recs = []
for block in (d.get("scoresUpd") or "").split("\n\n"):
    m = re.search(r"data:\s*(\{.*\})", block)
    if not m:
        continue
    try:
        ev = json.loads(m.group(1))
    except Exception:
        continue
    if start_time is None and ev.get("StartTime"):
        start_time = ev["StartTime"]
    st = ev.get("Stats") or {}
    g = lambda k: st.get(k)  # documented total-stat keys (period prefix 0)
    recs.append({
        "ts": ev.get("Ts", 0), "poss": ev.get("Possession"), "action": ev.get("Action"),
        "status": ev.get("StatusId"), "part": ev.get("Participant"), "data": ev.get("Data") or {},
        "gh": g("1"), "ga": g("2"), "ych": g("3"), "yca": g("4"),
        "rch": g("5"), "rca": g("6"), "ch": g("7"), "ca": g("8"),
    })
recs.sort(key=lambda r: r["ts"])
start_time = start_time or (odds[0]["Ts"] if odds else (recs[0]["ts"] if recs else 0))
end_ts = max(odds[-1]["Ts"] if odds else start_time, recs[-1]["ts"] if recs else start_time)
minute_of = lambda ts: max(0, min(95, round((ts - start_time) / 60000)))

def series(field):
    out, last = [], 0
    for r in recs:
        v = r.get(field)
        if v is not None:
            last = int(v)
        out.append((r["ts"], last))
    return out

goals_h, goals_a = series("gh"), series("ga")
corn_h, corn_a = series("ch"), series("ca")
card_h = [(t, y + r_) for (t, y), (_, r_) in zip(series("ych"), series("rch"))]
card_a = [(t, y + r_) for (t, y), (_, r_) in zip(series("yca"), series("rca"))]

# possession % + shots (count-based; shot team via Participant, else Possession)
poss_ser, shots_ser, sot_ser = [], [], []
ph = pa = sh = sa = soth = sota = 0
for r in recs:
    if r["poss"] == 1: ph += 1
    elif r["poss"] == 2: pa += 1
    if r["action"] == "shot":
        team = r["part"] if r["part"] in (1, 2) else r["poss"]
        on = r["data"].get("Outcome") == "OnTarget"
        if team == 2: sa += 1; sota += 1 if on else 0
        else: sh += 1; soth += 1 if on else 0
    poss_ser.append((r["ts"], (ph, pa)))
    shots_ser.append((r["ts"], (sh, sa)))
    sot_ser.append((r["ts"], (soth, sota)))
status_ser = [(r["ts"], r["status"]) for r in recs if r["status"] is not None]

def at(ser, ts, default=0):
    v = ser[0][1] if ser else default
    for t, x in ser:
        if t <= ts: v = x
        else: break
    return v

def score_at(ts):
    h, a = at(goals_h, ts), at(goals_a, ts)
    if proven_h is not None:
        h, a = min(h, proven_h), min(a, proven_a)
    return h, a

def odds_at(ts):
    best = odds[0] if odds else None
    for o in odds:
        if o["Ts"] <= ts: best = o
        else: break
    return best

def synth_odds(h, a, minute):
    diff = h - a
    elapsed = min(max(minute, 0), 90) / 90.0
    adv = diff * (1.0 + 2.6 * elapsed)
    p_hva = 1.0 / (1.0 + math.exp(-adv))
    p_draw = (0.34 if diff == 0 else 0.16) * (0.55 + 0.45 * elapsed)
    probs = [p_hva * (1 - p_draw), p_draw, (1 - p_hva) * (1 - p_draw)]
    s = sum(probs)
    return [round(1.0 / max(p / s, 0.02), 2) for p in probs]

def stats_at(ts):
    p = at(poss_ser, ts, (0, 0))
    tot = (p[0] + p[1]) or 1
    return {
        "poss": [round(p[0] / tot * 100), round(p[1] / tot * 100)],
        "shots": list(at(shots_ser, ts, (0, 0))),
        "sot": list(at(sot_ser, ts, (0, 0))),
        "corners": [at(corn_h, ts), at(corn_a, ts)],
        "cards": [at(card_h, ts), at(card_a, ts)],
    }

STATUS = {3: "HT", 5: "FT", 10: "FT", 13: "FT"}
def status_at(ts, is_last):
    if is_last:
        return "FT"
    sid = at(status_ser, ts, 2)
    return STATUS.get(sid, "LIVE" if sid in (2, 4) else ("UPCOMING" if sid == 1 else "LIVE"))

frames = []
span = max(end_ts - start_time, 1)
for i in range(N):
    ts = start_time + round(span * i / (N - 1))
    o = odds_at(ts)
    h, a = score_at(ts)
    minute = minute_of(ts)
    prices = [round(p / 1000, 2) for p in o["Prices"]] if o else synth_odds(h, a, minute)
    frames.append({"minute": minute, "home": h, "away": a, "odds": prices,
                   "status": status_at(ts, i == N - 1), "stats": stats_at(ts)})

# ---- key-event timeline (goals, cards, penalties), clamped to proven score ----
events = []
cgh = cga = cych = cyca = crch = crca = 0
for r in recs:
    minute = minute_of(r["ts"])
    ngh = int(r["gh"]) if r["gh"] is not None else cgh
    nga = int(r["ga"]) if r["ga"] is not None else cga
    if ngh > cgh:
        cgh = ngh
        if proven_h is None or cgh <= proven_h:
            events.append({"minute": minute, "kind": "goal", "team": 0})
    if nga > cga:
        cga = nga
        if proven_h is None or cga <= proven_a:
            events.append({"minute": minute, "kind": "goal", "team": 1})
    for fld, prevname, team, kind in (("ych", "cych", 0, "yellow"), ("yca", "cyca", 1, "yellow"),
                                      ("rch", "crch", 0, "red"), ("rca", "crca", 1, "red")):
        prev = {"cych": cych, "cyca": cyca, "crch": crch, "crca": crca}[prevname]
        nv = int(r[fld]) if r[fld] is not None else prev
        if nv > prev:
            events.append({"minute": minute, "kind": kind, "team": team})
            if prevname == "cych": cych = nv
            elif prevname == "cyca": cyca = nv
            elif prevname == "crch": crch = nv
            else: crca = nv
    if r["action"] == "penalty" and r["data"].get("Outcome") in ("Scored", "Missed"):
        team = r["part"] if r["part"] in (1, 2) else (2 if r["poss"] == 2 else 1)
        events.append({"minute": minute, "kind": "penalty", "team": team - 1, "note": r["data"].get("Outcome")})
events.sort(key=lambda e: e["minute"])

fh, fa = (proven_h, proven_a) if proven_h is not None else score_at(end_ts)
outcome = 0 if fh > fa else (1 if fh == fa else 2)

home_team, away_team = "Home", "Away"
try:
    for f in json.load(open("app/public/fixtures.json")):
        if f.get("fixtureId") == fixture_id:
            home_team, away_team = f.get("home", "Home"), f.get("away", "Away")
            break
except Exception:
    pass

feed = {
    "fixtureId": fixture_id, "homeTeam": home_team, "awayTeam": away_team, "finalOutcome": outcome,
    "source": ("TxLINE StablePrice (demargined) 1X2 + scores — real data, replayed"
               if odds else "TxLINE scores (real) + simulated live 1X2 odds, replayed"),
    "frames": frames, "events": events,
}
json.dump(feed, open(OUT, "w"), indent=2)
os.remove(RAW)
print(f"wrote {OUT}: {len(frames)} frames, final {fh}-{fa} (outcome {outcome}), {len(events)} key events")
