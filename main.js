import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

const W = 540, H = 960; // internal 9:16
const LOOP = 14.0;

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setClearColor(0x000000, 1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.004);

const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 200);
camera.position.set(0, 5.8, 30);
camera.lookAt(0, 5.5, 0);

// ---------- materials ----------
const matTower = new THREE.MeshStandardMaterial({
  color: 0xc2c6ce, metalness: 0.45, roughness: 0.38, emissive: 0x2a2c32, emissiveIntensity: 0.35
});
const matRed = new THREE.MeshStandardMaterial({
  color: 0xff1a1a, metalness: 0.2, roughness: 0.35, emissive: 0xff0000, emissiveIntensity: 0.85
});
const matStick = new THREE.MeshStandardMaterial({
  color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 1.6,
  metalness: 0, roughness: 0.35
});
const matFloor = new THREE.MeshStandardMaterial({
  color: 0x0a0c14, metalness: 0.92, roughness: 0.12,
  envMapIntensity: 1.2
});
const matRipple = new THREE.MeshBasicMaterial({
  color: 0xffffff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false
});

// soft ambient + key for towers
scene.add(new THREE.AmbientLight(0x606070, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.1);
key.position.set(4, 18, 10);
scene.add(key);
const fill = new THREE.PointLight(0xaabbff, 0.35, 60);
fill.position.set(0, 10, 8);
scene.add(fill);

// ---------- floor (dark reflective water) ----------
const floorGeo = new THREE.PlaneGeometry(80, 80, 1, 1);
const floor = new THREE.Mesh(floorGeo, matFloor);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

// faint water sheen disc under the gap
const waterMat = new THREE.MeshStandardMaterial({
  color: 0x0b1020, metalness: 0.98, roughness: 0.05,
  emissive: 0x050810, emissiveIntensity: 0.2
});
const water = new THREE.Mesh(new THREE.CircleGeometry(14, 64), waterMat);
water.rotation.x = -Math.PI / 2;
water.position.y = 0.01;
scene.add(water);

// subtle floor grid glow (very faint)
const gridHelper = new THREE.GridHelper(40, 40, 0x1a1a22, 0x0c0c12);
gridHelper.position.y = 0.02;
gridHelper.material.transparent = true;
gridHelper.material.opacity = 0.25;
scene.add(gridHelper);

// mirror group: clone of towers reflected below
const mirrorRoot = new THREE.Group();
mirrorRoot.scale.y = -1;
mirrorRoot.position.y = 0;
scene.add(mirrorRoot);

// ---------- scaffolding tower builder ----------
function makeBeam(len, thick = 0.08) {
  const g = new THREE.BoxGeometry(thick, len, thick);
  const m = new THREE.Mesh(g, matTower);
  return m;
}
function makeHoriz(len, thick = 0.07) {
  const g = new THREE.BoxGeometry(len, thick, thick);
  return new THREE.Mesh(g, matTower);
}
function makeDiag(len, thick = 0.055) {
  const g = new THREE.BoxGeometry(thick, len, thick);
  return new THREE.Mesh(g, matTower);
}

function buildTower(side /* -1 left, 1 right */) {
  const g = new THREE.Group();
  const H_TOWER = 12.5;
  const W_TOWER = 2.4;
  const D_TOWER = 1.6;
  const halfW = W_TOWER / 2;
  const halfD = D_TOWER / 2;

  // 4 vertical legs
  const legs = [
    [-halfW, halfD], [halfW, halfD], [-halfW, -halfD], [halfW, -halfD]
  ];
  for (const [x, z] of legs) {
    const leg = makeBeam(H_TOWER, 0.1);
    leg.position.set(x, H_TOWER / 2, z);
    g.add(leg);
  }

  // horizontal rings every ~1.15
  const steps = 10;
  for (let i = 1; i <= steps; i++) {
    const y = (i / steps) * H_TOWER;
    // front/back
    for (const z of [-halfD, halfD]) {
      const h = makeHoriz(W_TOWER, 0.06);
      h.position.set(0, y, z);
      g.add(h);
    }
    // sides
    for (const x of [-halfW, halfW]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, D_TOWER), matTower);
      h.position.set(x, y, 0);
      g.add(h);
    }
    // X bracing on front face
    if (i < steps) {
      const segH = H_TOWER / steps;
      const diagLen = Math.hypot(W_TOWER, segH) * 0.98;
      const d1 = makeDiag(diagLen, 0.045);
      d1.position.set(0, y + segH / 2, halfD);
      d1.rotation.z = Math.atan2(W_TOWER, segH) * (i % 2 === 0 ? 1 : -1);
      // alternate
      d1.rotation.z = Math.atan2(W_TOWER, segH);
      if (i % 2) d1.rotation.z *= -1;
      g.add(d1);
      const d2 = makeDiag(diagLen, 0.045);
      d2.position.set(0, y + segH / 2, halfD);
      d2.rotation.z = -d1.rotation.z;
      // only one X per bay - skip second if crowded; keep both for lattice look
      g.add(d2);
    }
  }

  // ladder on inner side (facing center)
  const ladderX = -side * (halfW + 0.12);
  const rungCount = 14;
  for (let i = 0; i < rungCount; i++) {
    const y = 0.6 + i * (H_TOWER - 1.2) / (rungCount - 1);
    const rung = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.04), matTower);
    rung.position.set(ladderX, y, 0);
    g.add(rung);
  }
  // ladder rails
  for (const dz of [-0.22, 0.22]) {
    const rail = makeBeam(H_TOWER - 0.4, 0.05);
    rail.position.set(ladderX, H_TOWER / 2, dz);
    g.add(rail);
  }

  // diving board toward center
  const boardLen = 2.9;
  const boardY = H_TOWER - 0.15;
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(boardLen, 0.12, 0.85),
    matTower.clone()
  );
  board.material.color.setHex(0xb0b4bc);
  // board extends from tower inner edge toward center (x=0)
  const boardCenterX = -side * (halfW + boardLen / 2);
  board.position.set(boardCenterX, boardY, 0);
  g.add(board);

  // red tip at the end facing center
  const tipLen = 0.38;
  const tip = new THREE.Mesh(new THREE.BoxGeometry(tipLen, 0.14, 0.88), matRed);
  tip.position.set(-side * (halfW + boardLen - tipLen / 2), boardY + 0.02, 0);
  g.add(tip);

  // store tip world-ish local for stick placement
  g.userData.boardTipLocal = new THREE.Vector3(
    -side * (halfW + boardLen - 1.15),
    boardY + 0.85,
    0
  );
  g.userData.boardY = boardY;
  g.userData.side = side;

  // place tower
  const towerX = side * 5.5;
  g.position.set(towerX, 0, 0);
  return g;
}

