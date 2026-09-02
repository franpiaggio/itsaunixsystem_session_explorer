// ============================================================
// JP window system — drawn on a 2D canvas that gets composited
// INTO the CRT pipeline (so the NTSC+tube shaders hit the UI).
// Look modeled on the actual movie control-room app (Motif-ish
// gray-blue bevel panels, VEHICLE tabs, HOLD/QUIT/NEW transport,
// GLITCHES "CLEAR" list, blueprint maps with SECURED markers).
// ============================================================

// Motif-ish palette sampled from the stills
const P = {
  frame: "#929aae",
  frameLight: "#c2c8d4",
  frameDark: "#454e62",
  face: "#9ca4b6",
  faceDim: "#858da2",
  title: "#aab0c0",
  titleText: "#232838",
  inset: "#7a8296",
  paper: "#d2cfbf",
  statusBg: "#c4c8d2",
  ink: "#14181f",
  green: "#3f7d52",
  greenBright: "#7bd691",
  teal: "#3e6e6a",
  salmon: "#cf7a6a",
  red: "#b53a2e",
  navy: "#0a0f14",
  mapGrid: "#2f5c46",
};

function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function hashStr(s) {
  let h = 1993;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

// ---------- draw helpers ----------
function bevel(ctx, x, y, w, h, raised = true, face = P.face) {
  ctx.fillStyle = face;
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = raised ? P.frameLight : P.frameDark;
  ctx.fillRect(x, y, w, 2); ctx.fillRect(x, y, 2, h);
  ctx.fillStyle = raised ? P.frameDark : P.frameLight;
  ctx.fillRect(x, y + h - 2, w, 2); ctx.fillRect(x + w - 2, y, 2, h);
}
function insetBox(ctx, x, y, w, h, fill) {
  bevel(ctx, x, y, w, h, false, fill);
}
function text(ctx, s, x, y, font, color, align = "left") {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "alphabetic";
  ctx.fillText(s, x, y);
  ctx.textAlign = "left";
}

const MONO = (px) => `${px}px "Courier New", monospace`;
const MONOB = (px) => `bold ${px}px "Courier New", monospace`;
const SANS = (px) => `${px}px "Tahoma", "Arial", sans-serif`;
const SANSB = (px) => `bold ${px}px "Tahoma", "Arial", sans-serif`;
const HEAVYI = (px) => `italic 900 ${px}px "Arial Black", "Arial", sans-serif`;

// crash-test-dummy-ish quadrant logo from the VEHICLE panel
function drawLogo(ctx, x, y, s) {
  bevel(ctx, x - 4, y - 4, s + 8, s + 8, true, P.faceDim);
  ctx.fillStyle = "#4c7a58";
  ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = "#111"; ctx.lineWidth = 2;
  ctx.strokeRect(x, y, s, s);
  const cx = x + s / 2, cy = y + s / 2, r = s * 0.32;
  ctx.fillStyle = "#111";
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#e8e0a8";
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, -Math.PI / 2, 0); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.arc(cx, cy, r, Math.PI / 2, Math.PI); ctx.closePath(); ctx.fill();
}

// ---------- window ----------
let zCounter = 1;

export class JPWin {
  constructor(kind, file, dirNode, path, x, y, w, h) {
    this.kind = kind; this.file = file; this.dirNode = dirNode; this.path = path;
    this.x = x; this.y = y; this.w = w; this.h = h;
    this.z = zCounter++;
    this.hits = [];          // {x,y,w,h,fn} in window-local coords
    this.state = {};         // per-kind mutable state
    this.rng = mulberry32(hashStr(file ? file.name : kind));
  }

