// ============================================================
// "It's a UNIX system! I know this!"
// fsn (SGI IRIX File System Navigator) replica — Jurassic Park
// ============================================================
import * as THREE from "three";
import { FS_ROOT } from "./data.js";
import GUI from "lil-gui";
import { WinManager } from "./windows.js?v=41";

// ---------------- palette (sampled from movie stills) ----------------
const COL = {
  platform:     0xd98c82,   // salmon pedestal (movie still: light pink-salmon)
  platformSide: 0xb56a60,
  fileBox:      0xa9bfe6,   // periwinkle file box
  fileBoxExec:  0x8fbf7a,   // green-ish executables
  wire:         0x9fe8d8,   // cyan wires
  groundLine:   0x8fe0cc,
  dirLabel:     "#82ecc4",  // mint-teal text on black ground (movie: "Zoology")
  fileLabel:    "#2b2624",  // dark gray text on the pedestal (movie: "personnel 19")
  wireLabel:    "#c8f2dc",  // mint text near wires (movie: "Physical Security")
  spotlight:    0xf5ecc9,
  beam:         0xffffff,
};

const RENDER_FPS = 12;           // movie-accurate chug
const CELL = 3.2;                // grid cell for file boxes
const DEPTH_GAP = 60;            // z distance between tree levels
const SIBLING_GAP = 9;

// ---------------- renderer / scene / camera ----------------
const canvas = document.getElementById("scene");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
renderer.setPixelRatio(1); // chunky pixels, CRT vibe
renderer.setSize(window.innerWidth, window.innerHeight);

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x000000, 0.0014);

const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.5, 4000);

// lighting: bright top, dimmer sides (flat Lambert look)
scene.add(new THREE.HemisphereLight(0xffffff, 0x887066, 1.9));
const sun = new THREE.DirectionalLight(0xfff4ee, 1.0);
sun.position.set(20, 100, 80);
scene.add(sun);

