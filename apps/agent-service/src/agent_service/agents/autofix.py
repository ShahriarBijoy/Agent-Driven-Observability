"""Auto-Fixer — the most permission-sensitive agent (built last).

Entrypoint: POST /auto-fix. Given an error pattern, it works inside a contained
clone of the repo (never the live tree), finds the bug with Glob/Read, fixes it
with Edit, and — only after an approval the web UI honors — opens a PR via
gh_open_pr. With the local forge configured (P9), the clone's origin is the
real Gitea obs-lab repo and the PR is real; otherwise origin is a local bare
repo and the "PR" is a dry-run push. Tools: Read/Edit/Glob/Bash + gh_open_pr +
gitea_open_pr + request_approval.
"""

from __future__ import annotations

import base64
import os
import shutil
import stat
import subprocess

from ..config import config
from ..context import RunContext
from .base import run_agent_session


def _git(args: list[str], cwd: str, stdin: str | None = None) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["git", *args], cwd=cwd, input=stdin, capture_output=True, text=True, timeout=180
    )


def prepare_workspace(run_id: str) -> tuple[str | None, str]:
    """Create a contained clone of the lab repo. With the local forge
    configured (PLAN-2 P9), 'origin' is the REAL Gitea obs-lab repo — fix
    branches push there and gh_open_pr opens a real PR via the Gitea API.
    Without it, origin is a local bare repo (the Act-I dry-run path).
    Returns (repo_dir, 'ok') or (None, reason)."""
    # Absolute always: relative paths here get resolved against three different
    # cwds below (process cwd, base, repo) and silently diverge.
    base = os.path.abspath(os.path.join(config.artifacts_dir, "autofix", run_id))
    bare = os.path.join(base, "origin.git")
    repo = os.path.join(base, "repo")
    try:
        os.makedirs(base, exist_ok=True)
        clone = _git(["clone", "--local", "--no-hardlinks", config.lab_root, repo], cwd=base)
        if clone.returncode != 0:
            return None, f"clone failed: {clone.stderr.strip()}"
        base_branch = _git(["rev-parse", "--abbrev-ref", "HEAD"], cwd=repo).stdout.strip() or "main"
        if config.gitea_url and config.gitea_token:
            _git(["remote", "set-url", "origin",
                  f"{config.gitea_url}/{config.gitea_repo}.git"], cwd=repo)
            # Clone-scoped auth header; never touches the operator's global config.
            b64 = base64.b64encode(f"obs:{config.gitea_token}".encode()).decode()
            _git(["config", f"http.{config.gitea_url}/.extraheader",
                  f"Authorization: Basic {b64}"], cwd=repo)
        else:
            init = _git(["init", "--bare", bare], cwd=os.getcwd())
            if init.returncode != 0:
                return None, f"bare init failed: {init.stderr.strip()}"
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


def cleanup_workspace(repo: str) -> None:
    """Delete the working clone once the run is over, keeping origin.git.

    The clone balloons to hundreds of MB the moment the agent runs installs or
    tests inside it; the bare origin (which holds any pushed fix branch) stays
    ~1 MB, so dropping only the clone reclaims the disk without losing the
    result. Best-effort: cleanup must never mask the run outcome.
    """
    if not os.path.isdir(repo):
        return
    # git marks object files read-only, which rmtree can't delete on Windows —
    # strip the bit first.
    for root, _dirs, files in os.walk(repo):
        for name in files:
            try:
                os.chmod(os.path.join(root, name), stat.S_IWRITE)
            except OSError:
                pass
    shutil.rmtree(repo, ignore_errors=True)


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
    try:
        # The widest budget of any agent: it has to locate the bug, edit, run
        # the affected tests, and still reach the approval gate + PR (observed:
        # 40 turns ran out mid-test-run on a real incident).
        await run_agent_session(ctx, "auto-fixer", prompt, cwd=repo, max_turns=80)
    finally:
        cleanup_workspace(repo)
    await ctx.end("completed")
