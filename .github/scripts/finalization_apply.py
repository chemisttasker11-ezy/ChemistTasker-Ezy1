"""Temporary transport for exact reviewed trees; never writes main or a PR ref."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import subprocess
import tempfile


def git(*args, data=None):
    return subprocess.check_output(["git", *args], input=data).decode().strip()


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


require(os.environ.get("GITHUB_REPOSITORY") == "chemisttasker11-ezy/ChemistTasker-Ezy1", "Wrong repository")
require(os.environ.get("GITHUB_REF") == "refs/heads/work/finalization-recovery-20261006", "Wrong transport ref")
require(git("rev-parse", "HEAD") == os.environ["GITHUB_SHA"], "Transport head mismatch")
manifest = json.loads(Path(".finalization-transfer/manifest.json").read_text())
patch = Path(".finalization-transfer/change.patch").read_bytes()
require(set(manifest) == {"base", "tree", "patch_sha256", "destination", "paths", "message"}, "Unexpected manifest keys")
for key in ("base", "tree"):
    require(bool(re.fullmatch(r"[a-f0-9]{40}", manifest[key])), "Invalid object SHA")
require(hashlib.sha256(patch).hexdigest() == manifest["patch_sha256"], "Patch digest mismatch")
require(manifest["destination"] == "work/finalization-candidate-" + manifest["patch_sha256"][:12], "Invalid candidate branch")
require(0 < len(patch) < 3000000, "Patch size out of bounds")
require(isinstance(manifest["paths"], list) and 0 < len(manifest["paths"]) <= 600, "Invalid changed paths")
require(manifest["paths"] == sorted(set(manifest["paths"])), "Changed paths must be unique/sorted")
for value in manifest["paths"]:
    path = PurePosixPath(value)
    require(not path.is_absolute() and ".." not in path.parts and ".git" not in path.parts, "Unsafe patch path")
    require("/migrations/" not in value, "Migration changes require a separate explicit transport")
    require(not value.startswith(".finalization-transfer/"), "Transport files must not enter release tree")
require(isinstance(manifest["message"], str) and 0 < len(manifest["message"]) < 200, "Invalid commit message")
require("\n" not in manifest["message"], "Only a single commit title is allowed")

with tempfile.TemporaryDirectory(dir=os.environ["RUNNER_TEMP"]) as temporary:
    patch_file = Path(temporary) / "reviewed.patch"
    patch_file.write_bytes(patch)
    git("fetch", "--no-tags", "--depth=1", "origin", manifest["base"])
    git("checkout", "--detach", manifest["base"])
    require(git("rev-parse", "HEAD") == manifest["base"], "Source head mismatch")
    git("apply", "--index", "--whitespace=error-all", str(patch_file))
    git("diff", "--cached", "--check")
    actual_paths = sorted(git("diff", "--cached", "--name-only", "HEAD").splitlines())
    require(actual_paths == manifest["paths"], "Changed path set mismatch")
    tree = git("write-tree")
    require(tree == manifest["tree"], "Result differs from the locally reviewed Git tree")
    git("config", "user.name", "ChemistTasker Finalization Automation")
    git("config", "user.email", "noreply@github.com")
    destination = "refs/heads/" + manifest["destination"]
    require(not git("ls-remote", "--heads", "origin", destination), "Candidate already exists; no overwrite permitted")
    commit = git("commit-tree", tree, "-p", manifest["base"], "-m", manifest["message"])
    git("push", "--force-with-lease=" + destination + ":", "origin", commit + ":" + destination)
    result = {"base": manifest["base"], "tree": tree, "commit": commit, "candidate": manifest["destination"], "patch_sha256": manifest["patch_sha256"], "paths": actual_paths}
    print("FINALIZATION_RESULT=" + json.dumps(result, sort_keys=True))
    with open(os.environ["GITHUB_STEP_SUMMARY"], "a") as summary:
        summary.write("Verified candidate tree created. No main/PR ref was changed.\n\n```json\n" + json.dumps(result, indent=2) + "\n```\n")
