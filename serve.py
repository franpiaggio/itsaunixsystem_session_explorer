#!/usr/bin/env python3
"""It's a UNIX system — Claude Code session explorer.

Scans ~/.claude/projects, builds a small JSON tree (project -> sessions,
metadata only — transcripts are never loaded into the page) and serves
the static fsn-style frontend. One command, stdlib only:

    python3 serve.py [port]
"""
import json
import os
import re
import sys
import webbrowser
from datetime import datetime, timezone
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

PROJECTS_DIR = Path.home() / ".claude" / "projects"
APP_DIR = Path(__file__).resolve().parent
MAX_SESSIONS_PER_PROJECT = 40
MAX_HEAD_LINES = 400  # how far into a transcript we look for the first prompt


def first_user_prompt_and_meta(path):
    """Read the head of a JSONL transcript: first user text, cwd, first timestamp."""
    prompt, cwd, ts = "", "", ""
    try:
        with open(path, encoding="utf-8", errors="replace") as f:
            for i, line in enumerate(f):
                if i >= MAX_HEAD_LINES and prompt:
                    break
                if not ts and '"timestamp"' in line:
                    m = re.search(r'"timestamp":"([^"]+)"', line)
                    if m:
                        ts = m.group(1)
                if not cwd and '"cwd"' in line:
                    m = re.search(r'"cwd":"([^"]+)"', line)
                    if m:
                        cwd = m.group(1)
                if not prompt and '"type":"user"' in line:
                    try:
                        msg = json.loads(line).get("message", {})
                        content = msg.get("content", "")
                        if isinstance(content, list):
                            content = " ".join(
                                p.get("text", "") for p in content if isinstance(p, dict)
                            )
                        content = re.sub(r"<[^>]+>", " ", str(content))  # strip reminder tags
                        content = re.sub(r"\s+", " ", content).strip()
                        # skip local-command echo noise, keep the first real prompt
                        if content and not content.startswith("Caveat:"):
                            prompt = content[:280]
                    except (json.JSONDecodeError, AttributeError):
                        pass
                if prompt and cwd and ts:
                    break
    except OSError:
        pass
    return prompt, cwd, ts


def count_lines(path):
    n = 0
    try:
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(1 << 20), b""):
                n += chunk.count(b"\n")
    except OSError:
        pass
    return n


def scan_sessions():
    """Build the fsn tree: root -> one dir per project -> one file per session."""
    projects = []
    for proj_dir in sorted(PROJECTS_DIR.glob("*/")):
        jsonls = sorted(
            proj_dir.glob("*.jsonl"), key=lambda p: p.stat().st_mtime, reverse=True
        )
        if not jsonls:
            continue
        sessions, proj_name = [], ""
        for p in jsonls[:MAX_SESSIONS_PER_PROJECT]:
            st = p.stat()
            prompt, cwd, ts = first_user_prompt_and_meta(p)
            if cwd and not proj_name:
                proj_name = Path(cwd).name
            date = (ts or datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat())[:16]
            title = (prompt[:34] + "…") if len(prompt) > 34 else (prompt or p.stem[:8])
            sessions.append({
                "name": title or p.stem[:8],
                "size": max(1, st.st_size // 1024),  # KB drives box height
                "kind": "session",
                "meta": {
                    "id": p.stem,
                    "prompt": prompt or "(no user prompt found)",
                    "date": date.replace("T", " "),
                    "turns": count_lines(p),
                    "mb": round(st.st_size / 1e6, 1),
                    "cwd": cwd,
                },
            })
        if not proj_name:
            proj_name = proj_dir.name.split("-")[-1] or proj_dir.name
        projects.append({
            "name": proj_name,
            "mtime": max(p.stat().st_mtime for p in jsonls),
            "dirs": [],
            "files": sessions,
        })
    projects.sort(key=lambda d: d["mtime"], reverse=True)
    for d in projects:
        del d["mtime"]
    return {"name": "claude", "dirs": projects, "files": []}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(APP_DIR), **kwargs)

    def do_GET(self):
        if self.path.split("?")[0] == "/sessions.json":
            body = json.dumps(scan_sessions()).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def log_message(self, *args):
        pass  # keep the terminal quiet


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8931
    if not PROJECTS_DIR.is_dir():
        sys.exit(f"No Claude Code projects found at {PROJECTS_DIR}")
    server = HTTPServer(("127.0.0.1", port), Handler)
    url = f"http://localhost:{port}/"
    print(f"It's a UNIX system. Your sessions: {url}  (ctrl-C to stop)")
    webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
