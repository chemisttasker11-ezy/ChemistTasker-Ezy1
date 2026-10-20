#!/usr/bin/env python3
"""Auditable Django-app import graph, with module-level and delayed edges separated.

Pure standard library: no Django setup, imports of runtime application code, or
model/Celery imports. The existing ownership test remains the authoritative
compatibility guard; this adds machine-readable evidence and a no-new-cycle
cross-check, not a claim of a cycle-free backend.
"""
import argparse
import ast
import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BACKEND = ROOT / "backend"
OWNERSHIP_GUARD = BACKEND / "core" / "test_backend_ownership_boundaries.py"


def is_runtime(relative):
    parts = relative.parts
    name = parts[-1]
    return not (
        "migrations" in parts or "tests" in parts or
        parts[0] == "attendance_tests" or
        name.startswith("test") or name.endswith("test_settings.py")
        or parts[0] in {"media", "staticfiles", "verification_outputs"}
    )


def app_names(backend=BACKEND):
    return {p.parent.name for p in backend.glob("*/__init__.py")}


def direct_imports(node):
    if isinstance(node, ast.Import):
        return [alias.name for alias in node.names]
    if isinstance(node, ast.ImportFrom) and node.level == 0 and node.module:
        return [node.module]
    return []


def extract_edges(backend=BACKEND):
    apps = app_names(backend)
    direct, delayed = set(), set()
    evidence = defaultdict(list)
    for path in sorted(backend.rglob("*.py")):
        relative = path.relative_to(backend)
        if not is_runtime(relative) or not relative.parts or relative.parts[0] not in apps:
            continue
        source = relative.parts[0]
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(relative))
        module_import_nodes = {
            id(node) for node in tree.body
            if isinstance(node, (ast.Import, ast.ImportFrom))
        }
        for node in ast.walk(tree):
            modules = direct_imports(node)
            if not modules:
                continue
            for module in modules:
                target = module.split(".", 1)[0]
                if target not in apps or target == source:
                    continue
                kind = "module" if id(node) in module_import_nodes else "delayed"
                edge = (source, target)
                (direct if kind == "module" else delayed).add(edge)
                evidence[(source, target, kind)].append({
                    "path": relative.as_posix(), "line": node.lineno,
                    "import": module,
                })
    return direct, delayed, evidence


def mutual_pairs(edges):
    return {
        tuple(sorted((source, target)))
        for source, target in edges
        if (target, source) in edges
    }


def approved_mutual_pairs(guard=OWNERSHIP_GUARD):
    """Reuse the ownership guard's actual allowlist without importing Django."""
    tree = ast.parse(guard.read_text(encoding="utf-8"), filename=str(guard))
    for stmt in tree.body:
        if isinstance(stmt, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == "ALLOWED_MUTUAL_APP_PAIRS"
            for target in stmt.targets
        ):
            return {tuple(sorted(pair)) for pair in ast.literal_eval(stmt.value)}
    raise RuntimeError("Ownership guard no longer exposes ALLOWED_MUTUAL_APP_PAIRS; cannot verify cycles")


def build_report(backend=BACKEND, guard=OWNERSHIP_GUARD):
    direct, delayed, evidence = extract_edges(backend)
    existing = approved_mutual_pairs(guard)
    cycles = mutual_pairs(direct)
    return {
        "schema": "chemisttasker-backend-import-graph-v1",
        "scope": "runtime Python; migration and test files excluded",
        "module_edge_count": len(direct),
        "delayed_edge_count": len(delayed),
        "mutual_app_pairs": [list(pair) for pair in sorted(cycles)],
        "allowed_mutual_app_pairs": [list(pair) for pair in sorted(existing)],
        "new_unapproved_mutual_pairs": [list(pair) for pair in sorted(cycles - existing)],
        "module_edges": [
            {"from": a, "to": b, "sources": evidence[(a, b, "module")]}
            for a, b in sorted(direct)
        ],
        "delayed_edges": [
            {"from": a, "to": b, "sources": evidence[(a, b, "delayed")]}
            for a, b in sorted(delayed)
        ],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="fail if an unapproved mutual pair exists")
    parser.add_argument("--json", action="store_true", help="write machine-readable graph")
    options = parser.parse_args()
    report = build_report()
    if options.json:
        print(json.dumps(report, indent=2, sort_keys=True))
    else:
        print(
            f"Backend import graph: {report['module_edge_count']} module-level edges; "
            f"{report['delayed_edge_count']} delayed edges; "
            f"{len(report['mutual_app_pairs'])} mutual pairs "
            f"({len(report['new_unapproved_mutual_pairs'])} unapproved)."
        )
        for pair in report["new_unapproved_mutual_pairs"]:
            print("UNAPPROVED MUTUAL PAIR:", *pair)
    return 1 if options.check and report["new_unapproved_mutual_pairs"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
