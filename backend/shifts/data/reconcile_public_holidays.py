#!/usr/bin/env python3
"""Static evidence gate for AU statewide and declared local holidays (2026/27).

Run: python backend/shifts/data/reconcile_public_holidays.py --check
This is deliberately offline. Research and update authoritative government
declarations first, NEVER guess a future local show day from last year's date.
"""
import argparse
import json
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent
STATES = {"ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA"}
YEARS = {2026, 2027}

def check():
    state = json.loads((ROOT / "public_holidays.json").read_text(encoding="utf-8"))
    regional = json.loads((ROOT / "public_holidays_local.json").read_text(encoding="utf-8"))
    assert set(state) == STATES, "Missing/unexpected state or territory"
    assert regional.get("legal_basis", "").startswith("https://www.fairwork.gov.au/"), "Fair Work authority required"
    assert regional.get("award") == "https://awards.fairwork.gov.au/MA000012.html"
    for code, days in state.items():
        assert days == sorted(set(days)), "Duplicate or unsorted statewide dates: " + code
        assert {date.fromisoformat(d).year for d in days} == YEARS, "Missing year: " + code
    for entry in regional["statewide_part_days"]:
        assert entry["state"] in STATES
        assert date.fromisoformat(entry["date"]).year in YEARS
        assert entry["date"] not in state[entry["state"]], "Part-day entered as full-day"
        assert "https://" in entry["source"]
        assert "00:00" <= entry["start"] < entry["end"] <= "24:00"
    for code, region in regional["regions"].items():
        assert code.startswith(region["state"] + "_"), "Invalid region/state: " + code
        assert region["source"].startswith("https://"), "Missing legal source: " + code
        assert set(region["verified_years"]) | set(region["pending_years"]) == YEARS, (
            "Each region must say verified or PENDING for each year: " + code
        )
        assert not set(region["verified_years"]) & set(region["pending_years"])
        assert set(region["exclude_state_dates"]).issubset(set(state[region["state"]]))
        for event in region["events"]:
            assert date.fromisoformat(event["date"]).year in region["verified_years"]
            assert "00:00" <= event["start"] < event["end"] <= "24:00"
    assert "2026-08-12" not in state["QLD"], "Brisbane Ekka is NOT statewide"
    assert "2026-08-28" not in state["QLD"], "Gold Coast Show is NOT statewide"
    assert "2026-07-17" not in state["QLD"], "Cairns Show is NOT statewide"
    assert "2026-08-03" not in state["NSW"], "NSW Bank Holiday is not a pharmacy public holiday"
    assert "2027-01-26" in state["QLD"], "Missing Australia Day 2027"
    assert "2026-10-05" in state["QLD"] and "2027-10-04" in state["QLD"]
    assert "2026-06-08" in state["NSW"] and "2027-06-14" in state["NSW"]
    assert "2026-09-28" in state["WA"] and "2027-09-27" in state["WA"]
    assert any(p["state"] == "QLD" and p["date"] == "2027-12-24" and p["start"] == "18:00" for p in regional["statewide_part_days"])
    assert any(p["state"] == "NT" and p["date"] == "2027-12-31" and p["start"] == "19:00" for p in regional["statewide_part_days"])
    pending = [(code, r["pending_years"]) for code, r in regional["regions"].items() if r["pending_years"]]
    print(f"Checked {len(state)} state/territory calendars, {len(regional['regions'])} local regions, {len(regional['statewide_part_days'])} part-day records.")
    print("Local years awaiting publication:", pending)
    print("State event dates awaiting announcement:", regional["pending_state_events"])
    return 0

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Validate source-labelled 2026-2027 holiday registers")
    parser.parse_args()
    raise SystemExit(check())
