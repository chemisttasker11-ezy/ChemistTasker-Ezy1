"""Collect PyPI release evidence for audited packages; never change requirement pins.

This read-only CI helper records available, non-yanked stable releases and their
actual dependency constraints. Advisory fix-version lists are evidence, not an
instruction to install a prospective or incompatible release automatically.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen

from packaging.specifiers import SpecifierSet
from packaging.version import InvalidVersion, Version


MAX_BYTES = 12 * 1024 * 1024
PYTHON_VERSION = ".".join(map(str, sys.version_info[:3]))


def fetch_json(name, version=None):
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_.-]*", name):
        raise ValueError("Invalid package name")
    suffix = f"/{quote(str(version), safe='')}" if version else ""
    url = f"https://pypi.org/pypi/{quote(name, safe='')}{suffix}/json"
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "ChemistTasker-runtime-review/1"})
    with urlopen(request, timeout=20) as response:
        if not response.geturl().startswith("https://pypi.org/"):
            raise ValueError("Unexpected release-registry redirect")
        data = response.read(MAX_BYTES + 1)
        if len(data) > MAX_BYTES:
            raise ValueError("Release metadata exceeds the review limit")
    return json.loads(data), url


def compatible_artifacts(files):
    return [item for item in files if not item.get("yanked") and
            PYTHON_VERSION in SpecifierSet(item.get("requires_python") or "")]


def collect(package):
    name = package["name"]
    findings = package.get("vulns", [])
    result = {
        "package": name, "installed": package["version"],
        "advisory_entries": len(findings),
        "unique_advisory_ids": sorted({item["id"] for item in findings}),
        "reported_fix_versions": sorted({version for item in findings for version in item.get("fix_versions", [])}),
        "findings_without_reported_fix": sorted({item["id"] for item in findings if not item.get("fix_versions")}),
    }
    try:
        project, source = fetch_json(name)
        releases = []
        for text, files in project.get("releases", {}).items():
            try:
                version = Version(text)
            except InvalidVersion:
                continue
            if not version.is_prerelease and not version.is_devrelease and compatible_artifacts(files):
                releases.append(version)
        if not releases:
            raise ValueError("No stable non-yanked Python-compatible release found")
        latest = str(max(releases))
        candidates = {latest}
        available = {str(version) for version in releases}
        published_fixes = available.intersection(result["reported_fix_versions"])
        if published_fixes:
            candidates.add(str(max(map(Version, published_fixes))))
        result["catalogue_source"] = source
        result["latest_compatible_stable"] = latest
        result["unavailable_reported_fixes"] = sorted(set(result["reported_fix_versions"]) - available)
        result["candidates"] = []
        for version in sorted(candidates, key=Version):
            metadata, version_source = fetch_json(name, version)
            files = compatible_artifacts(metadata.get("urls", []))
            if not files or metadata.get("info", {}).get("version") != version:
                raise ValueError("Version-specific metadata did not confirm the candidate")
            result["candidates"].append({
                "version": version, "source": version_source,
                "requires_python": metadata["info"].get("requires_python"),
                "requires_dist": metadata["info"].get("requires_dist", []),
                "artifact_count": len(files),
                "first_upload": min(item["upload_time_iso_8601"] for item in files),
            })
    except Exception as exc:
        result["metadata_error"] = f"{type(exc).__name__}: {exc}"
    return result


def main():
    directory = Path("runtime-evidence")
    report = directory / "advisories.json"
    if not report.is_file():
        print("No audit report; cannot infer release-update candidates.")
        return
    packages = [item for item in json.loads(report.read_text())["dependencies"] if item.get("vulns")]
    with ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(collect, packages))
    output = {
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "python": PYTHON_VERSION,
        "policy": "Read-only evidence. No requirement updates, advisory suppression or audit-result overrides.",
        "packages": results,
    }
    (directory / "release-metadata.json").write_text(json.dumps(output, indent=2) + "\n")
    for item in results:
        print(item["package"], item["installed"], "latest=", item.get("latest_compatible_stable"),
              "unavailable_fixes=", item.get("unavailable_reported_fixes"),
              "unfixed=", item["findings_without_reported_fix"], item.get("metadata_error", ""))
    if any(item.get("metadata_error") for item in results):
        raise SystemExit("Some release metadata could not be verified; do not infer missing versions.")


if __name__ == "__main__":
    main()