const leftTower = buildTower(-1);
const rightTower = buildTower(1);
scene.add(leftTower);
scene.add(rightTower);

// mirrored towers (darker)
function cloneForMirror(src) {
  const c = src.clone(true);
  c.traverse((o) => {
    if (o.isMesh) {
      o.material = o.material.clone();
      if (o.material.color) o.material.color.multiplyScalar(0.35);
      if (o.material.emissive) o.material.emissive.multiplyScalar(0.25);
      o.material.transparent = true;
      o.material.opacity = 0.45;
      o.material.depthWrite = false;
    }
  });
  return c;
}
mirrorRoot.add(cloneForMirror(leftTower));
mirrorRoot.add(cloneForMirror(rightTower));

// ---------- stick figure ----------
function makeStick() {
  const root = new THREE.Group();
  root.scale.setScalar(1.15);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), matStick);
  head.position.y = 1.55;
  root.add(head);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.12, 0.7, 4, 8), matStick);
  torso.position.y = 0.95;
  root.add(torso);

  // arms
  const armL = new THREE.Group();
  const armR = new THREE.Group();
  const upperArmGeo = new THREE.CapsuleGeometry(0.07, 0.38, 3, 6);
  const la = new THREE.Mesh(upperArmGeo, matStick);
  la.position.y = -0.22;
  armL.add(la);
  const ra = new THREE.Mesh(upperArmGeo, matStick);
  ra.position.y = -0.22;
  armR.add(ra);
  armL.position.set(-0.22, 1.25, 0);
  armR.position.set(0.22, 1.25, 0);
  root.add(armL);
  root.add(armR);

  // legs
  const legL = new THREE.Group();
  const legR = new THREE.Group();
  const legGeo = new THREE.CapsuleGeometry(0.08, 0.5, 3, 6);
  const ll = new THREE.Mesh(legGeo, matStick);
  ll.position.y = -0.32;
  legL.add(ll);
  const lr = new THREE.Mesh(legGeo, matStick);
  lr.position.y = -0.32;
  legR.add(lr);
  legL.position.set(-0.12, 0.55, 0);
  legR.position.set(0.12, 0.55, 0);
  root.add(legL);
  root.add(legR);

  // soft glow shell
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.55, 12, 10),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.08, depthWrite: false })
  );
  glow.position.y = 1.0;
  root.add(glow);

  root.userData = { head, torso, armL, armR, legL, legR, glow };
  return root;
}

