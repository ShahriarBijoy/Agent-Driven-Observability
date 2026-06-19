"""Auto-Fixer — the most permission-sensitive agent (built last).

Entrypoint: POST /auto-fix. Given an error pattern, it works inside a contained
clone of the repo (never the live tree), finds the bug with Glob/Read, fixes it
with Edit, and — only after an approval the web UI honors — opens a PR via
gh_open_pr. The clone's origin is a local bare repo, so the "PR" is a dry-run
push (a real PR would need a GitHub host). Tools: Read/Edit/Glob/Bash +
gh_open_pr + request_approval.
"""

from __future__ import annotations

import os
import subprocess

from ..config import config
from ..context import RunContext
from .base import run_agent_session


def _git(args: list[str], cwd: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=cwd, input=stdin, capture_output=True, text=True, timeout=180
    )


def prepare_workspace(run_id: str) -> tuple[str | None, str]:
    """Create a contained clone of the lab repo whose 'origin' is a local bare
    repo (the dry-run remote). Returns (repo_dir, 'ok') or (None, reason)."""
    base = os.path.join(config.artifacts_dir, "autofix", run_id)
    bare = os.path.join(base, "origin.git")
    repo = os.path.join(base, "repo")
    try:
        os.makedirs(base, exist_ok=True)
        init = _git(["init", "--bare", bare], cwd=os.getcwd())
        if init.returncode != 0:
            return None, f"bare init failed: {init.stderr.strip()}"
        clone = _git(["clone", "--local", "--no-hardlinks", config.lab_root, repo], cwd=base)
        if clone.returncode != 0:
            return None, f"clone failed: {clone.stderr.strip()}"
        base_branch = _git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=repo).stdout.strip() or "main"
        _git(["remote", "set-url", "origin", os.path.abspath(bare)], cwd=repo)
        seed = _git(["push", "origin", f"HEAD:{base_branch}"], cwd=repo)
        if seed.returncode != 0:
            return None, f"seed push failed: {seed.stderr.strip()}"
        _git(["config", "user.email", "autofixer@obs-lab.local"], cwd=repo)
        _git(["config", "user.name", "Auto-Fixer"], cwd=repo)
        return repo, "ok"
    except subprocess.TimeoutExpired:
        return None, "git timed out preparing the workspace"
    except Exception as exc:  # noqa: BLE001
        return None, f"workspace prep failed: {exc}"


async def run_autofixer(ctx: RunContext, error_pattern: str, hint: str = "") -> None:
    await ctx.begin(trigger="auto-fix")
    repo, reason = prepare_workspace(ctx.run_id)
    if repo is None:
        await ctx.fail(f"workspace setup failed: {reason}")
        return
    ctx.workspace = repo
    await ctx.add_user_message(f"Auto-fix request: {error_pattern}\n{hint}".strip())
    prompt = (
        f"An error pattern was reported:\n{error_pattern}\n\n"
        + (f"Hint: {hint}\n\n" if hint else "")
        + "You are in a contained clone of the repository (your current working directory). "
        "Find the bug with Glob/Read, make the smallest correct fix with Edit, and verify with "
        "Bash if you can. Then call request_approval with a one-sentence description of the change "
        "and WAIT. Only after 'approved', call gh_open_pr (you edited files directly, so the patch "
        "argument is optional). If denied, stop without opening a PR."
    )
    await run_agent_session(ctx, "auto-fixer", prompt, cwd=repo, max_turns=40)
    await ctx.end("completed")
