#!/usr/bin/env python3
"""PR200 full-source static inspection: byte proof and signals, not semantic certification."""
import ast
from bisect import bisect_right
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/qa/evidence"
EVIDENCE.mkdir(parents=True, exist_ok=True)
HEAD = subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip()
BASE = "b77e9fd296bc2710350ef6f3cd402ce2529ffc06"
EXT = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".rs"}
EXCLUDE = {"node_modules", "dist", "build", "vendor", ".next", ".expo", "coverage", ".venv", "venv", "out", "generated"}
LEDGER = "MAIN_RELEASE_SOURCE_COVERAGE.csv"
SIGNALS = {
    "AUTH_ALLOW_ANY": r"\b(?:permissions\.)?AllowAny\b",
    "AUTH_OVERRIDE": r"\b(?:get_permissions|check_permissions)\s*\(",
    "CSRF_EXEMPT": r"\bcsrf_exempt\b",
    "AUTH_EMPTY_CLASSES": r"\b(?:permission_classes|authentication_classes)\s*=\s*\[\s*\]",
    "DYNAMIC_EVAL_EXEC": r"\b(?:eval|exec)\s*\(",
    "SUBPROCESS_SHELL": r"\bshell\s*=\s*True\b",
    "TLS_VERIFY_DISABLED": r"\bverify\s*=\s*False\b",
    "PICKLE_LOAD": r"\bpickle\.(?:load|loads)\s*\(",
    "YAML_LOAD": r"\byaml\.load\s*\(",
    "RAW_SQL": r"\.(?:raw|execute)\s*\(",
    "BROAD_OBJECTS_ALL": r"\.objects\.all\s*\(",
    "ORG_WIDE_ROLE": r"\bORG_WIDE_ADMIN_ROLES\b",
    "STRIPE_PAYMENT": r"\b(?:stripe\.|checkout\.Session|stripe_payment_intent)\b",
    "FINANCE_IDEMPOTENCY": r"\b(?:idempotency_key|select_for_update)\b",
    "CASCADE_DELETION": r"\bon_delete\s*=\s*(?:models\.)?CASCADE\b",
    "DIRECT_WEB_TRANSPORT": r"\b(?:fetch|axios\.(?:get|post|put|patch|delete))\s*\(",
    "HTML_INJECTION_SINK": r"\bdangerouslySetInnerHTML\b|\.innerHTML\s*=",
    "BROWSER_TOKEN_STORAGE": r"(?:localStorage|sessionStorage)[^\n]{0,85}(?:token|jwt|auth)|(?:token|jwt|auth)[^\n]{0,85}(?:localStorage|sessionStorage)",
    "WEB_REDIRECT": r"\bwindow\.location(?:\.href)?\s*=",
    "TENANT_SCOPE_REFERENCE": r"\b(?:pharmacy_ids|organization_id|membership_visible_pharmacy_ids)\b",
    "FILE_UPLOAD": r"\b(?:FileField|ImageField|SimpleUploadedFile|UploadedFile)\b",
    "AWARD_RATE_REFERENCE": r"\b(?:award_rates|public_holidays|hourly_rate|casual_rate)\b",
}
COMPILED = {k: re.compile(v, re.I if k == "BROWSER_TOKEN_STORAGE" else 0) for k, v in SIGNALS.items()}


def save_csv(path, columns, records):
    with path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=columns, extrasaction="ignore", quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(records)


def blob_digest(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode("ascii") + b"\0" + raw).hexdigest()