function boardWorldPos(tower) {
  const v = tower.userData.boardTipLocal.clone();
  tower.localToWorld(v);
  return v;
}

const overthinker = makeStick();
const doer = makeStick();
scene.add(overthinker);
scene.add(doer);

// mirrored sticks
const overMirror = makeStick();
const doerMirror = makeStick();
overMirror.traverse((o) => {
  if (o.isMesh) {
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.35;
    if (o.material.emissiveIntensity != null) o.material.emissiveIntensity *= 0.4;
  }
});
doerMirror.traverse((o) => {
  if (o.isMesh) {
    o.material = o.material.clone();
    o.material.transparent = true;
    o.material.opacity = 0.35;
    if (o.material.emissiveIntensity != null) o.material.emissiveIntensity *= 0.4;
  }
});
mirrorRoot.add(overMirror);
mirrorRoot.add(doerMirror);

// ---------- labels (canvas sprites) ----------
function makeLabel(cn, en) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 192;
  const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, 512, 192);
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.font = 'bold 52px "PingFang SC","Noto Sans SC","Microsoft YaHei",sans-serif';
  ctx.shadowColor = 'rgba(255,255,255,0.55)';
  ctx.shadowBlur = 12;
  ctx.fillText(cn, 256, 78);
  ctx.shadowBlur = 8;
  ctx.font = '600 34px "Helvetica Neue", Arial, sans-serif';
  ctx.letterSpacing = '2px';
  ctx.fillText(en, 256, 140);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false });
  const spr = new THREE.Sprite(mat);
  spr.scale.set(5.2, 1.9, 1);
  return spr;
}

const labelL = makeLabel('思虑过多者', 'OVERTHINKER');
const labelR = makeLabel('行动者', 'DOER');
scene.add(labelL);
scene.add(labelR);

// ---------- ripples ----------
const ripples = [];
function spawnRipple(x, z) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.15, 0.28, 48),
    matRipple.clone()
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(x, 0.04, z);
  ring.userData = { age: 0, life: 2.2, maxScale: 8 };
  scene.add(ring);
  ripples.push(ring);
  // second ring delayed feel
  const ring2 = new THREE.Mesh(
    new THREE.RingGeometry(0.1, 0.18, 48),
    matRipple.clone()
  );
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.set(x, 0.05, z);
  ring2.userData = { age: -0.25, life: 2.4, maxScale: 10 };
  scene.add(ring2);
  ripples.push(ring2);
}

// splash particles
const splashGeo = new THREE.SphereGeometry(0.06, 6, 6);
const splashMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
const splashParts = [];
function spawnSplash(x, z) {
  for (let i = 0; i < 18; i++) {
    const p = new THREE.Mesh(splashGeo, splashMat.clone());
    p.position.set(x, 0.1, z);
    const ang = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 3.5;
    p.userData = {
      vx: Math.cos(ang) * sp * 0.35,
      vy: 2.5 + Math.random() * 4,
      vz: Math.sin(ang) * sp * 0.35,
      life: 0.9 + Math.random() * 0.5,
      age: 0
    };
    scene.add(p);
    splashParts.push(p);
  }
}

// ---------- pose helpers ----------
function resetPose(stick) {
  const u = stick.userData;
  u.armL.rotation.set(0, 0, 0.35);
  u.armR.rotation.set(0, 0, -0.35);
  u.legL.rotation.set(0, 0, 0.08);
  u.legR.rotation.set(0, 0, -0.08);
  stick.rotation.set(0, 0, 0);
}

function poseIdle(stick, t, phase = 0) {
  const u = stick.userData;
  const breathe = Math.sin(t * 2.2 + phase) * 0.03;
  stick.scale.y = 1 + breathe;
  u.armL.rotation.z = 0.4 + Math.sin(t * 1.5 + phase) * 0.08;
  u.armR.rotation.z = -0.4 - Math.sin(t * 1.5 + phase + 1) * 0.08;
  u.armL.rotation.x = Math.sin(t * 1.2 + phase) * 0.1;
  u.armR.rotation.x = Math.sin(t * 1.1 + phase + 0.5) * 0.1;
  u.legL.rotation.x = 0;
  u.legR.rotation.x = 0;
}