// ---------------- sky: green glow band over black ----------------
{
  const skyGeo = new THREE.SphereGeometry(2500, 24, 24);
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {},
    vertexShader: `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      varying vec3 vDir;
      void main() {
        float h = vDir.y;                       // -1..1 elevation
        vec3 black = vec3(0.0);
        vec3 green = vec3(0.14, 0.36, 0.18);
        vec3 c = black;
        if (h > 0.0) {
          // dark just above horizon, thin green band, fade to black higher up
          float band = smoothstep(0.015, 0.10, h) * (1.0 - smoothstep(0.10, 0.42, h) * 0.95);
          c = mix(black, green, band);
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  scene.add(new THREE.Mesh(skyGeo, skyMat));
}

// ---------------- ground: black + long cyan lines ----------------
{
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(6000, 6000),
    new THREE.MeshBasicMaterial({ color: 0x000000 })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.2;
  scene.add(ground);

  // long horizontal "street" lines like the wide shots
  const pts = [];
  let z = 140;
  const rng = mulberry32(1993);
  for (let i = 0; i < 34; i++) {
    pts.push(-3000, 0.02, z, 3000, 0.02, z);
    z -= 18 + rng() * 65;
  }
  // a few diagonals
  for (let i = 0; i < 5; i++) {
    const z0 = 120 - i * 160, z1 = z0 - 900;
    pts.push(-2200, 0.02, z0, 2600, 0.02, z1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  const lines = new THREE.LineSegments(
    geo,
    new THREE.LineBasicMaterial({ color: COL.groundLine, transparent: true, opacity: 0.55 })
  );
  scene.add(lines);
}

// ---------------- deterministic rng ----------------
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- text label helper (thin stroke font, italic) ----------------
function makeGroundLabel(text, cssColor, worldHeight, opts = {}) {
  const fontPx = 64;
  const cnv = document.createElement("canvas");
  const ctx = cnv.getContext("2d");
  ctx.font = `italic ${fontPx}px "Courier New", monospace`;
  const w = Math.ceil(ctx.measureText(text).width) + 24;
  cnv.width = Math.max(2, w);
  cnv.height = fontPx + 28;
  const c2 = cnv.getContext("2d");
  c2.font = `italic ${fontPx}px "Courier New", monospace`;
  c2.strokeStyle = cssColor;
  c2.lineWidth = opts.bold ? 3.5 : 2.2;
  if (opts.solid) {
    c2.fillStyle = cssColor;
    c2.fillText(text, 12, fontPx + 4);
    c2.strokeText(text, 12, fontPx + 4);
  } else {
    c2.strokeText(text, 12, fontPx + 4);
  }
  const tex = new THREE.CanvasTexture(cnv);
  tex.minFilter = THREE.LinearFilter;
  const aspect = cnv.width / cnv.height;
  let wdt = worldHeight * aspect;
  let hgt = worldHeight;
  if (opts.maxWidth && wdt > opts.maxWidth) {
    const k = opts.maxWidth / wdt;
    wdt = opts.maxWidth;
    hgt *= k;
  }
  const mat = new THREE.MeshBasicMaterial({
    map: tex, transparent: true, depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(wdt, hgt), mat);
  mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

// ---------------- filesystem layout ----------------
// Each dir -> pedestal w/ file boxes; children pedestals one level deeper (-Z),
// spread on X, connected by cyan wires.

const pickables = [];        // meshes for raycast
const dirAnchors = [];       // { node, position, platW, platD } for fly-to
let PATH_BY_NODE = new Map();

const platGeoCache = new Map();

function fileGrid(n) {
  const cols = Math.max(1, Math.ceil(Math.sqrt(n * 1.7)));
  const rows = Math.max(1, Math.ceil(n / cols));
  return { cols, rows };
}

function platformSize(node) {
  // a dir with no files is a pure hub node — tiny pedestal, like the movie's "park"
  if (!node.files.length) return { w: 6.5, d: 5.5, cols: 1, rows: 1 };
  const n = Math.max(node.files.length, 1);
  const { cols, rows } = fileGrid(n);
  return { w: cols * CELL + 4.5, d: rows * CELL + 6.5, cols, rows };
}

// recursive subtree width for layout
function subtreeWidth(node) {
  const own = platformSize(node).w + SIBLING_GAP;
  if (!node.dirs.length) return own;
  let sum = 0;
  for (const d of node.dirs) sum += subtreeWidth(d);
  return Math.max(own, sum);
}

const fileBoxGeo = new THREE.BoxGeometry(1, 1, 1);
fileBoxGeo.translate(0, 0.5, 0); // origin at base

const fileMat = new THREE.MeshLambertMaterial({ color: COL.fileBox });
const fileMatExec = new THREE.MeshLambertMaterial({ color: COL.fileBoxExec });
const platTopMat = new THREE.MeshLambertMaterial({ color: COL.platform });
const platSideMat = new THREE.MeshLambertMaterial({ color: COL.platformSide });
const wireMat = new THREE.LineBasicMaterial({ color: COL.wire, transparent: true, opacity: 0.9 });

function buildDir(node, cx, cz, parentAnchor, path) {
  const { w, d, cols } = platformSize(node);
  const PLAT_H = 1.1;
  const group = new THREE.Group();
  group.position.set(cx, 0, cz);
  scene.add(group);

  const fullPath = path + "/" + node.name;
  PATH_BY_NODE.set(node, fullPath);

  // pedestal (salmon slab, sides slightly darker)
  const plat = new THREE.Mesh(
    new THREE.BoxGeometry(w, PLAT_H, d),
    [platSideMat, platSideMat, platTopMat, platSideMat, platSideMat, platSideMat]
  );
  plat.position.y = PLAT_H / 2;
  plat.userData = { type: "dir", node };
  group.add(plat);
  pickables.push(plat);

  const anchor = {
    node,
    position: new THREE.Vector3(cx, 0, cz),
    platW: w, platD: d,
  };
  dirAnchors.push(anchor);

  // dir name on the black ground in front of the pedestal (clickable)
  const dirName = node.name.length > 18 ? node.name.slice(0, 17) + "\u2026" : node.name;
  const dirLabel = makeGroundLabel(dirName.replace(/_/g, " "), COL.dirLabel, 3.4, { bold: true, maxWidth: Math.max(w * 0.95, 12) });
  dirLabel.position.set(cx - w * 0.15, 0.03, cz + d / 2 + 3.6);
  dirLabel.userData = { type: "dir", node };
  scene.add(dirLabel);
  pickables.push(dirLabel);

  // file boxes on top, back rows first
  const rng = mulberry32(hashStr(node.name));
  node.files.forEach((file, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const fx = (col - (cols - 1) / 2) * CELL;
    const fz = -d / 2 + 4.2 + row * CELL;
    const h = 0.35 + Math.min(1.9, Math.log2(1 + file.size / 200) * 0.55);
    const bw = 2.1, bd = 1.7;
    const mesh = new THREE.Mesh(fileBoxGeo, file.kind === "exec" ? fileMatExec : fileMat);
    mesh.scale.set(bw, h, bd);
    mesh.position.set(fx, PLAT_H, fz);
    mesh.userData = { type: "file", node: file, dirNode: node, platH: PLAT_H };
    group.add(mesh);
    pickables.push(mesh);

    // small file label on the pedestal surface in front of the box (clickable, clamped to cell)
    if (w < 70) { // skip when absurdly dense
      const shown = file.name.length > 13 ? file.name.slice(0, 12) + "…" : file.name;
      const lbl = makeGroundLabel(shown, COL.fileLabel, 0.74, { maxWidth: CELL - 0.15, solid: true });
      lbl.position.set(fx, PLAT_H + 0.02, fz + bd / 2 + 0.62);
      lbl.userData = { type: "file", node: file, dirNode: node, platH: PLAT_H, boxMesh: mesh };
      group.add(lbl);
      pickables.push(lbl);
    }
  });

  // children
  if (node.dirs.length) {
    const widths = node.dirs.map(subtreeWidth);
    const total = widths.reduce((a, b) => a + b, 0);
    let x = cx - total / 2;
    node.dirs.forEach((child, i) => {
      const childCx = x + widths[i] / 2;
      const childCz = cz - DEPTH_GAP;
      x += widths[i];
      const childAnchor = buildDir(child, childCx, childCz, anchor, fullPath);

      // wire: from top of parent pedestal to child pedestal front edge
      const p0 = new THREE.Vector3(cx, PLAT_H + 0.4, cz - d / 2);
      const p2 = new THREE.Vector3(childCx, PLAT_H + 0.4, childCz + childAnchor.platD / 2);
      const p1 = new THREE.Vector3((p0.x + p2.x) / 2, 2.2, (p0.z + p2.z) / 2);
      const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
      const wire = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(curve.getPoints(24)),
        wireMat
      );
      scene.add(wire);

      // cyan wire label midway, rotated to run along the wire (movie: "Personnel")
      const mid = curve.getPoint(0.8); // near the child so sibling labels fan apart
      const wireName = child.name.length > 16 ? child.name.slice(0, 15) + "\u2026" : child.name;
      const wl = makeGroundLabel(wireName.replace(/_/g, " "), COL.wireLabel, 2.2);
      const wdx = p2.x - p0.x, wdz = p2.z - p0.z;
      wl.rotation.z = Math.atan2(-wdz, wdx); // read along the wire, toward the child
      wl.position.set(mid.x + 1, 0.04, mid.z + 2);
      wl.userData = { type: "dir", node: child };
      scene.add(wl);
      pickables.push(wl);
    });
  }
  return anchor;
}

function hashStr(s) {
  let h = 1993;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

// build: root at z=0, tree grows toward -Z
// tree is built async in boot() below — sessions.json from serve.py,
// falling back to the demo FS_ROOT when the server isn't running.

// ---------------- selection spotlight + beam ----------------
const spotDisc = new THREE.Mesh(
  new THREE.CircleGeometry(1, 40),
  new THREE.MeshBasicMaterial({ color: 0xf0dca0, transparent: true, opacity: 0.42, depthWrite: false })
);
spotDisc.rotation.x = -Math.PI / 2;
spotDisc.visible = false;
scene.add(spotDisc);

// light column: faint fill + visible edge lines, like the Visitors Center shot
const beam = new THREE.Group();
const beamGeo = new THREE.BoxGeometry(1, 120, 1);
beam.add(new THREE.Mesh(
  beamGeo,
  new THREE.MeshBasicMaterial({
    color: 0xfff2dc, transparent: true, opacity: 0.055,
    depthWrite: false, side: THREE.DoubleSide,
  })
));
beam.add(new THREE.LineSegments(
  new THREE.EdgesGeometry(beamGeo),
  new THREE.LineBasicMaterial({ color: 0xf5e6c8, transparent: true, opacity: 0.5, depthWrite: false })
));
beam.visible = false;
scene.add(beam);

let selected = null;

function selectFile(mesh) {
  mesh = mesh.userData.boxMesh || mesh; // label clicks resolve to their box
  selected = mesh;
  const wp = new THREE.Vector3();
  mesh.getWorldPosition(wp);
  const platY = mesh.userData.platH;
  spotDisc.position.set(wp.x, wp.y + 0.03, wp.z + 0.3);
  spotDisc.scale.set(2.6, 2.0, 1);
  spotDisc.visible = true;
  beam.position.set(wp.x, wp.y + 60, wp.z);
  beam.scale.set(2.4, 1, 2.1);
  beam.visible = true;
}

function clearSelection() {
  selected = null;
  spotDisc.visible = false;
  beam.visible = false;
}

// ---------------- camera nav ----------------
const nav = {
  pos: new THREE.Vector3(0, 16, 62),
  yaw: 0,             // radians, 0 = looking toward -Z
  pitch: -0.22,
  speed: 26,          // units/sec
};
let flyAnim = null;    // { fromPos, toPos, fromYaw, toYaw, fromPitch, toPitch, t, dur }

function applyCamera() {
  camera.position.copy(nav.pos);
  camera.rotation.set(0, 0, 0);
  camera.rotateY(nav.yaw);
  camera.rotateX(nav.pitch);
}

function flyToDir(anchor) {
  const dist = Math.max(anchor.platD * 1.15, 26);
  const toPos = new THREE.Vector3(
    anchor.position.x,
    10 + anchor.platW * 0.06,
    anchor.position.z + anchor.platD / 2 + dist
  );
  flyAnim = {
    fromPos: nav.pos.clone(), toPos,
    fromYaw: nav.yaw, toYaw: 0,
    fromPitch: nav.pitch, toPitch: -0.24,
    t: 0, dur: 1.9,
  };
  setPath(PATH_BY_NODE.get(anchor.node) || "/");
}

// swoop down onto a file box, movie style
function flyToFile(mesh) {
  mesh = mesh.userData.boxMesh || mesh;
  const wp = new THREE.Vector3();
  mesh.getWorldPosition(wp);
  const h = mesh.scale.y;
  flyAnim = {
    fromPos: nav.pos.clone(),
    toPos: new THREE.Vector3(wp.x, wp.y + h + 4.5, wp.z + 9),
    fromYaw: nav.yaw, toYaw: 0,
    fromPitch: nav.pitch, toPitch: -0.52,
    t: 0, dur: 1.6,
  };
  const dirPath = PATH_BY_NODE.get(mesh.userData.dirNode) || "";
  setPath(dirPath + "/" + mesh.userData.node.name);
}

function setPath(p) { uiPath = p; }

// keyboard
const keys = {};
window.addEventListener("keydown", (e) => {
  if (e.target.closest && e.target.closest(".win98")) return;
  keys[e.code] = true;
  if (e.code === "Enter" && selected) openFileWindow(selected.userData);
  if (e.code === "Escape") {
    if (wm.wins.length) wm.closeTop();
    else clearSelection();
  }
});
window.addEventListener("keyup", (e) => (keys[e.code] = false));

// mouse: drag look + click pick
const raycaster = new THREE.Raycaster();
const mouseNDC = new THREE.Vector2();
// ---- multi-pointer input: each pointer gets a role ----
//   "ui"   -> grabbed by an in-tube window (drag/click it)
//   "joy"  -> virtual joystick (touch move control)
//   "look" -> free look; a short tap picks
const pointers = new Map();
const IS_COARSE = window.matchMedia("(pointer: coarse)").matches;
const joy = { active: false, dx: 0, dy: 0, R: 54 };
function joyCenter() {
  return { x: 96, y: window.innerHeight - 110 };
}

canvas.addEventListener("pointerdown", (e) => {
  const x = e.clientX, y = e.clientY;
  if (wm.down(x, y)) { pointers.set(e.pointerId, { role: "ui" }); return; }
  if (IS_COARSE && e.pointerType === "touch") {
    const c = joyCenter();
    if (Math.hypot(x - c.x, y - c.y) < joy.R * 1.8) {
      pointers.set(e.pointerId, { role: "joy" });
      joy.active = true; joy.dx = 0; joy.dy = 0;
      return;
    }
  }
  pointers.set(e.pointerId, { role: "look", lastX: x, lastY: y, moved: 0 });
});

window.addEventListener("pointermove", (e) => {
  const pt = pointers.get(e.pointerId);
  if (!pt) return;
  if (pt.role === "ui") { wm.move(e.clientX, e.clientY); return; }
  if (pt.role === "joy") {
    const c = joyCenter();
    joy.dx = THREE.MathUtils.clamp((e.clientX - c.x) / joy.R, -1, 1);
    joy.dy = THREE.MathUtils.clamp((e.clientY - c.y) / joy.R, -1, 1);
    return;
  }
  const dx = e.clientX - pt.lastX, dy = e.clientY - pt.lastY;
  pt.moved += Math.abs(dx) + Math.abs(dy);
  pt.lastX = e.clientX; pt.lastY = e.clientY;
  nav.yaw -= dx * 0.0035;
  nav.pitch = THREE.MathUtils.clamp(nav.pitch - dy * 0.0030, -1.2, 0.5);
  flyAnim = null;
});

let lastTap = { t: 0, x: 0, y: 0 };
function endPointer(e) {
  const pt = pointers.get(e.pointerId);
  if (!pt) return;
  pointers.delete(e.pointerId);
  if (pt.role === "ui") { wm.up(e.clientX, e.clientY); return; }
  if (pt.role === "joy") { joy.active = false; joy.dx = 0; joy.dy = 0; return; }
  if (e.type === "pointerup" && pt.moved <= 6) {
    // browsers don't synthesize dblclick from touch here, so detect double-tap ourselves
    const now = performance.now();
    const isDouble = e.pointerType === "touch"
      && now - lastTap.t < 400
      && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 36;
    lastTap = { t: isDouble ? 0 : now, x: e.clientX, y: e.clientY };
    pick(e.clientX, e.clientY, isDouble);
  }
}
window.addEventListener("pointerup", endPointer);
window.addEventListener("pointercancel", endPointer);

canvas.addEventListener("dblclick", (e) => {
  if (wm.top(e.clientX, e.clientY)) return;
  pick(e.clientX, e.clientY, true);
});

// keep iOS from pinch/double-tap zooming the page
document.addEventListener("gesturestart", (e) => e.preventDefault());
document.addEventListener("gesturechange", (e) => e.preventDefault());
document.addEventListener("touchmove", (e) => {
  if (e.scale !== undefined && e.scale !== 1) e.preventDefault();
}, { passive: false });

// wheel / trackpad scroll = dolly zoom along the view direction
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const fwd = new THREE.Vector3(
    -Math.sin(nav.yaw) * Math.cos(nav.pitch),
    Math.sin(nav.pitch),
    -Math.cos(nav.yaw) * Math.cos(nav.pitch)
  );
  nav.pos.addScaledVector(fwd, -e.deltaY * 0.06);
  nav.pos.y = Math.max(2.2, nav.pos.y);
  flyAnim = null;
}, { passive: false });

function pick(px, py, isDouble) {
  mouseNDC.set((px / window.innerWidth) * 2 - 1, -(py / window.innerHeight) * 2 + 1);
  raycaster.setFromCamera(mouseNDC, camera);
  const hits = raycaster.intersectObjects(pickables, false);
  if (!hits.length) { if (!isDouble) clearSelection(); return; }
  const obj = hits[0].object;
  if (obj.userData.type === "file") {
    selectFile(obj);
    if (isDouble) openFileWindow(obj.userData);
    else flyToFile(obj);
  } else if (obj.userData.type === "dir") {
    const anchor = dirAnchors.find((a) => a.node === obj.userData.node);
    if (anchor) flyToDir(anchor);
  }
}

// ---------------- movement step ----------------
function stepNav(dt) {
  if (flyAnim) {
    flyAnim.t += dt;
    const k = Math.min(1, flyAnim.t / flyAnim.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; // easeInOutQuad
    nav.pos.lerpVectors(flyAnim.fromPos, flyAnim.toPos, e);
    nav.yaw = THREE.MathUtils.lerp(flyAnim.fromYaw, flyAnim.toYaw, e);
    nav.pitch = THREE.MathUtils.lerp(flyAnim.fromPitch, flyAnim.toPitch, e);
    if (k >= 1) flyAnim = null;
    return;
  }
  const sp = nav.speed * (keys["ShiftLeft"] || keys["ShiftRight"] ? 3 : 1) * dt;
  const fwd = new THREE.Vector3(-Math.sin(nav.yaw), 0, -Math.cos(nav.yaw));
  const right = new THREE.Vector3(-fwd.z, 0, fwd.x);
  if (keys["KeyW"] || keys["ArrowUp"]) nav.pos.addScaledVector(fwd, sp);
  if (keys["KeyS"] || keys["ArrowDown"]) nav.pos.addScaledVector(fwd, -sp);
  if (keys["KeyA"]) nav.pos.addScaledVector(right, -sp);
  if (keys["KeyD"]) nav.pos.addScaledVector(right, sp);
  if (keys["ArrowLeft"]) nav.yaw += 1.4 * dt;
  if (keys["ArrowRight"]) nav.yaw -= 1.4 * dt;
  if (keys["KeyR"] || keys["KeyQ"]) nav.pos.y += sp;
  if (keys["KeyF"] || keys["KeyE"]) nav.pos.y -= sp;
  // virtual joystick (touch): up = forward, sideways = strafe
  if (joy.active) {
    nav.pos.addScaledVector(fwd, -joy.dy * nav.speed * dt * 1.5);
    nav.pos.addScaledVector(right, joy.dx * nav.speed * dt * 1.2);
  }
  nav.pos.y = Math.max(2.2, nav.pos.y);
}

// ---------------- file windows (drawn in-tube, see windows.js) ----------------
function openFileWindow(ud) {
  const file = ud.node, dirNode = ud.dirNode;
  wm.openFile(file, dirNode, (PATH_BY_NODE.get(dirNode) || "") + "/" + file.name);
}

// ============================================================
// Post FX — ported from livecoder (packages/core/src/codegen/plan.ts):
// ntsc() composite signal decode + tube() physical CRT.
// Chain: scene -> half-res nearest -> NTSC decode -> (blur halo) -> TUBE -> screen
// ============================================================
const POST_VERT = `
void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const ANALOG_HELPERS = `
const float TAU = 6.28318530718;
float _hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}
vec3 _rgb2yiq(vec3 c) {
  return vec3(
    dot(c, vec3(0.299, 0.587, 0.114)),
    dot(c, vec3(0.5959, -0.2746, -0.3213)),
    dot(c, vec3(0.2115, -0.5227, 0.3112)));
}
vec3 _yiq2rgb(vec3 c) {
  return vec3(
    c.x + 0.956 * c.y + 0.619 * c.z,
    c.x - 0.272 * c.y - 0.647 * c.z,
    c.x - 1.106 * c.y + 1.703 * c.z);
}
`;

// Composite NTSC round trip (livecoder NTSC_FRAG, verbatim semantics)
const NTSC_FRAG = `
precision highp float;
uniform sampler2D uInput;
uniform vec2 resolution;
uniform float time;
uniform float uBleed;
uniform float uFringe;
uniform float uJitter;
uniform float uCrawl;
uniform float uNoise;
uniform float uPull;
uniform float uTear;
uniform float uStandard;
uniform float uSat;
uniform float uMix;

const int TAPS = 12;
${ANALOG_HELPERS}
void main() {
  vec2 st = gl_FragCoord.xy / resolution;
  float line = floor(st.y * resolution.y * 0.5);
  float frame = floor(time * 60.0);

  float slip = (_hash(vec2(line, frame)) - 0.5) * 0.012
             + sin(line * 0.31 + time * 9.0) * 0.002;
  float x = st.x + slip * uJitter;

  float pulled = 0.0;
  for (int j = 1; j <= 4; j++) {
    float back = float(j * j) * 3.0 / resolution.x;
    vec3 prior = texture2D(uInput, vec2(x - back, st.y)).rgb;
    pulled += dot(prior, vec3(0.299, 0.587, 0.114)) * (1.0 - float(j) * 0.2);
  }
  x += pulled * uPull * 0.012;

  float band = 1.0 - smoothstep(0.018, 0.055, st.y);
  x += band * band * uTear * (0.05 + 0.08 * (_hash(vec2(frame, line)) - 0.5));
  float lineNoise = uNoise + band * uTear * 0.8;

  float pal = step(0.5, uStandard);
  float cycles = resolution.x * (0.25 + 0.035 * pal);
  float linePhase = mix(3.14159265 * floor(line * 0.5), 1.57079633 * line, pal);
  float phase0 = TAU * cycles * x + linePhase + time * 4.0 * uCrawl;
  float vSwitch = mix(1.0, 1.0 - 2.0 * mod(line, 2.0), pal);
  float hanover = pal * 0.55 * vSwitch;

  float spacing = 1.0 / (4.0 * cycles);
  float sigmaC = 5.0 * max(uBleed, 0.05);

  float ySum = 0.0;
  float yW = 0.0;
  float iSum = 0.0;
  float qSum = 0.0;
  float cW = 0.0;

  for (int k = -TAPS; k <= TAPS; k++) {
    float fk = float(k);
    float xk = x + fk * spacing;
    vec3 yiq = _rgb2yiq(texture2D(uInput, vec2(xk, st.y)).rgb);
    float ph = phase0 + fk * (TAU * 0.25);
    float sig = yiq.x + yiq.y * sin(ph) + vSwitch * yiq.z * cos(ph);
    sig += (_hash(vec2(xk * 653.0, line + frame * 91.0)) - 0.5) * lineNoise;

    float wy = exp(-fk * fk / 1.5);
    ySum += sig * wy;
    yW += wy;

    float ck = fk + 3.0;
    float wc = exp(-ck * ck / (2.0 * sigmaC * sigmaC));
    float demodIn = (sig - yiq.x) + yiq.x * uFringe;
    iSum += demodIn * 2.0 * sin(ph) * wc;
    qSum += demodIn * 2.0 * cos(ph) * wc * vSwitch;
    cW += wc;
  }

  float iOut = 1.4 * uSat * iSum / cW;
  float qOut = 1.4 * uSat * qSum / cW;
  float hc = cos(hanover);
  float hs = sin(hanover);
  vec3 rgb = _yiq2rgb(vec3(ySum / yW, iOut * hc - qOut * hs, iOut * hs + qOut * hc));
  float blank = step(0.018, st.y) * step(st.y, 0.982);
  vec4 dry = texture2D(uInput, vec2(x, st.y));
  gl_FragColor = vec4(mix(dry.rgb, rgb, uMix) * blank, dry.a);
}
`;

// Physical CRT (livecoder TUBE_FRAG, verbatim semantics)
const TUBE_FRAG = `
precision highp float;
uniform sampler2D uInput;
uniform sampler2D uHalo;
uniform vec2 resolution;
uniform float uCurve;
uniform float uBeam;
uniform float uConverge;
uniform float uHaloAmt;
uniform float uMask;
uniform float uGain;

void main() {
  vec2 st = gl_FragCoord.xy / resolution;
  vec2 p = st * 2.0 - 1.0;
  float r2 = dot(p, p);
  vec2 q = (p * (1.0 + uCurve * r2)) * 0.5 + 0.5;

  float dx = (q.x - 0.5) * r2 * 0.012 * uConverge;

  float lines = resolution.y / 3.0;
  vec3 acc = vec3(0.0);
  for (int i = -1; i <= 1; i++) {
    float lineY = (floor(q.y * lines) + float(i) + 0.5) / lines;
    float dy = (q.y * lines) - (lineY * lines);
    vec3 c = vec3(
      texture2D(uInput, vec2(q.x - dx, lineY)).r,
      texture2D(uInput, vec2(q.x, lineY)).g,
      texture2D(uInput, vec2(q.x + dx, lineY)).b);
    float lum = dot(c, vec3(0.2126, 0.7152, 0.0722));
    float sigma = 0.22 + 0.6 * uBeam * lum;
    acc += c * exp(-dy * dy / (2.0 * sigma * sigma));
  }

  vec3 col = acc * uGain + texture2D(uHalo, q).rgb * uHaloAmt;

  float m = mod(floor(gl_FragCoord.x), 3.0);
  vec3 grille = m < 0.5
    ? vec3(1.0, 1.0 - uMask, 1.0 - uMask)
    : m < 1.5
      ? vec3(1.0 - uMask, 1.0, 1.0 - uMask)
      : vec3(1.0 - uMask, 1.0 - uMask, 1.0);
  col *= grille * (1.0 + uMask * 0.4);

  vec2 edge = smoothstep(0.0, 0.012, q) * (1.0 - smoothstep(0.988, 1.0, q));
  col *= edge.x * edge.y;
  col *= 1.0 - 0.3 * smoothstep(0.5, 1.6, r2);

  gl_FragColor = vec4(col, texture2D(uInput, q).a);
}
`;

// composite the 2D UI canvas INTO the pipeline, before NTSC — the whole
// interface lives inside the tube, like the movie's control app
const COMPOSE_FRAG = `
precision highp float;
uniform sampler2D uScene;
uniform sampler2D uUI;
uniform vec2 resolution;
void main() {
  vec2 st = gl_FragCoord.xy / resolution;
  vec4 s = texture2D(uScene, st);
  vec4 u = texture2D(uUI, st);
  gl_FragColor = vec4(mix(s.rgb, u.rgb, u.a), 1.0);
}
`;

const COPY_FRAG = `
precision highp float;
uniform sampler2D uInput;
uniform vec2 resolution;
void main() {
  gl_FragColor = texture2D(uInput, gl_FragCoord.xy / resolution);
}
`;

// separable gaussian for the tube halation source
const BLUR_FRAG = `
precision highp float;
uniform sampler2D uInput;
uniform vec2 resolution;
uniform vec2 uDir;
uniform float uRadius;
void main() {
  vec2 st = gl_FragCoord.xy / resolution;
  vec3 acc = vec3(0.0);
  float wSum = 0.0;
  for (int k = -6; k <= 6; k++) {
    float fk = float(k);
    float w = exp(-fk * fk / 9.0);
    vec2 off = uDir * (fk * uRadius / 6.0) / resolution;
    acc += texture2D(uInput, st + off).rgb * w;
    wSum += w;
  }
  gl_FragColor = vec4(acc / wSum, 1.0);
}
`;

const postScene = new THREE.Scene();
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const postQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
postQuad.frustumCulled = false;
postScene.add(postQuad);

function shaderPass(frag, uniforms) {
  return new THREE.ShaderMaterial({ vertexShader: POST_VERT, fragmentShader: frag, uniforms, depthTest: false, depthWrite: false });
}

const ntscMat = shaderPass(NTSC_FRAG, {
  uInput: { value: null }, resolution: { value: new THREE.Vector2() }, time: { value: 0 },
  uBleed: { value: 0.85 }, uFringe: { value: 0.2 }, uJitter: { value: 0.06 },
  uCrawl: { value: 0.4 }, uNoise: { value: 0.025 }, uPull: { value: 0.08 },
  uTear: { value: 0.05 }, uStandard: { value: 0 }, uSat: { value: 0.72 },
  uMix: { value: 0.55 },
});
const tubeMat = shaderPass(TUBE_FRAG, {
  uInput: { value: null }, uHalo: { value: null }, resolution: { value: new THREE.Vector2() },
  uCurve: { value: 0.03 }, uBeam: { value: 0.5 }, uConverge: { value: 0.22 },
  uHaloAmt: { value: 0.12 }, uMask: { value: 0.05 }, uGain: { value: 1.0 },
});
const copyMat = shaderPass(COPY_FRAG, { uInput: { value: null }, resolution: { value: new THREE.Vector2() } });
const composeMat = shaderPass(COMPOSE_FRAG, {
  uScene: { value: null }, uUI: { value: null }, resolution: { value: new THREE.Vector2() },
});
const blurMat = shaderPass(BLUR_FRAG, {
  uInput: { value: null }, resolution: { value: new THREE.Vector2() },
  uDir: { value: new THREE.Vector2(1, 0) }, uRadius: { value: 22 },
});

let rtScene, rtCompose, rtDecode, rtHaloA, rtHaloB;
function makeTargets() {
  const w = window.innerWidth, h = window.innerHeight;
  for (const rt of [rtScene, rtCompose, rtDecode, rtHaloA, rtHaloB]) rt && rt.dispose();
  rtScene = new THREE.WebGLRenderTarget(w, h, { depthBuffer: true });
  rtCompose = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
  rtDecode = new THREE.WebGLRenderTarget(w, h, { depthBuffer: false });
  rtHaloA = new THREE.WebGLRenderTarget(w >> 1, h >> 1, { depthBuffer: false });
  rtHaloB = new THREE.WebGLRenderTarget(w >> 1, h >> 1, { depthBuffer: false });
}
makeTargets();

// ---------------- in-tube UI layer (2D canvas -> texture) ----------------
const uiCanvas = document.createElement("canvas");
const uiCtx = uiCanvas.getContext("2d");
const uiTex = new THREE.CanvasTexture(uiCanvas);
uiTex.minFilter = THREE.LinearFilter;
const wm = new WinManager();
let uiPath = "/usr";
const HINT = "CLICK dir = fly · CLICK file = select · DBLCLICK/ENTER = open · WASD move · ←→ turn · R F up/down · SHIFT fast · rueda = zoom · drag = look · O tweaks";
function sizeUI() { uiCanvas.width = window.innerWidth; uiCanvas.height = window.innerHeight; }
sizeUI();

function drawUI(t) {
  const w = uiCanvas.width, h = uiCanvas.height;
  uiCtx.clearRect(0, 0, w, h);
  wm.draw(uiCtx, t);
  // path readout (in-tube, so the shader hits it too)
  uiCtx.font = 'italic bold 15px "Courier New", monospace';
  uiCtx.fillStyle = "#8ef0d0";
  uiCtx.textAlign = "left";
  uiCtx.fillText(uiPath, 14, 22);
  uiCtx.font = '10px "Courier New", monospace';
  uiCtx.fillStyle = "rgba(140,220,195,0.55)";
  uiCtx.textAlign = "center";
  uiCtx.fillText(HINT, w / 2, h - 8);
  uiCtx.textAlign = "left";
  // virtual joystick (touch devices)
  if (IS_COARSE) {
    const c = joyCenter();
    uiCtx.strokeStyle = "rgba(140,240,208,0.4)";
    uiCtx.lineWidth = 2;
    uiCtx.beginPath(); uiCtx.arc(c.x, c.y, joy.R, 0, Math.PI * 2); uiCtx.stroke();
    const kx = c.x + joy.dx * joy.R * 0.6, ky = c.y + joy.dy * joy.R * 0.6;
    uiCtx.fillStyle = joy.active ? "rgba(140,240,208,0.55)" : "rgba(140,240,208,0.28)";
    uiCtx.beginPath(); uiCtx.arc(kx, ky, joy.R * 0.42, 0, Math.PI * 2); uiCtx.fill();
  }
  uiTex.needsUpdate = true;
}

let postEnabled = true;
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyP" && !(e.target.closest && e.target.closest(".win98"))) postEnabled = !postEnabled;
});

