#!/usr/bin/env node
// npx jurassic-unix — browse your Claude Code sessions as the Jurassic Park
// 3D file system. Run it from a project folder and the camera flies straight
// to that project's sessions.
"use strict";

const fs = require("fs");
const { spawn } = require("child_process");
const { start, PROJECTS_DIR } = require("./server.js");

const port = parseInt(process.argv[2], 10) || 8931;

if (!fs.existsSync(PROJECTS_DIR)) {
  console.error(`No Claude Code projects found at ${PROJECTS_DIR}`);
  process.exit(1);
}

start(port, process.cwd(), (url) => {
  console.log(`It's a UNIX system. Your sessions: ${url}  (ctrl-C to stop)`);
  const opener = { darwin: "open", win32: "explorer" }[process.platform] || "xdg-open";
  spawn(opener, [url], { stdio: "ignore", detached: true }).on("error", () => {});
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Port ${port} is taken. Try: npx jurassic-unix ${port + 1}`);
    process.exit(1);
  }
  throw err;
});