function poseThink(stick, t) {
  const u = stick.userData;
  // rub chin: right arm up toward head
  u.armR.rotation.set(-1.1, 0.2, -0.9);
  u.armL.rotation.set(0.2, 0, 0.5);
  // slight lean / shift weight
  stick.rotation.y = Math.sin(t * 0.8) * 0.25;
  stick.rotation.z = Math.sin(t * 0.6) * 0.05;
  u.legL.rotation.x = -0.08;
  u.legR.rotation.x = 0.12;
}

function poseHesitate(stick, t) {
  const u = stick.userData;
  // both arms raised in "what do I do"
  const w = 0.5 + 0.5 * Math.sin(t * 3);
  u.armL.rotation.set(-0.8 - w * 0.3, 0, 1.1);
  u.armR.rotation.set(-0.8 - w * 0.3, 0, -1.1);
  stick.rotation.z = Math.sin(t * 4) * 0.06;
  u.legL.rotation.x = 0.15;
  u.legR.rotation.x = -0.05;
}

function posePace(stick, t, baseX) {
  const u = stick.userData;
  const cycle = (t % 2.4) / 2.4;
  const walk = Math.sin(cycle * Math.PI * 2);
  stick.position.x = baseX + walk * 0.45;
  stick.rotation.y = walk > 0 ? 0.4 : -0.4;
  u.legL.rotation.x = Math.sin(cycle * Math.PI * 2) * 0.55;
  u.legR.rotation.x = -Math.sin(cycle * Math.PI * 2) * 0.55;
  u.armL.rotation.x = -Math.sin(cycle * Math.PI * 2) * 0.4;
  u.armR.rotation.x = Math.sin(cycle * Math.PI * 2) * 0.4;
  u.armL.rotation.z = 0.35;
  u.armR.rotation.z = -0.35;
}

function poseCrouch(stick, k) {
  const u = stick.userData;
  u.legL.rotation.x = 0.9 * k;
  u.legR.rotation.x = 0.9 * k;
  u.armL.rotation.x = 0.6 * k;
  u.armR.rotation.x = 0.6 * k;
  u.armL.rotation.z = 0.5;
  u.armR.rotation.z = -0.5;
  stick.position.y -= 0.35 * k;
}

function poseDive(stick, k /* 0..1 along jump */) {
  const u = stick.userData;
  // leaping dive — keep limbs readable
  stick.rotation.x = -0.15 - k * 1.1;
  stick.rotation.z = Math.sin(k * Math.PI) * 0.12;
  u.armL.rotation.set(-1.4 - k * 0.5, 0, 0.45);
  u.armR.rotation.set(-1.4 - k * 0.5, 0, -0.45);
  u.legL.rotation.set(0.35 + k * 0.4, 0, 0.12);
  u.legR.rotation.set(0.15 + k * 0.5, 0, -0.12);
}

function poseSwim(stick, t) {
  const u = stick.userData;
  stick.rotation.x = -0.3;
  u.armL.rotation.x = -1.2 + Math.sin(t * 8) * 0.5;
  u.armR.rotation.x = -1.2 + Math.sin(t * 8 + Math.PI) * 0.5;
  u.legL.rotation.x = Math.sin(t * 6) * 0.4;
  u.legR.rotation.x = Math.sin(t * 6 + Math.PI) * 0.4;
}

function syncMirror(src, dst) {
  dst.position.set(src.position.x, src.position.y, src.position.z);
  dst.rotation.copy(src.rotation);
  dst.scale.copy(src.scale);
  dst.visible = src.visible;
  const su = src.userData, du = dst.userData;
  du.armL.rotation.copy(su.armL.rotation);
  du.armR.rotation.copy(su.armR.rotation);
  du.legL.rotation.copy(su.legL.rotation);
  du.legR.rotation.copy(su.legR.rotation);
}

// ---------- layout stick home positions ----------
const leftHome = boardWorldPos(leftTower);
const rightHome = boardWorldPos(rightTower);
leftHome.y = leftTower.userData.boardY + 0.12;
rightHome.y = rightTower.userData.boardY + 0.12;

labelL.position.set(leftHome.x - 0.2, leftHome.y + 2.8, 0.8);
labelR.position.set(rightHome.x + 0.2, rightHome.y + 2.8, 0.8);

// splash landing x (center gap, a bit toward left of doer's jump)
const LAND_X = 0.0;
const LAND_Z = 0;