function runPass(mat, target) {
  postQuad.material = mat;
  const size = target
    ? new THREE.Vector2(target.width, target.height)
    : new THREE.Vector2(window.innerWidth, window.innerHeight);
  if (mat.uniforms.resolution) mat.uniforms.resolution.value.copy(size);
  renderer.setRenderTarget(target);
  renderer.render(postScene, postCam);
}

let ntscOn = true, tubeOn = false; // per-shader toggles (lil-gui checkboxes)

function renderFrame(timeSec) {
  drawUI(timeSec);
  // 1. scene
  renderer.setRenderTarget(rtScene);
  renderer.render(scene, camera);
  composeMat.uniforms.uUI.value = uiTex;
  const useNtsc = postEnabled && ntscOn;
  const useTube = postEnabled && tubeOn;
  // 2. ntsc decode on the 3D scene only (the UI skips the composite-signal
  // smear so windows stay readable, but still goes through the tube below)
  let sceneTex = rtScene.texture;
  if (useNtsc) {
    ntscMat.uniforms.uInput.value = rtScene.texture;
    ntscMat.uniforms.time.value = timeSec;
    runPass(ntscMat, rtDecode);
    sceneTex = rtDecode.texture;
  }
  // 3. composite the UI over the (decoded) scene
  composeMat.uniforms.uScene.value = sceneTex;
  if (!useTube) {
    runPass(composeMat, null);
    renderer.setRenderTarget(null);
    return;
  }
  runPass(composeMat, rtCompose);
  // 4. halation: blur the composite at half res (H then V)
  copyMat.uniforms.uInput.value = rtCompose.texture;
  runPass(copyMat, rtHaloA);
  blurMat.uniforms.uInput.value = rtHaloA.texture;
  blurMat.uniforms.uDir.value.set(1, 0);
  runPass(blurMat, rtHaloB);
  blurMat.uniforms.uInput.value = rtHaloB.texture;
  blurMat.uniforms.uDir.value.set(0, 1);
  runPass(blurMat, rtHaloA);
  // 5. tube composite to screen
  tubeMat.uniforms.uInput.value = rtCompose.texture;
  tubeMat.uniforms.uHalo.value = rtHaloA.texture;
  runPass(tubeMat, null);
  renderer.setRenderTarget(null);
}