def main():
    raw_paths = subprocess.check_output(["git", "ls-files", "-z"], cwd=ROOT)
    tracked = sorted(p.decode("utf-8", "surrogateescape") for p in raw_paths.split(b"\0") if p)
    paths = [p for p in tracked if Path(p).suffix.lower() in EXT and not set(Path(p).parts).intersection(EXCLUDE)]
    previous_path = EVIDENCE / LEDGER
    if previous_path.exists():
        with previous_path.open(encoding="utf-8", newline="") as f:
            previous = {row["path"]: row for row in csv.DictReader(f)}
    else:
        previous = {}
    stage = subprocess.check_output(["git", "ls-files", "--stage", "-z"], cwd=ROOT)
    index_blobs = {}
    for entry in stage.split(b"\0"):
        if entry and b"\t" in entry:
            meta, filename = entry.split(b"\t", 1)
            index_blobs[filename.decode("utf-8", "surrogateescape")] = meta.split(b" ")[1].decode()
    ledger, flagged, errors, largest = [], [], [], []
    totals, by_domain, by_signal = Counter(), Counter(), Counter()

    for path in paths:
        domain = path.split("/", 1)[0]
        by_domain[domain] += 1
        prior = previous.get(path, {})
        item = dict(path=path, git_blob_sha="", bytes=0, domain=domain,
                    review_status="UNREAD", review_method="PR200_COMPLETE_FILE_STATIC_RULES_V1",
                    source_evidence="PR_HEAD=" + HEAD, finding_ids=prior.get("finding_ids", ""), notes="")
        try:
            raw = (ROOT / path).read_bytes()
            text = raw.decode("utf-8")
            item["bytes"] = len(raw)
            item["git_blob_sha"] = blob_digest(raw)
            line_count = len(text.splitlines())
            if item["git_blob_sha"] != index_blobs.get(path):
                raise ValueError("Worktree blob differs from immutable HEAD index")
        except (OSError, UnicodeError, ValueError) as exc:
            item["review_status"] = "READ_OR_BLOB_ERROR"
            item["notes"] = type(exc).__name__ + ": " + str(exc)[:120]
            totals["read_or_blob_error"] += 1
            errors.append(path)
            ledger.append(item)
            continue

        ast_status = "NOT_APPLICABLE"
        if path.endswith(".py"):
            try:
                ast.parse(text, filename=path)
                ast_status = "PY_AST_PASS"
                totals["python_ast_pass"] += 1
            except SyntaxError as exc:
                ast_status = "PY_AST_FAIL"
                totals["python_ast_fail"] += 1
                flagged.append(dict(path=path, blob_sha=item["git_blob_sha"], rule="PY_AST_FAIL",
                                    occurrences=1, lines=str(exc.lineno or 0), status="SYNTAX_CHECK_FAILED"))
        newlines = [m.start() for m in re.finditer("\n", text)]
        hits = []
        for rule, matcher in COMPILED.items():
            matches = list(matcher.finditer(text))
            if not matches:
                continue
            by_signal[rule] += 1
            line_numbers = [1 + bisect_right(newlines, match.start()) for match in matches[:7]]
            hits.append(rule + "@" + ",".join(map(str, line_numbers[:3])) + "(" + str(len(matches)) + ")")
            flagged.append(dict(path=path, blob_sha=item["git_blob_sha"], rule=rule,
                                occurrences=len(matches), lines=";".join(map(str, line_numbers)),
                                status="HEURISTIC_SIGNAL_NOT_CONFIRMED"))
        if line_count > 800:
            largest.append((line_count, path))
        item["review_status"] = "AUTOMATED_STATIC_READ"
        item["review_method"] += ";" + ast_status
        item["source_evidence"] += ";BLOB=" + item["git_blob_sha"] + ";LINES=" + str(line_count)
        item["notes"] = ("Static signature hits: " + ";".join(hits[:12]) if hits else "No scanner-rule matches")
        item["notes"] += ". Not a security, behavioral, test, UX, or semantic certification."
        ledger.append(item)
        totals["inspected"] += 1
        if hits:
            totals["flagged_files"] += 1

    save_csv(EVIDENCE / LEDGER, ["path", "git_blob_sha", "bytes", "domain", "review_status",
             "review_method", "source_evidence", "finding_ids", "notes"], ledger)
    save_csv(EVIDENCE / "MAIN_RELEASE_STATIC_FLAGS.csv",
             ["path", "blob_sha", "rule", "occurrences", "lines", "status"], flagged)
    count = len(paths)
    reviewed = totals["inspected"]
    coverage = round(100.0 * reviewed / count, 3) if count else 0
    inherited = sum(row["review_status"] == "AUTOMATED_STATIC_READ"
                    and row["path"] in previous for row in ledger)
    data = dict(source_sha=HEAD, inherited_main_baseline=BASE, scanned=reviewed, total=count,
                coverage_percent=coverage, required_for_99_percent=math.ceil(0.99 * count),
                previous_baseline_ledger_total=len(previous), previous_baseline_static_scanned=inherited,
                manual_semantic_certified=0, python_ast_pass=totals["python_ast_pass"],
                python_ast_fail=totals["python_ast_fail"], read_or_hash_fail=totals["read_or_blob_error"],
                files_with_heuristic_signals=totals["flagged_files"],
                domains=dict(sorted(by_domain.items())), signal_file_counts=dict(sorted(by_signal.items())),
                largest_files=[{"path": p, "lines": n} for n, p in sorted(largest, reverse=True)[:40]],
                unread_or_mismatched_paths=errors,
                generated_utc=datetime.now(timezone.utc).isoformat(),
                interpretation="Complete-file automated static inspection only. All rule hits require manual triage. No business behavior, role permissions, browser, device, Stripe, data integrity or release readiness is certified.")
    (EVIDENCE / "MAIN_RELEASE_AUTOMATED_STATIC_AUDIT.json").write_text(
        json.dumps(data, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    markdown = [
        "# PR #200 full-tree automated static audit",
        "",
        "Inspected HEAD: " + HEAD,
        "Frozen main baseline: " + BASE,
        "Generated UTC: " + data["generated_utc"],
        "",
        "## Scope and evidence",
        "",
        "- Source-file content read and Git blob SHA checked: " + str(reviewed) + "/" + str(count) + " (" + str(coverage) + "%).",
        "- Existing baseline-branch tracked source files inspected: " + str(inherited) + "/" + str(len(previous)) + ".",
        "- Python AST parse passes / failures: " + str(data["python_ast_pass"]) + " / " + str(data["python_ast_fail"]) + ".",
        "- Read / immutable Git blob hash failures: " + str(data["read_or_hash_fail"]) + ".",
        "- Manual source certification: 0 claimed. Static-file coverage does not establish application correctness.",
        "",
        "## Static signal inventory (not confirmed vulnerabilities)",
        "",
        "| Signature | Matching source files |", "| --- | ---: |",
    ]
    markdown += ["| " + k + " | " + str(v) + " |" for k, v in sorted(by_signal.items(), key=lambda pair: (-pair[1], pair[0]))]
    markdown += [
        "",
        "See MAIN_RELEASE_SOURCE_COVERAGE.csv for each checked source path, blob SHA, rule hits and inspection limit.",
        "See MAIN_RELEASE_STATIC_FLAGS.csv for exact paths and line locations requiring expert triage.",
        "",
        "**Decision: NOT RELEASE-READY.** This scanner never exercises permissions, transactions,",
        "concurrency, web/mobile UI, security exploits, migrations or deployment. Each B01-B23",
        "finding still needs independent validation; no code fixes were attempted.",
    ]
    (EVIDENCE / "MAIN_RELEASE_AUTOMATED_STATIC_AUDIT.md").write_text("\n".join(markdown) + "\n", encoding="utf-8")
    print(json.dumps({k: data[k] for k in ("source_sha", "scanned", "total", "coverage_percent",
          "python_ast_fail", "read_or_hash_fail", "files_with_heuristic_signals")}, sort_keys=True))
    return 0 if reviewed >= math.ceil(0.99 * count) and not errors else 2


if __name__ == "__main__":
    sys.exit(main())
