"""Auto-fixer workspace cleanup: drops the (huge) working clone, keeps
origin.git, and survives git's read-only object files."""

import os
import stat

from agent_service.agents.autofix import cleanup_workspace


def test_cleanup_removes_clone_including_readonly_files(tmp_path):
    base = tmp_path / "run_x"
    repo = base / "repo"
    objects = repo / ".git" / "objects"
    objects.mkdir(parents=True)
    locked = objects / "pack-abc.pack"
    locked.write_text("objects")
    os.chmod(locked, stat.S_IREAD)
    bare = base / "origin.git"
    bare.mkdir()
    (bare / "HEAD").write_text("ref: refs/heads/main\n")

    cleanup_workspace(str(repo))

    assert not repo.exists()
    assert bare.exists()  # the pushed fix branch lives here — never deleted


def test_cleanup_is_a_noop_for_missing_paths(tmp_path):
    cleanup_workspace(str(tmp_path / "does-not-exist"))