// ---------------- shader GUI (lil-gui, outside the render — toggle: O) ----------------
const NTSC_DEFS = [
  ["uMix", "mix (dry/wet)", 0, 1, 0.01],
  ["uBleed", "bleed", 0, 2, 0.01],
  ["uFringe", "fringe", 0, 1, 0.01],
  ["uJitter", "jitter", 0, 1, 0.01],
  ["uCrawl", "crawl", 0, 2, 0.01],
  ["uNoise", "noise", 0, 0.3, 0.005],
  ["uPull", "pull", 0, 1, 0.01],
  ["uTear", "tear", 0, 1, 0.01],
  ["uSat", "saturation", 0, 1.5, 0.01],
];
const TUBE_DEFS = [
  ["uCurve", "curve", 0, 0.3, 0.005],
  ["uBeam", "beam", 0, 1, 0.01],
  ["uConverge", "converge", 0, 1, 0.01],
  ["uHaloAmt", "halo", 0, 1, 0.01],
  ["uMask", "mask", 0, 0.5, 0.005],
  ["uGain", "gain", 0.5, 2, 0.01],
];

const gui = new GUI({ title: "JP CRT tweaks" });
{
  const toggles = { ntsc: true, tube: false };
  const fN = gui.addFolder("NTSC");
  fN.add(toggles, "ntsc").name("enabled").onChange((v) => (ntscOn = v));
  for (const [key, label, min, max, step] of NTSC_DEFS)
    fN.add(ntscMat.uniforms[key], "value", min, max, step).name(label);
  const fT = gui.addFolder("TUBE");
  fT.add(toggles, "tube").name("enabled").onChange((v) => (tubeOn = v));
  for (const [key, label, min, max, step] of TUBE_DEFS)
    fT.add(tubeMat.uniforms[key], "value", min, max, step).name(label);
  const misc = {
    post: true,
    copyParams() {
      const out = { ntsc: {}, tube: {} };
      for (const [key] of NTSC_DEFS) out.ntsc[key] = +ntscMat.uniforms[key].value.toFixed(3);
      for (const [key] of TUBE_DEFS) out.tube[key] = +tubeMat.uniforms[key].value.toFixed(3);
      const txt = JSON.stringify(out, null, 2);
      navigator.clipboard.writeText(txt).catch(() => {});
      console.log("[shader params]", txt);
    },
  };
  gui.add(misc, "post").name("post FX on").onChange((v) => (postEnabled = v));
  gui.add(misc, "copyParams").name("copy params to clipboard");
  gui.hide();
}
let guiVisible = false;
window.addEventListener("keydown", (e) => {
  if (e.code === "KeyO" && !(e.target.closest && e.target.closest(".lil-gui"))) {
    guiVisible = !guiVisible;
    guiVisible ? gui.show() : gui.hide();
  }
});

