#!/usr/bin/env python3
# resumo das fixtures: total, passadas/futuras, janelas de datas (uso: probe.sh /api/fixtures/snapshot | ./fixtures-summary.py)
import sys, json, time, datetime

raw = sys.stdin.read()
raw = raw[: raw.rfind("]") + 1]  # remove a linha "HTTP 200" do probe.sh
fx = json.loads(raw)
now_ms = time.time() * 1000
past = [f for f in fx if f["StartTime"] < now_ms]
fut = [f for f in fx if f["StartTime"] >= now_ms]

def fmt(ms):
    return datetime.datetime.utcfromtimestamp(ms / 1000).strftime("%Y-%m-%d %H:%M")

print(f"total: {len(fx)} | passadas: {len(past)} | futuras: {len(fut)}")
for f in sorted(fx, key=lambda f: f["StartTime"])[:8]:
    tag = "PAST" if f["StartTime"] < now_ms else "fut "
    print(f'{tag} {fmt(f["StartTime"])} UTC  {f["Participant1"]} x {f["Participant2"]}  fixture={f["FixtureId"]} comp={f["CompetitionId"]}')