  contains(px, py) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h;
  }
  inTitle(px, py) {
    return px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + 26;
  }

  addHit(x, y, w, h, fn) { this.hits.push({ x, y, w, h, fn }); }

  click(px, py) {
    const lx = px - this.x, ly = py - this.y;
    for (const hb of this.hits) {
      if (lx >= hb.x && lx <= hb.x + hb.w && ly >= hb.y && ly <= hb.y + hb.h) { hb.fn(); return true; }
    }
    return false;
  }

  // small beveled button, registers hit, returns bottom Y
  button(ctx, label, x, y, w, h, fn, opts = {}) {
    const pressed = opts.pressed;
    bevel(ctx, this.x + x, this.y + y, w, h, !pressed, opts.face || P.face);
    text(ctx, label, this.x + x + w / 2, this.y + y + h / 2 + 4, opts.font || SANSB(11), opts.color || P.titleText, "center");
    if (fn) this.addHit(x, y, w, h, fn);
  }

  draw(ctx, t, mgr) {
    this.hits = [];
    const { x, y, w, h } = this;
    // frame + face
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    ctx.fillRect(x + 5, y + 5, w, h); // drop shadow
    bevel(ctx, x, y, w, h, true, P.frame);
    // title bar
    bevel(ctx, x + 3, y + 3, w - 6, 22, true, P.title);
    // hamburger
    ctx.fillStyle = P.titleText;
    for (let i = 0; i < 3; i++) ctx.fillRect(x + 9, y + 9 + i * 4, 12, 2);
    text(ctx, this.title(), x + 28, y + 19, SANSB(12), P.titleText);
    // close box
    bevel(ctx, x + w - 23, y + 5, 18, 18, true, P.face);
    text(ctx, "✕", x + w - 14, y + 18, SANSB(11), P.titleText, "center");
    this.addHit(w - 23, 5, 18, 18, () => mgr.close(this));
    // content clip
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 4, y + 27, w - 8, h - 32);
    ctx.clip();
    ctx.fillStyle = P.face;
    ctx.fillRect(x + 4, y + 27, w - 8, h - 32);
    DRAW[this.kind].call(this, ctx, t, mgr);
    ctx.restore();
  }

  title() {
    const t = TITLES[this.kind];
    return typeof t === "function" ? t(this) : (this.file ? this.file.name.toUpperCase() : t);
  }
}

const TITLES = {
  session: (w) => "SESSION — " + w.file.name,
  map: (w) => `MAP — ${w.file.name}`,
  control: (w) => `CONTROL — ${w.file.name}`,
  log: (w) => `SYSLOG — ${w.file.name}`,
  db: (w) => `RECORDS — ${w.file.name}`,
  avi: (w) => `VIDEO — ${w.file.name}`,
  gen: (w) => `GENOME — ${w.file.name}`,
  rec: (w) => `PERSONNEL — ${w.file.name}`,
  exec: (w) => `MODULE — ${w.file.name}`,
  reboot: () => "VEHICLE",
  magic: () => "SECURITY — ACCESS VIOLATION",
  txt: (w) => w.file.name,
};

