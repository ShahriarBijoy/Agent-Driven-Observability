"""Config path anchoring: relative .env paths mean repo-relative, never
cwd-relative (the service starts in apps/agent-service)."""

import os

from agent_service.config import LAB_ROOT, load_config


def test_relative_env_paths_anchor_at_lab_root(monkeypatch):
    monkeypatch.setenv("RUNBOOKS_DIR", "runbooks")
    monkeypatch.setenv("ARTIFACTS_DIR", ".artifacts")
    monkeypatch.setenv("SUBJECT_REPO_DIR", "some/clone")
    cfg = load_config()
    assert cfg.runbooks_dir == os.path.join(LAB_ROOT, "runbooks")
    assert cfg.artifacts_dir == os.path.join(LAB_ROOT, ".artifacts")
    assert cfg.subject_repo_dir == os.path.join(LAB_ROOT, "some/clone")


def test_absolute_env_paths_pass_through(monkeypatch):
    absolute = os.path.abspath(os.path.join(os.sep, "opt", "runbooks"))
    monkeypatch.setenv("RUNBOOKS_DIR", absolute)
    cfg = load_config()
    assert cfg.runbooks_dir == absolute


def test_unset_paths_default_to_lab_root(monkeypatch):
    monkeypatch.delenv("RUNBOOKS_DIR", raising=False)
    monkeypatch.delenv("ARTIFACTS_DIR", raising=False)
    monkeypatch.delenv("SUBJECT_REPO_DIR", raising=False)
    cfg = load_config()
    assert cfg.runbooks_dir == os.path.join(LAB_ROOT, "runbooks")
    assert cfg.artifacts_dir == os.path.join(LAB_ROOT, ".artifacts")
    assert cfg.subject_repo_dir is None