// ---------- DOER jump cycle (repeats) ----------
// phase lengths
const CROUCH = 0.45;
const AIR = 1.35;
const SPLASH = 0.9;
const RESPAWN = 0.85;
const JUMP_CYCLE = CROUCH + AIR + SPLASH + RESPAWN; // ~3.55s

let lastSplashCycle = -1;

function doerJumpState(t) {
  // start first jump after 1.2s intro
  const intro = 1.2;
  if (t < intro) return { phase: 'idle', k: 0, localT: t };
  const jt = t - intro;
  const cycle = Math.floor(jt / JUMP_CYCLE);
  const local = jt % JUMP_CYCLE;
  if (local < CROUCH) return { phase: 'crouch', k: local / CROUCH, localT: local, cycle };
  if (local < CROUCH + AIR) return { phase: 'air', k: (local - CROUCH) / AIR, localT: local, cycle };
  if (local < CROUCH + AIR + SPLASH) return { phase: 'splash', k: (local - CROUCH - AIR) / SPLASH, localT: local, cycle };
  return { phase: 'respawn', k: (local - CROUCH - AIR - SPLASH) / RESPAWN, localT: local, cycle };
}

function overthinkerState(t) {
  // cycle behaviors: idle, think, pace, hesitate, watch
  const seg = 2.8;
  const i = Math.floor(t / seg) % 5;
  const local = (t % seg) / seg;
  const modes = ['idle', 'think', 'pace', 'hesitate', 'watch'];
  return { mode: modes[i], k: local };
}

function easeInOut(x) {
  return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
}
function easeOut(x) { return 1 - (1 - x) * (1 - x); }

function updateDoer(t) {
  const st = doerJumpState(t);
  resetPose(doer);
  doer.visible = true;
  doer.scale.set(1, 1, 1);

  if (st.phase === 'idle') {
    doer.position.set(rightHome.x, rightHome.y, rightHome.z);
    poseIdle(doer, t, 1);
    return;
  }
  if (st.phase === 'crouch') {
    doer.position.set(rightHome.x, rightHome.y, rightHome.z);
    poseCrouch(doer, easeInOut(st.k));
    return;
  }
  if (st.phase === 'air') {
    const k = easeInOut(st.k);
    // arc from right board toward center gap then down into water
    const x0 = rightHome.x, y0 = rightHome.y, z0 = 0;
    const x1 = LAND_X, y1 = 0.2, z1 = 0;
    // peak height
    const peak = y0 + 3.2;
    const x = THREE.MathUtils.lerp(x0, x1, k);
    const z = THREE.MathUtils.lerp(z0, z1, k);
    // parabolic y
    const y = y0 + (peak - y0) * 4 * k * (1 - k) + (y1 - y0) * k * k;
    doer.position.set(x, y, z);
    poseDive(doer, k);
    // slight forward lean toward -X
    doer.rotation.y = -0.3;
    return;
  }
  if (st.phase === 'splash') {
    if (st.cycle !== lastSplashCycle && st.k < 0.15) {
      lastSplashCycle = st.cycle;
      spawnRipple(LAND_X, LAND_Z);
      spawnSplash(LAND_X, LAND_Z);
    }
    const sink = easeOut(st.k);
    doer.position.set(LAND_X, 0.15 - sink * 1.4, 0);
    poseSwim(doer, t);
    // fade as sinks
    const op = 1 - sink * 0.7;
    doer.traverse((o) => {
      if (o.isMesh && o.material && o.material !== matStick) { /* keep */ }
    });
    doer.scale.setScalar(1 - sink * 0.25);
    return;
  }
  if (st.phase === 'respawn') {
    // fade in back on board
    const k = easeOut(st.k);
    doer.position.set(rightHome.x, rightHome.y, rightHome.z);
    poseIdle(doer, t, 1);
    doer.scale.setScalar(0.2 + 0.8 * k);
    return;
  }
}

function updateOverthinker(t) {
  resetPose(overthinker);
  const baseX = leftHome.x;
  overthinker.position.set(baseX, leftHome.y, leftHome.z);
  overthinker.visible = true;

  const st = overthinkerState(t);
  if (st.mode === 'idle') poseIdle(overthinker, t, 0);
  else if (st.mode === 'think') poseThink(overthinker, t);
  else if (st.mode === 'pace') posePace(overthinker, t, baseX);
  else if (st.mode === 'hesitate') {
    overthinker.position.x = baseX;
    poseHesitate(overthinker, t);
    // lean toward edge looking at gap
    overthinker.rotation.y = 0.5;
  } else if (st.mode === 'watch') {
    poseIdle(overthinker, t, 0.5);
    overthinker.rotation.y = 0.85; // look toward doer / gap
    overthinker.userData.armL.rotation.set(-0.3, 0, 0.6);
    overthinker.userData.armR.rotation.set(-0.4, 0, -0.3);
  }
}

