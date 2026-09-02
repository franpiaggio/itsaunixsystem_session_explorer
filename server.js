// It's a UNIX system — Claude Code session explorer (Node server).
// Scans ~/.claude/projects for lightweight session metadata (transcripts are
// never loaded into the page) and serves the static fsn-style frontend.
// Stdlib only. Used by cli.js; `python3 serve.py` remains as an alternative.
"use strict";

const fs = require("fs");
const http = require("http");
const path = require("path");
const os = require("os");

const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
const APP_DIR = __dirname;
const MAX_SESSIONS_PER_PROJECT = 40;
const HEAD_BYTES = 512 * 1024; // how far into a transcript we look for the first prompt

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".md": "text/plain",
};

function headMeta(file) {
  // First real user prompt, cwd and first timestamp from the transcript head.
  let prompt = "", cwd = "", ts = "";
  let head = "";
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(HEAD_BYTES);
    const n = fs.readSync(fd, buf, 0, HEAD_BYTES, 0);
    fs.closeSync(fd);
    head = buf.toString("utf8", 0, n);
  } catch {
    return { prompt, cwd, ts };
  }
  for (const line of head.split("\n")) {
    if (!ts) ts = (line.match(/"timestamp":"([^"]+)"/) || [])[1] || "";
    if (!cwd) cwd = (line.match(/"cwd":"([^"]+)"/) || [])[1] || "";
    if (!prompt && line.includes('"type":"user"')) {
      try {
        let content = (JSON.parse(line).message || {}).content || "";
        if (Array.isArray(content)) {
          content = content.map((p) => (p && p.text) || "").join(" ");
        }
        content = String(content).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        // skip local-command echo noise, keep the first real prompt
        if (content && !content.startsWith("Caveat:")) prompt = content.slice(0, 280);
      } catch { /* not a parseable line, keep looking */ }
    }
    if (prompt && cwd && ts) break;
  }
  return { prompt, cwd, ts };
}

function countLines(file) {
  let n = 0;
  try {
    const fd = fs.openSync(file, "r");
    const buf = Buffer.alloc(1 << 20);
    let read;
    while ((read = fs.readSync(fd, buf, 0, buf.length)) > 0) {
      for (let i = 0; i < read; i++) if (buf[i] === 10) n++;
    }
    fs.closeSync(fd);
  } catch { /* unreadable file: 0 turns */ }
  return n;
}

function scanSessions(focusCwd) {
  // fsn tree: root -> one dir per project -> one "file" per session.
  const projects = [];
  const encodedFocus = focusCwd ? focusCwd.replace(/[/.]/g, "-") : "";
  let focusName = "";
  let dirents = [];
  try {
    dirents = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true });
  } catch { /* no projects dir: empty tree */ }

  for (const de of dirents) {
    if (!de.isDirectory()) continue;
    const projDir = path.join(PROJECTS_DIR, de.name);
    const jsonls = fs.readdirSync(projDir)
      .filter((f) => f.endsWith(".jsonl"))
      .map((f) => {
        const full = path.join(projDir, f);
        return { full, stem: f.slice(0, -6), st: fs.statSync(full) };
      })
      .sort((a, b) => b.st.mtimeMs - a.st.mtimeMs);
    if (!jsonls.length) continue;

    let projName = "";
    const sessions = jsonls.slice(0, MAX_SESSIONS_PER_PROJECT).map((j) => {
      const { prompt, cwd, ts } = headMeta(j.full);
      if (cwd && !projName) projName = path.basename(cwd);
      const date = (ts || j.st.mtime.toISOString()).slice(0, 16).replace("T", " ");
      const title = prompt ? (prompt.length > 34 ? prompt.slice(0, 34) + "…" : prompt) : j.stem.slice(0, 8);
      return {
        name: title,
        size: Math.max(1, Math.floor(j.st.size / 1024)), // KB drives box height
        kind: "session",
        meta: {
          id: j.stem,
          prompt: prompt || "(no user prompt found)",
          date,
          turns: countLines(j.full),
          mb: Math.round(j.st.size / 1e5) / 10,
          cwd,
        },
      };
    });
    if (!projName) projName = de.name.split("-").pop() || de.name;
    if (encodedFocus && de.name === encodedFocus) focusName = projName;
    projects.push({ name: projName, mtime: jsonls[0].st.mtimeMs, dirs: [], files: sessions });
  }
  projects.sort((a, b) => b.mtime - a.mtime);
  projects.forEach((p) => delete p.mtime);
  return { name: "claude", dirs: projects, files: [], focus: focusName };
}

function start(port, focusCwd, onReady) {
  const server = http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    if (urlPath === "/sessions.json") {
      const body = JSON.stringify(scanSessions(focusCwd));
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(body);
      return;
    }
    const rel = urlPath === "/" ? "index.html" : urlPath.slice(1);
    const file = path.join(APP_DIR, path.normalize(rel));
    if (!file.startsWith(APP_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("not found");
      return;
    }
    res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
  });
  server.listen(port, "127.0.0.1", () => onReady(`http://localhost:${port}/`));
  return server;
}

module.exports = { start, scanSessions, PROJECTS_DIR };
