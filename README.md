# Session Explorer — "It's a UNIX system!"

Browse your **Claude Code sessions** as the 3D file system from
*Jurassic Park* (1993) — the SGI fsn interface, rebuilt in Three.js with
CRT shaders.

Each salmon pedestal is one of your projects. Each box is a session:
height = transcript size. Click a box and a control-room window opens with
the session card — first prompt, date, turns, size — and a one-click
`claude --resume` command.

Transcripts are never loaded into the page; only lightweight metadata is
scanned. Everything stays on `localhost`.

## Run it (one command)

```bash
npx jurassic-unix
```

Run it inside one of your project folders and the camera flies straight to
that project's sessions. Opens `http://localhost:8931/` (pass a port as the
only argument to change it). Zero dependencies — Node 16+ stdlib; Three.js
and lil-gui come from CDN.

Prefer Python? Clone the repo and `python3 serve.py` does the same.

## Controls

| Input | Action |
|---|---|
| Click pedestal | Fly to that project |
| Click box | Select session (spotlight) |
| Double-click / Enter | Open the session card |
| `COPY RESUME CMD` button | Copies `claude --resume <id>` |
| `W` `A` `S` `D`, `← →`, `R`/`F` | Move, turn, altitude |
| Mouse drag / wheel | Look / dolly zoom |
| Touch: joystick + drag | Move + look (mobile) |
| `Esc` | Close window / clear selection |
| `P` / `O` | Toggle CRT shaders / tweak panel |

## Files

- `serve.py` — scans `~/.claude/projects`, serves the app + `sessions.json`
- `main.js` — scene, layout, navigation, CRT post chain (NTSC + tube,
  ported from livecoder's effects)
- `windows.js` — in-tube control-room windows (the session card lives here)
- `data.js` — fallback demo tree when the server isn't running

Fork of [itsaunixsystem](https://github.com/franpiaggio/itsaunixsystem),
the plain movie replica.
