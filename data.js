// Fallback tree, shown only when sessions.json is unavailable (e.g. the page
// is opened without serve.py). The real data comes from serve.py, which scans
// ~/.claude/projects and emits the same shape: { name, dirs[], files[] }.

export const FS_ROOT = {
  name: "claude",
  dirs: [
    {
      name: "no server",
      dirs: [],
      files: [
        { name: "run serve.py", size: 500, kind: "session", meta: {
          id: "demo", prompt: "This is demo data. Run `python3 serve.py` to explore your real Claude Code sessions.",
          date: "1993-06-11 09:00", turns: 0, mb: 0, cwd: "",
        }},
      ],
    },
  ],
  files: [],
};