// ---------- per-kind content ----------
const DRAW = {
  // Claude Code session card: metadata + first prompt + resume command
  session(ctx) {
    const m = this.file.meta;
    const project = (m.cwd ? m.cwd.split("/").pop() : "?").slice(0, 14);
    const cols = [
      ["PROJECT", project, 16], ["DATE", m.date || "?", 128],
      ["TURNS", String(m.turns), 262], ["SIZE", m.mb + " MB", 322],
    ];
    for (const [k, v, cx2] of cols) {
      text(ctx, k, this.x + cx2, this.y + 44, SANSB(11), "#59647c");
      text(ctx, v, this.x + cx2, this.y + 60, MONOB(12), P.ink);
    }
    // first prompt, wrapped, on paper
    insetBox(ctx, this.x + 12, this.y + 70, this.w - 24, 120, P.paper);
    ctx.font = MONO(12);
    const words = (m.prompt || "").split(" ");
    let line = "", yy = 88;
    for (const word of words) {
      if (ctx.measureText(line + " " + word).width > this.w - 52) {
        text(ctx, line, this.x + 22, this.y + yy, MONO(12), P.ink);
        yy += 16; line = word;
        if (yy > 178) { line += "…"; break; }
      } else line = line ? line + " " + word : word;
    }
    text(ctx, line, this.x + 22, this.y + yy, MONO(12), P.ink);
    // resume command + copy
    const cmd = "claude --resume " + m.id;
    insetBox(ctx, this.x + 12, this.y + 198, this.w - 24, 24, P.statusBg);
    ctx.font = MONO(11);
    const shortCmd = cmd.length > 46 ? cmd.slice(0, 45) + "…" : cmd;
    text(ctx, shortCmd, this.x + 20, this.y + 214, MONO(11), P.ink);
    this.button(ctx, this.state.copied ? "COPIED" : "COPY RESUME CMD", 12, 230, 150, 24, () => {
      navigator.clipboard.writeText(cmd).catch(() => {});
      this.state.copied = true;
    });
    text(ctx, "id " + m.id.slice(0, 8), this.x + this.w - 16, this.y + 247, MONO(11), "#59647c", "right");
  },

  // blueprint map with SECURED / UNLOCKED markers (movie stills)
  map(ctx, t) {
    const x = this.x + 10, y = this.y + 33, w = this.w - 20, h = this.h - 74;
    const secured = this.state.secured !== false;
    // header bar
    ctx.fillStyle = secured ? P.green : P.salmon;
    ctx.fillRect(x, y, w, 20);
    text(ctx, secured ? "SYSTEM SECURED" : "SYSTEM UNLOCKED", x + w / 2, y + 15, SANSB(13), "#eef", "center");
    // map field
    const my = y + 24, mh = h - 24;
    ctx.fillStyle = P.navy; ctx.fillRect(x, my, w, mh);
    ctx.strokeStyle = P.mapGrid; ctx.lineWidth = 1;
    for (let gx = 0; gx <= w; gx += 24) { ctx.beginPath(); ctx.moveTo(x + gx, my); ctx.lineTo(x + gx, my + mh); ctx.stroke(); }
    for (let gy = 0; gy <= mh; gy += 24) { ctx.beginPath(); ctx.moveTo(x, my + gy); ctx.lineTo(x + w, my + gy); ctx.stroke(); }
    // walls: arcs + rooms, deterministic
    const rng = mulberry32(hashStr(this.file.name) ^ 7);
    ctx.strokeStyle = "#dde4ee"; ctx.lineWidth = 2.5;
    for (let i = 0; i < 3; i++) {
      const cx = x + w * (0.25 + rng() * 0.5), cy = my + mh * (0.3 + rng() * 0.5);
      ctx.beginPath(); ctx.arc(cx, cy, 24 + rng() * 60, rng() * 3, rng() * 3 + 2 + rng() * 2); ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      ctx.strokeRect(x + 8 + rng() * (w - 60), my + 8 + rng() * (mh - 40), 18 + rng() * 34, 10 + rng() * 18);
    }
    // lock markers — one per grid slot so labels never overlap
    const n = 4 + Math.floor(rng() * 3);
    const slots = [0, 1, 2, 3, 4, 5, 6, 7, 8].sort(() => rng() - 0.5).slice(0, n);
    for (let i = 0; i < n; i++) {
      const gcol = slots[i] % 3, grow = Math.floor(slots[i] / 3);
      const lx = x + 24 + gcol * ((w - 90) / 2) + rng() * 14;
      const ly = my + 22 + grow * ((mh - 44) / 2) + rng() * 10;
      const col = secured ? P.greenBright : P.salmon;
      ctx.fillStyle = col;
      ctx.beginPath(); ctx.arc(lx, ly, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = P.navy; ctx.fillRect(lx - 1.5, ly - 3, 3, 6);
      text(ctx, secured ? "SECURED" : "UNLOCKED", lx + 11, ly + 4, MONOB(12), col);
    }
    // toggle for fun (narrative: lock/unlock the sector)
    this.button(ctx, secured ? "UNLOCK SECTOR" : "SECURE SECTOR", 12, this.h - 36, 130, 22,
      () => { this.state.secured = !secured; });
    text(ctx, `grid ${this.file.size} kb`, this.x + this.w - 16, this.y + this.h - 20, MONO(12), P.titleText, "right");
  },

  // Motif control panel: switch rows
  control(ctx) {
    const rng = mulberry32(hashStr(this.file.name));
    const labels = ["MAIN POWER", "RELAY A", "RELAY B", "VOLTAGE", "TIMEOUT", "CHANNEL", "SENSOR GAIN"];
    let yy = 36;
    for (let i = 0; i < 6; i++) {
      const on = this.state[`sw${i}`] !== undefined ? this.state[`sw${i}`] : rng() > 0.35;
      this.state[`sw${i}`] = on;
      text(ctx, labels[i % labels.length], this.x + 14, this.y + yy + 15, SANSB(11), P.titleText);
      // switch track
      const sx = 130, sw = 54;
      insetBox(ctx, this.x + sx, this.y + yy, sw, 20, on ? "#5b8a68" : P.inset);
      bevel(ctx, this.x + sx + (on ? sw - 24 : 2), this.y + yy + 2, 22, 16, true, P.face);
      text(ctx, on ? "ON" : "OFF", this.x + sx + sw + 10, this.y + yy + 15, MONOB(11), on ? P.green : P.red);
      const val = Math.floor(rng() * 5000);
      text(ctx, String(val).padStart(4, "0"), this.x + this.w - 16, this.y + yy + 15, MONO(12), P.titleText, "right");
      const idx = i;
      this.addHit(sx, yy, sw, 20, () => { this.state[`sw${idx}`] = !on; });
      yy += 28;
    }
    insetBox(ctx, this.x + 12, this.y + yy + 4, this.w - 24, 24, P.statusBg);
    text(ctx, "ALL SYSTEMS NOMINAL", this.x + this.w / 2, this.y + yy + 21, HEAVYI(12), P.titleText, "center");
  },

  log(ctx, t) {
    insetBox(ctx, this.x + 10, this.y + 33, this.w - 20, this.h - 46, P.paper);
    const rng = mulberry32(hashStr(this.file.name));
    let yy = 52;
    text(ctx, `# ${this.path}`, this.x + 18, this.y + yy, MONO(12), "#666"); yy += 16;
    for (let i = 0; i < 10; i++) {
      const hh = String(Math.floor(rng() * 24)).padStart(2, "0");
      const mm = String(Math.floor(rng() * 60)).padStart(2, "0");
      const warn = rng() > 0.78;
      text(ctx, `06/11 ${hh}:${mm}  ${warn ? "WARN" : "info"}  sector ${Math.floor(rng() * 90)} ${warn ? "fault" : "ok"}`,
        this.x + 18, this.y + yy, MONO(12), warn ? P.red : P.ink);
      yy += 16;
    }
    if (Math.floor(t * 2) % 2) ctx.fillRect(this.x + 18, this.y + yy - 10, 8, 12); // cursor blink
  },

  db(ctx) {
    const rng = mulberry32(hashStr(this.file.name));
    insetBox(ctx, this.x + 10, this.y + 33, this.w - 20, this.h - 46, P.statusBg);
    const cols = [["ID", 16], ["RECORD", 70], ["SIZE", 190], ["STATUS", 250]];
    for (const [c, cx] of cols) text(ctx, c, this.x + 14 + cx, this.y + 50, SANSB(11), P.titleText);
    ctx.fillStyle = P.frameDark; ctx.fillRect(this.x + 14, this.y + 55, this.w - 28, 1);
    const words = ["paddock", "gate", "sensor", "keycard", "embryo", "tour", "fence", "feed", "badge", "route"];
    let yy = 72;
    for (let i = 0; i < 9; i++) {
      if (i % 2) { ctx.fillStyle = "rgba(90,100,130,0.12)"; ctx.fillRect(this.x + 12, this.y + yy - 12, this.w - 24, 16); }
      text(ctx, String(i + 1).padStart(3, "0"), this.x + 30, this.y + yy, MONO(12), P.ink);
      text(ctx, words[Math.floor(rng() * words.length)] + "_" + Math.floor(rng() * 99), this.x + 84, this.y + yy, MONO(12), P.ink);
      text(ctx, Math.floor(rng() * 900 + 12) + "k", this.x + 204, this.y + yy, MONO(12), P.ink);
      const okB = rng() > 0.2;
      text(ctx, okB ? "OK" : "LOCKED", this.x + 264, this.y + yy, MONOB(12), okB ? P.green : P.red);
      yy += 16;
    }
  },

  avi(ctx, t) {
    const x = this.x + 10, y = this.y + 33, w = this.w - 20, h = this.h - 70;
    insetBox(ctx, x, y, w, h, "#0c0e11");
    // animated CRT noise field
    const frame = Math.floor(t * 12);
    const rng = mulberry32(hashStr(this.file.name) ^ frame);
    ctx.fillStyle = "rgba(180,190,200,0.5)";
    for (let i = 0; i < 260; i++) ctx.fillRect(x + 3 + rng() * (w - 6), y + 3 + rng() * (h - 6), 2, 1);
    // rolling band
    const by = y + ((frame * 7) % h);
    ctx.fillStyle = "rgba(220,225,235,0.12)"; ctx.fillRect(x + 2, by, w - 4, 10);
    text(ctx, "NO SIGNAL — LINE FAULT", x + w / 2, y + h / 2, MONOB(13), "rgba(220,225,235,0.75)", "center");
    // REC + cam id
    if (Math.floor(t * 2) % 2) { ctx.fillStyle = P.red; ctx.beginPath(); ctx.arc(x + 14, y + 14, 5, 0, 7); ctx.fill(); }
    text(ctx, "REC", x + 24, y + 18, MONOB(11), "#eee");
    text(ctx, "CAM " + this.file.name.replace(/\.avi$/, "").toUpperCase(), x + 8, y + h - 8, MONO(12), "#cdd5e0");
    const s = Math.floor(t) % 60, m = Math.floor(t / 60) % 60;
    text(ctx, `00:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`, x + w - 8, y + 18, MONO(12), "#cdd5e0", "right");
    this.button(ctx, "HOLD", 12, this.h - 32, 70, 20, () => {});
    this.button(ctx, "NEXT", 90, this.h - 32, 70, 20, () => {});
  },

  gen(ctx) {
    text(ctx, "INGEN GENOMICS — SEQUENCE VIEWER", this.x + this.w / 2, this.y + 46, SANSB(11), P.teal, "center");
    insetBox(ctx, this.x + 10, this.y + 54, this.w - 20, this.h - 96, P.paper);
    const rng = mulberry32(hashStr(this.file.name));
    const colors = { A: P.green, C: P.teal, G: "#a08018", T: P.salmon };
    const bases = "ACGT";
    let yy = 72;
    for (let r = 0; r < 8; r++) {
      let xx = this.x + 20;
      text(ctx, String(r * 24).padStart(4, "0"), xx, this.y + yy, MONO(12), "#888");
      xx += 44;
      for (let c = 0; c < 24; c++) {
        const b = bases[Math.floor(rng() * 4)];
        text(ctx, b, xx, this.y + yy, MONOB(12), colors[b]);
        xx += 11;
      }
      yy += 17;
    }
    const fill = 8 + Math.floor(this.rng() * 20);
    insetBox(ctx, this.x + 10, this.y + this.h - 36, this.w - 20, 24, P.statusBg);
    text(ctx, `viable — frog DNA fill ${fill}%  ·  "life finds a way"`, this.x + this.w / 2, this.y + this.h - 19, SANS(12), P.titleText, "center");
  },

  rec(ctx) {
    const rng = mulberry32(hashStr(this.file.name));
    // photo inset with silhouette
    const px = this.x + 16, py = this.y + 40, pw = 84, ph = 96;
    insetBox(ctx, px, py, pw, ph, "#7c8496");
    ctx.fillStyle = "#3a4152";
    ctx.beginPath(); ctx.arc(px + pw / 2, py + 38, 20, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(px + pw / 2, py + 86, 30, 26, 0, Math.PI, 0); ctx.fill();
    const who = this.file.name.replace(/\.rec$/, "");
    const nice = who.replace(/_(\w)$/, " $1.").replace(/_/g, " ").toUpperCase();
    const clear = ["A", "B", "C", "D"][Math.floor(rng() * 4)];
    const rows = [
      ["NAME", nice],
      ["ID", "JP-" + String(1000 + Math.floor(rng() * 9000))],
      ["CLEARANCE", "LEVEL " + clear],
      ["SECTOR", ["VISITORS", "LAB", "CONTROL", "FIELD"][Math.floor(rng() * 4)]],
      ["STATUS", who.startsWith("nedry") ? "REVOKED" : "ACTIVE"],
    ];
    let yy = 56;
    for (const [k, v] of rows) {
      text(ctx, k, px + pw + 16, this.y + yy, SANSB(11), P.faceDim === P.face ? "#555" : "#59647c");
      text(ctx, v, px + pw + 16, this.y + yy + 14, MONOB(12), k === "STATUS" && v === "REVOKED" ? P.red : P.ink);
      yy += 32;
    }
    insetBox(ctx, this.x + 12, this.y + this.h - 34, this.w - 24, 22, P.statusBg);
    text(ctx, who.startsWith("nedry") ? "ACCESS REVOKED — CONTACT MR. ARNOLD" : "INGEN PERSONNEL FILE",
      this.x + this.w / 2, this.y + this.h - 19, HEAVYI(12), P.titleText, "center");
  },

  // VEHICLE-style module runner (the movie panel, generalized)
  exec(ctx) { drawVehiclePanel.call(this, ctx, (this.state.status || this.file.name.toUpperCase() + " — READY"), false); },
  reboot(ctx) { drawVehiclePanel.call(this, ctx, this.state.status || "REBOOTING SYSTEM...", true); },

  magic(ctx, t) {
    insetBox(ctx, this.x + 10, this.y + 33, this.w - 20, this.h - 46, "#101015");
    text(ctx, "ACCESS VIOLATION", this.x + this.w / 2, this.y + 56, HEAVYI(15), P.red, "center");
    let yy = 80;
    for (let i = 0; i < 8; i++) {
      text(ctx, "YOU DIDN'T SAY THE MAGIC WORD!", this.x + this.w / 2, this.y + yy, MONOB(12),
        i % 2 ? "#e05a4a" : "#f0b0a0", "center");
      yy += 17;
    }
    if (Math.floor(t * 1.5) % 2) text(ctx, "ah ah ah!", this.x + this.w / 2, this.y + yy + 8, HEAVYI(13), "#fff", "center");
  },

  txt(ctx) {
    insetBox(ctx, this.x + 10, this.y + 33, this.w - 20, this.h - 46, P.paper);
    const lines = TXT_BODIES[this.file.name] || [
      "PROPERTY OF INGEN CORPORATION",
      "Isla Nublar site B-0",
      "",
      "Unauthorized access will be",
      "prosecuted. Spared no expense.",
    ];
    let yy = 56;
    for (const l of lines) { text(ctx, l, this.x + 22, this.y + yy, MONO(12), P.ink); yy += 17; }
  },
};

function drawVehiclePanel(ctx, statusText, withGlitches) {
  // tab row
  let tx = 14;
  for (const tab of ["TOUR", "POWER", "TIME"]) {
    this.button(ctx, tab, tx, 32, 74, 20, () => { this.state.tab = tab; },
      { pressed: this.state.tab === tab, face: this.state.tab === tab ? P.faceDim : P.face });
    tx += 78;
  }
  // gray inset with logo + status box
  const ix = this.x + 12, iy = this.y + 58, iw = this.w - 24, ih = withGlitches ? 128 : 130;
  insetBox(ctx, ix, iy, iw, ih, P.faceDim);
  drawLogo(ctx, ix + iw / 2 - 18, iy + 12, 36);
  bevel(ctx, ix + 10, iy + 64, iw - 20, 46, true, P.statusBg);
  ctx.strokeStyle = "#222"; ctx.strokeRect(ix + 12, iy + 66, iw - 24, 42);
  text(ctx, statusText, this.x + this.w / 2, iy + 86, HEAVYI(14), P.titleText, "center");
  text(ctx, "VOLUME --- NEDRYLAND JP", this.x + this.w / 2, iy + 102, SANSB(11), P.titleText, "center");
  // transport
  const by = 58 + ih + 8;
  this.button(ctx, "HOLD", 14, by, 82, 22, () => { this.state.status = "ON HOLD"; });
  this.button(ctx, "QUIT", 100, by, 82, 22, () => { this.state.status = "STOPPED"; });
  this.button(ctx, "NEW", 186, by, 82, 22, () => { this.state.status = "NEW TASK..."; });
  this.button(ctx, "NEXT", 14, by + 26, 82, 22, () => {});
  this.button(ctx, "◀◀", 100, by + 26, 40, 22, () => {});
  this.button(ctx, "▶▶", 142, by + 26, 40, 22, () => {});
  this.button(ctx, "▶", 186, by + 26, 40, 22, () => {
    this.state.status = withGlitches ? "BOOT SUCCESSFUL — CLEAR" : "RUNNING...";
  }, { color: P.green });
  this.button(ctx, "■", 228, by + 26, 40, 22, () => { this.state.status = "STOPPED"; });
  if (withGlitches) {
    const gy = by + 56;
    text(ctx, "GLITCHES", this.x + 16, this.y + gy + 14, SANSB(12), P.titleText);
    let tx2 = 96;
    for (const tab of ["MAPS", "SYSTEM", "EMERG."]) { this.button(ctx, tab, tx2, gy, 62, 18, () => {}); tx2 += 66; }
    const items = ["Ldg - Volume - JP", "Boot Successful - CLEAR", "Format Gabber - Chaires"];
    let ly = gy + 26;
    for (const it of items) {
      bevel(ctx, this.x + 16, this.y + ly, 52, 16, true, "#79b586");
      text(ctx, "CLEAR", this.x + 42, this.y + ly + 12, SANSB(11), "#0e2916", "center");
      text(ctx, "- " + it, this.x + 76, this.y + ly + 13, SANSB(11), P.titleText);
      ly += 20;
    }
  }
}

const TXT_BODIES = {
  "spared_no_expense.txt": [
    '"I don\'t blame people for their',
    ' mistakes. But I do ask that',
    ' they pay for them."',
    "",
    "            — John Hammond",
    "",
    "We spared no expense.",
  ],
  "readme.txt": [
    "WELCOME TO JURASSIC PARK",
    "",
    "This terminal runs the park's",
    "central UNIX system.",
    "Hey, it's a UNIX system.",
    "You know this.",
  ],
  "objects_in_mirror.txt": [
    "OBJECTS IN MIRROR ARE",
    "CLOSER THAN THEY APPEAR.",
  ],
};

// ---------- kind resolution ----------
export function kindFor(file) {
  if (file.kind === "session") return "session";
  const n = file.name;
  if (n === "reboot.sys") return "reboot";
  if (n === "whte_rbt.obj" || n === "nedry_backdoor.tmp") return "magic";
  if (/\.(rec)$/.test(n)) return "rec";
  if (/\.(gen)$/.test(n)) return "gen";
  if (/\.(avi)$/.test(n)) return "avi";
  if (/\.(log)$/.test(n)) return "log";
  if (/\.(db)$/.test(n)) return "db";
  if (/\.(cfg|rc|sta)$/.test(n)) return "control";
  if (/map|grid|route|gps|\.rte$/.test(n)) return "map";
  if (/\.(txt|lic|mnu)$/.test(n)) return "txt";
  if (/\.(exe|sh|bin|obj|mid|sys|tmp|rel|dat)$/.test(n)) return "exec";
  return "txt";
}

const SIZES = {
  session: [400, 296],
  map: [340, 330], control: [320, 250], log: [360, 240], db: [330, 230],
  avi: [330, 270], gen: [360, 250], rec: [320, 200], exec: [288, 260],
  reboot: [288, 330], magic: [320, 240], txt: [300, 180],
};

// ---------- manager ----------
export class WinManager {
  constructor() {
    this.wins = [];
    this.drag = null;   // { win, dx, dy }
    this.cascade = 0;
  }
  openFile(file, dirNode, path) {
    const kind = kindFor(file);
    const [w, h] = SIZES[kind];
    const x = 70 + (this.cascade % 6) * 36, y = 54 + (this.cascade % 6) * 30;
    this.cascade++;
    const win = new JPWin(kind, file, dirNode, path, x, y, w, h);
    this.wins.push(win);
    return win;
  }
  close(win) { this.wins = this.wins.filter((w) => w !== win); }
  closeTop() { if (this.wins.length) this.wins.pop(); }
  top(px, py) {
    for (let i = this.wins.length - 1; i >= 0; i--) if (this.wins[i].contains(px, py)) return this.wins[i];
    return null;
  }
  raise(win) { this.wins = this.wins.filter((w) => w !== win); this.wins.push(win); }
  down(px, py) {
    const w = this.top(px, py);
    if (!w) return false;
    this.raise(w);
    if (w.inTitle(px, py) && !(px > w.x + w.w - 26)) this.drag = { win: w, dx: px - w.x, dy: py - w.y };
    this.pending = { win: w, px, py };
    return true;
  }
  move(px, py) {
    if (!this.drag) return false;
    this.drag.win.x = px - this.drag.dx;
    this.drag.win.y = py - this.drag.dy;
    this.pending = null;
    return true;
  }
  up(px, py) {
    const was = this.drag; this.drag = null;
    if (this.pending && this.pending.win.contains(px, py)) {
      this.pending.win.click(px, py);
      this.pending = null;
      return true;
    }
    this.pending = null;
    return !!was;
  }
  draw(ctx, t) { for (const w of this.wins) w.draw(ctx, t, this); }
}
