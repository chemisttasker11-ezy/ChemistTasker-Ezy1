#!/usr/bin/env python3
"""PR200 selected quarter: byte-level checks + static cues, never human certification."""
import ast
from collections import Counter
import csv
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/qa/evidence"
LEDGER = EVIDENCE / "MAIN_RELEASE_QUARTER_2_FILE_LEDGER.csv"
BASELINE = "b77e9fd296bc2710350ef6f3cd402ce2529ffc06"
HEAD = subprocess.check_output(["git","rev-parse","HEAD"], cwd=ROOT, text=True).strip()
SIGNATURES = {
    "PERMISSION": r"\b(?:AllowAny|IsAuthenticated|permission_classes|authentication_classes)\b",
    "MUTATION_ROUTE": r"\b(?:ModelViewSet|CreateAPIView|RetrieveUpdateAPIView|RetrieveUpdateDestroyAPIView|def (?:create|post|update|partial_update|put|patch|destroy|delete)\s*\()",
    "TENANT_ID": r"\b(?:pharmacy_id|organization_id|membership_id|user_id|owner_id|slot_id|assignment_id)\b",
    "FOREIGN_KEY_INPUT": r"\b(?:PrimaryKeyRelatedField|ModelChoiceField)\b",
    "UNSCOPED_DB": r"\.objects\.(?:get|all|filter|create|update_or_create)\s*\(",
    "SERIALIZER_SAVE": r"\b(?:serializer\.save|perform_create|perform_update|super\(\)\.create|super\(\)\.update)\s*\(",
    "DB_WRITE": r"\.(?:save|delete|bulk_create|bulk_update|update|get_or_create|update_or_create)\s*\(",
    "ROW_LOCK": r"\bselect_for_update\s*\(",
    "TRANSACTION": r"@transaction\.atomic|with transaction\.atomic\s*\(",
    "EXCEPTION_SWALLOW": r"except\s+Exception\s*:\s*(?:pass|return|continue)",
    "BROWSER_STORAGE": r"\b(?:localStorage|sessionStorage|AsyncStorage|SecureStore)\b",
    "DIRECT_NETWORK": r"\b(?:fetch|axios\.(?:get|post|patch|put|delete)|WebSocket)\s*\(",
    "FINANCIAL": r"\b(?:stripe|checkout|transfer|reservation|payout|approve|mark_paid|refund|payment)\b",
    "UI_ROLE_GATE": r"\b(?:isOwner|isAdmin|hasPermission|canManage|persona|is_manager)\b",
    "UI_ROUTE": r"\b(?:router\.|navigation\.|useRouter|useNavigation|useEffect|Link|href|pathname)\b",
    "HTML_SINK": r"\bdangerouslySetInnerHTML\b|\.innerHTML\s*=",
}
COMPILED = {tag: re.compile(pattern, re.IGNORECASE if tag in ("TENANT_ID","FINANCIAL") else 0)
            for tag,pattern in SIGNATURES.items()}


def digest(raw):
    return hashlib.sha1(b"blob " + str(len(raw)).encode() + b"\0" + raw).hexdigest()