function updateRipples(dt) {
  for (let i = ripples.length - 1; i >= 0; i--) {
    const r = ripples[i];
    r.userData.age += dt;
    const a = r.userData.age;
    if (a < 0) continue;
    const u = Math.min(1, a / r.userData.life);
    const s = 1 + u * r.userData.maxScale;
    r.scale.set(s, s, s);
    r.material.opacity = (1 - u) * 0.75;
    if (u >= 1) {
      scene.remove(r);
      r.geometry.dispose();
      r.material.dispose();
      ripples.splice(i, 1);
    }
  }
}

function updateSplash(dt) {
  for (let i = splashParts.length - 1; i >= 0; i--) {
    const p = splashParts[i];
    const u = p.userData;
    u.age += dt;
    u.vy -= 12 * dt;
    p.position.x += u.vx * dt;
    p.position.y += u.vy * dt;
    p.position.z += u.vz * dt;
    const fade = 1 - u.age / u.life;
    p.material.opacity = Math.max(0, fade);
    p.material.transparent = true;
    p.scale.setScalar(0.6 + fade * 0.6);
    if (u.age >= u.life || p.position.y < -0.5) {
      scene.remove(p);
      splashParts.splice(i, 1);
    }
  }
}

// ---------- composer / bloom ----------
let composer;
function setupComposer() {
  const size = new THREE.Vector2();
  renderer.getSize(size);
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.4, 0.85);
  bloom.threshold = 0.78;
  bloom.strength = 0.55;
  bloom.radius = 0.35;
  composer.addPass(bloom);
}

function resize() {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const aspect = W / H;
  let cw, ch;
  if (vw / vh > aspect) {
    ch = vh; cw = ch * aspect;
  } else {
    cw = vw; ch = cw / aspect;
  }
  canvas.style.width = cw + 'px';
  canvas.style.height = ch + 'px';
  renderer.setSize(W, H, false);
  camera.aspect = W / H;
  camera.updateProjectionMatrix();
  if (composer) {
    composer.setSize(W, H);
  }
}
window.addEventListener('resize', resize);

// ---------- timeline ----------
let t0 = performance.now();
let pausedAt = null;

function restart() {
  t0 = performance.now();
  lastSplashCycle = -1;
  // clear ripples/splash
  while (ripples.length) {
    const r = ripples.pop();
    scene.remove(r);
  }
  while (splashParts.length) {
    const p = splashParts.pop();
    scene.remove(p);
  }
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'r' || e.key === 'R') restart();
});

// allow ?t= for screenshots
const urlParams = new URLSearchParams(location.search);
const forceT = urlParams.has('t') ? parseFloat(urlParams.get('t')) : null;
const once = urlParams.has('once');

setupComposer();
resize();

const clock = new THREE.Clock();

function frame() {
  const dt = Math.min(0.05, clock.getDelta());
  let t;
  if (forceT != null) {
    t = forceT;
  } else {
    t = ((performance.now() - t0) / 1000) % LOOP;
  }

  // slight camera breathe
  camera.position.x = Math.sin(t * 0.15) * 0.12;
  camera.position.y = 5.8 + Math.sin(t * 0.22) * 0.06;
  camera.lookAt(0, 5.5, 0);

  // labels float
  labelL.position.y = leftHome.y + 2.8 + Math.sin(t * 1.3) * 0.08;
  labelR.position.y = rightHome.y + 2.8 + Math.sin(t * 1.3 + 1) * 0.08;

  updateOverthinker(t);
  updateDoer(t);
  syncMirror(overthinker, overMirror);
  syncMirror(doer, doerMirror);
  updateRipples(dt);
  updateSplash(dt);

  composer.render();

  if (!(forceT != null && once)) {
    requestAnimationFrame(frame);
  } else {
    // keep last frame for screenshot
    document.body.dataset.ready = '1';
  }
}
requestAnimationFrame(frame);
document.body.dataset.ready = '1';

// export for debug
window.__stickman = { restart, LOOP };