// ---------------- main loop @ 12fps ----------------
let last = performance.now();
const STEP = 1000 / RENDER_FPS;

function tick() {
  const now = performance.now();
  const dt = Math.min(now - last, 250) / 1000;
  last = now;
  stepNav(dt);
  applyCamera();
  renderFrame(now / 1000);
}
setInterval(tick, STEP);

function onResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  makeTargets();
  sizeUI();
}
window.addEventListener("resize", onResize);
window.addEventListener("orientationchange", () => setTimeout(onResize, 250));
if (window.visualViewport) window.visualViewport.addEventListener("resize", onResize);

// debug handle
window.JP = {
  nav, dirAnchors, flyToDir, pickables, openFileWindow, selectFile,
  get flyAnim() { return flyAnim; },
  step(t) { stepNav(t); applyCamera(); renderFrame(performance.now() / 1000); },
  setPost(v) { postEnabled = v; },
  renderFrame,
  renderer,
};

// load the session tree, build the world, park the camera at the root
async function boot() {
  let tree = FS_ROOT;
  try {
    const r = await fetch("sessions.json");
    if (r.ok) tree = await r.json();
  } catch (_) { /* no server: keep the demo tree */ }
  buildDir(tree, 0, 0, null, "");
  const root = dirAnchors.find((a) => a.node === tree || a.node.name === tree.name);
  if (root) {
    nav.pos.set(root.position.x, 16, root.position.z + root.platD / 2 + 42);
    nav.pitch = -0.28;
    setPath(PATH_BY_NODE.get(root.node));
  }
}
boot();