def main():
    with LEDGER.open(encoding="utf-8", newline="") as handle:
        reader = csv.DictReader(handle)
        fields = reader.fieldnames
        rows = list(reader)
    if len(rows) != 538 or len({row["path"] for row in rows}) != 538:
        raise RuntimeError("Expected exactly 538 distinct paths in selected quarter.")
    error_paths = []
    counts = Counter()
    by_bucket = Counter()
    flagged = 0
    for row in rows:
        path = row["path"]
        by_bucket[row["bucket"]] += 1
        try:
            raw = (ROOT/path).read_bytes()
            if digest(raw) != row["baseline_blob_sha"]:
                raise ValueError("Immutable main baseline blob mismatch")
            content = raw.decode("utf-8")
            lines = content.splitlines()
            if path.endswith(".py"):
                ast.parse(content,filename=path)
        except (OSError, UnicodeError, ValueError, SyntaxError) as exc:
            row["review_stage"] = "SOURCE_READ_FAILED"
            row["review_note"] = type(exc).__name__ + ": " + str(exc)[:150]
            error_paths.append(path)
            continue
        tags = []
        for tag, rule in COMPILED.items():
            matches = list(rule.finditer(content))
            if matches:
                counts[tag] += 1
                positions = [1 + content.count("\n", 0, m.start()) for m in matches[:3]]
                tags.append(tag + "@" + ",".join(map(str, positions)))
        if tags:
            flagged += 1
        row["read_lines"] = str(len(lines))
        row["source_sha_verified"] = "YES"
        row["risk_signals"] = ";".join(tags)
        if row["review_stage"] not in ("CONTEXT_MANUALLY_REVIEWED","NEGATIVE_TEST_REPRODUCED"):
            row["review_stage"] = "SOURCE_READ_STATIC_TRIAGED"
        if not row["semantic_followup"]:
            row["semantic_followup"] = "NOT_YET_MANUAL_VERIFIED"
        if not row["review_note"]:
            row["review_note"] = "Complete-source byte read and Git SHA checked by Actions; NOT a senior semantic review."
    with LEDGER.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields, quoting=csv.QUOTE_ALL)
        writer.writeheader()
        writer.writerows(rows)

    read_count = sum(row["source_sha_verified"] == "YES" for row in rows)
    reviewed_count = sum(row["review_stage"] == "CONTEXT_MANUALLY_REVIEWED" for row in rows)
    stats = {
        "frozen_main": BASELINE, "scanner_sha": HEAD, "total_selected": len(rows),
        "byte_read_and_sha_verified": read_count,
        "manual_context_review": reviewed_count,
        "read_or_syntax_errors": error_paths,
        "source_buckets": dict(sorted(by_bucket.items())),
        "files_with_static_signals": flagged,
        "signal_file_counts": dict(sorted(counts.items())),
        "generated_utc": datetime.now(timezone.utc).isoformat(),
        "limitations": "Automated byte/source inspection only; pattern hits are not confirmed bugs. No production, app, UI, role, concurrency or semantic certification.",
    }
    (EVIDENCE/"MAIN_RELEASE_QUARTER_2_STATIC_REPORT.json").write_text(
        json.dumps(stats, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    md = [
        "# PR200 538-file quarter static inspection report", "",
        "Frozen main: " + BASELINE,
        "Scanner HEAD: " + HEAD,
        "Complete file blobs read with matching Git SHA: " + str(read_count) + " / " + str(len(rows)),
        "Files independently context/semantically reviewed: " + str(reviewed_count),
        "Read, SHA or AST errors: " + str(len(error_paths)),
        "Unique files with static risk signatures (not confirmed defects): " + str(flagged),
        "", "## Source groups", "", "| Group | Count |", "|---|---:|",
    ]
    md += ["| " + k + " | " + str(v) + " |" for k,v in sorted(by_bucket.items())]
    md += ["", "## Pattern signals for targeted manual follow-up", "", "| Signal | Matching files |", "|---|---:|"]
    md += ["| " + k + " | " + str(v) + " |" for k,v in sorted(counts.items(),key=lambda kv:(-kv[1],kv[0]))]
    md += ["", "Every source path, frozen SHA, lines read, earliest signature positions and evidence state are in the quarter CSV ledger.",
           "**This is automated inspection, not 538 independent senior semantic reviews.** New B35+ gaps require a separate request-to-data trace and missing negative test."]
    (EVIDENCE/"MAIN_RELEASE_QUARTER_2_STATIC_REPORT.md").write_text("\n".join(md)+"\n",encoding="utf-8")
    print(json.dumps({"head":HEAD,"read":read_count,"total":len(rows),"manual":reviewed_count,"errors":error_paths[:8]},sort_keys=True))
    return 0 if read_count==538 and not error_paths else 2


if __name__ == "__main__":
    sys.exit(main())
