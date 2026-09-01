import {
  canClearCheckpoint,
  formatTime,
  ICE_SPIKE_RUNWAY,
  jumpsForCheckpoint,
  scoreRun,
  secondsForCheckpoint,
  spikePlacement,
  SPIKE_RUNWAY,
  STARTING_LIVES,
  targetsForCheckpoint,
} from "./gameRules.ts";

type Vec = { x: number; y: number };
type SurfaceKind = "stone" | "ice" | "crumble";
type Surface = {
  x: number;
  y: number;
  w: number;
  h: number;
  kind: SurfaceKind;
  stress?: number;
  broken?: boolean;
};
type Hazard = { x: number; y: number; w: number; h: number };
type Target = { x: number; y: number; r: number; alive: boolean; phase: number };
type Gate = { x: number; y: number; h: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; colour: string };
type Section = { start: number; end: number; gate: Gate; targetCount: number };

function required<T extends Element>(selector: string): T {
  const element = document.querySelector<T>(selector);
  if (!element) throw new Error(`Missing game element: ${selector}`);
  return element;
}

const canvas = required<HTMLCanvasElement>("#game");
const endPanel = required<HTMLDivElement>("#run-end");
const restartButton = required<HTMLButtonElement>("#restart");
const endReason = required<HTMLElement>("#run-reason");
const context = canvas.getContext("2d");
if (!context) throw new Error("Canvas 2D is unavailable");
const ctx = context;

const statCheckpoints = required<HTMLElement>("#stat-checkpoints");
const statTargets = required<HTMLElement>("#stat-targets");
const statJumps = required<HTMLElement>("#stat-jumps");
const statTime = required<HTMLElement>("#stat-time");
const statScore = required<HTMLElement>("#stat-score");

const TAU = Math.PI * 2;
const NINJA_RADIUS = 20;
const GRAVITY = 1280;
const MAX_LAUNCH = 980;
const WORLD_FLOOR = 900;
const CRUMBLE_HOLD_SECONDS = 2.4;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

let width = 0;
let height = 0;
let pixelRatio = 1;
let lastTime = performance.now();
let elapsedBeforePause = 0;
let pausedAt: number | null = null;
let surfaces: Surface[] = [];
let hazards: Hazard[] = [];
let targets: Target[] = [];
let particles: Particle[] = [];
let section!: Section;
let checkpoint = 1;
let jumps = 0;
let jumpsSaved = 0;
let targetsHit = 0;
let runStartedAt = performance.now();
let cameraX = 0;
let screenShake = 0;
let flash = 0;
let state: "playing" | "dead" = "playing";
let aiming = false;
let pointerId: number | null = null;
let pointer: Vec = { x: 0, y: 0 };
let firstMove = true;
let landingCooldown = 0;
let finalElapsedMs = 0;
let attachedSurface: Surface | null = null;
let levelReveal = 0;
let checkpointTimeLeft = 0;
let deathReason = "";
let lives = STARTING_LIVES;
// Where a death sends the ninja back to: the spot it was parked on when this
// section began, and the platform it was parked on.
let anchor: { x: number; y: number; surface: Surface | null } = { x: 150, y: 540, surface: null };
// Bumped every run, so a death's pending timeout can't act on a run that has
// already been restarted underneath it.
let runToken = 0;

const ninja = { x: 150, y: 520, vx: 0, vy: 0, stuck: true, onIce: false, rotation: 0 };

function seeded(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let t = value;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function addFirstSection(): Section {
  surfaces.push(
    { x: -300, y: 560, w: 660, h: 120, kind: "stone" },
    { x: 440, y: 445, w: 185, h: 34, kind: "crumble", stress: 0 },
    { x: 660, y: 385, w: 45, h: 140, kind: "stone" },
    { x: 754, y: 465, w: 36, h: 105, kind: "stone" },
    { x: 790, y: 535, w: 250, h: 35, kind: "ice" },
    { x: 1040, y: 465, w: 36, h: 105, kind: "stone" },
    { x: 1090, y: 405, w: 145, h: 34, kind: "crumble", stress: 0 },
    { x: 1280, y: 420, w: 310, h: 120, kind: "stone" },
  );
  targets.push(
    { x: 540, y: 405, r: 18, alive: true, phase: .4 },
    { x: 910, y: 495, r: 18, alive: true, phase: 2.1 },
  );
  return { start: 0, end: 1590, gate: { x: 1505, y: 275, h: 145 }, targetCount: 2 };
}

function addHandcraftedSection(index: 2 | 3, start: number, startY: number): Section {
  if (index === 2) {
    const topY = Math.max(255, startY - 165);
    surfaces.push(
      { x: start - 40, y: startY, w: 235, h: 110, kind: "stone" },
      { x: start + 315, y: topY + 85, w: 46, h: 145, kind: "stone" },
      { x: start + 455, y: topY, w: 175, h: 32, kind: "crumble", stress: 0 },
      { x: start + 735, y: topY + 125, w: 205, h: 80, kind: "stone" },
      { x: start + 984, y: topY - 35, w: 36, h: 104, kind: "stone" },
      { x: start + 1020, y: topY + 35, w: 250, h: 34, kind: "ice" },
      { x: start + 1270, y: topY - 35, w: 36, h: 104, kind: "stone" },
      { x: start + 1365, y: topY - 45, w: 355, h: 120, kind: "stone" },
    );
    hazards.push({ x: start + 835, y: topY + 103, w: 58, h: 22 });
    targets.push(
      { x: start + 335, y: topY + 20, r: 18, alive: true, phase: .7 },
      { x: start + 545, y: topY - 38, r: 18, alive: true, phase: 2.4 },
      { x: start + 1145, y: topY - 8, r: 18, alive: true, phase: 4.2 },
    );
    return {
      start,
      end: start + 1720,
      gate: { x: start + 1635, y: topY - 190, h: 145 },
      targetCount: 3,
    };
  }

  const midY = Math.min(470, startY + 150);
  surfaces.push(
    { x: start - 40, y: startY, w: 230, h: 115, kind: "stone" },
    { x: start + 300, y: startY + 95, w: 150, h: 30, kind: "crumble", stress: 0 },
    { x: start + 550, y: midY + 70, w: 210, h: 80, kind: "stone" },
    { x: start + 840, y: midY - 55, w: 42, h: 170, kind: "stone" },
    { x: start + 974, y: midY + 10, w: 36, h: 104, kind: "stone" },
    { x: start + 1010, y: midY + 80, w: 265, h: 34, kind: "ice" },
    { x: start + 1275, y: midY + 10, w: 36, h: 104, kind: "stone" },
    { x: start + 1360, y: midY - 45, w: 145, h: 30, kind: "crumble", stress: 0 },
    { x: start + 1595, y: midY - 130, w: 340, h: 120, kind: "stone" },
  );
  hazards.push(
    { x: start + 625, y: midY + 48, w: 54, h: 22 },
    { x: start + 1160, y: midY + 58, w: 60, h: 22 },
  );
  targets.push(
    { x: start + 370, y: startY + 52, r: 18, alive: true, phase: .2 },
    { x: start + 855, y: midY - 145, r: 18, alive: true, phase: 1.8 },
    { x: start + 1115, y: midY + 35, r: 18, alive: true, phase: 3.6 },
    { x: start + 1430, y: midY - 88, r: 18, alive: true, phase: 5.1 },
  );
  return {
    start,
    end: start + 1935,
    gate: { x: start + 1850, y: midY - 275, h: 145 },
    targetCount: 4,
  };
}

function addSection(index: number, start: number, startY: number): Section {
  if (index === 2 || index === 3) return addHandcraftedSection(index, start, startY);
  return addGeneratedSection(index, start, startY);
}

function ensureIceHasStickyEnds(sectionStart: number): void {
  const iceRuns = surfaces.filter((surface) => surface.kind === "ice" && surface.x >= sectionStart - 100);
  for (const ice of iceRuns) {
    const spansIceEdge = (surface: Surface): boolean =>
      surface.kind !== "ice"
      && !surface.broken
      && surface.y <= ice.y
      && surface.y + surface.h >= ice.y + ice.h;
    const hasLeftCatch = surfaces.some((surface) =>
      spansIceEdge(surface) && Math.abs(surface.x + surface.w - ice.x) < 1,
    );
    const hasRightCatch = surfaces.some((surface) =>
      spansIceEdge(surface) && Math.abs(surface.x - (ice.x + ice.w)) < 1,
    );
    if (!hasLeftCatch) surfaces.push({ x: ice.x - 34, y: ice.y - 70, w: 34, h: ice.h + 70, kind: "stone" });
    if (!hasRightCatch) surfaces.push({ x: ice.x + ice.w, y: ice.y - 70, w: 34, h: ice.h + 70, kind: "stone" });
  }
}

function addGeneratedSection(index: number, start: number, startY: number): Section {
  const random = seeded(index * 7919 + 17);
  const platformCount = Math.max(
    6 + Math.min(2, Math.floor(index / 3)),
    targetsForCheckpoint(index) + 1,
  );
  let x = start - 40;
  let y = startY;
  const sectionPlatforms: Surface[] = [];
  surfaces.push({ x, y, w: 235, h: 120, kind: "stone" });
  x += 235;

  for (let i = 0; i < platformCount; i += 1) {
    x += 95 + random() * Math.min(115, 55 + index * 9);
    y = Math.max(300, Math.min(610, y + (random() - .48) * (155 + index * 3)));
    const w = 185 + random() * 125;
    const roll = random();
    const kind: SurfaceKind = i === platformCount - 1
      ? "stone"
      : i > 0 && roll < Math.min(.32, .11 + index * .018)
        ? "ice"
        : roll < Math.min(.67, .28 + index * .035) ? "crumble" : "stone";
    const platform: Surface = {
      x,
      y,
      w,
      h: kind === "stone" ? 85 : 34,
      kind,
      stress: kind === "crumble" ? 0 : undefined,
    };
    surfaces.push(platform);
    sectionPlatforms.push(platform);
    if (kind === "ice") {
      surfaces.push(
        { x: x - 34, y: y - 70, w: 34, h: 104, kind: "stone" },
        { x: x + w, y: y - 70, w: 34, h: 104, kind: "stone" },
      );
    }
    x += w;
  }

  const gatePlatform = sectionPlatforms[sectionPlatforms.length - 1]!;
  gatePlatform.w = Math.max(300, gatePlatform.w);
  const count = targetsForCheckpoint(index);
  // The gate platform stays clean: the last thing a section does is let you land.
  const playable = sectionPlatforms.slice(0, -1);
  const targetSpots = [...playable].sort(() => random() - .5).slice(0, count);
  const targetLines = new Map<Surface, number>();
  for (const spot of targetSpots) {
    const line = spot.x + 45 + random() * Math.max(20, spot.w - 90);
    targetLines.set(spot, line);
    // Hang some of them high enough that collecting one costs a real arc rather
    // than a flat hop over the platform. Ice keeps its targets low, where a
    // slide can still take them.
    const lift = spot.kind === "ice" ? 38 : 38 + Math.round(random() * random() * 92);
    targets.push({ x: line, y: spot.y - lift, r: 18, alive: true, phase: random() * TAU });
  }

  // Spikes used to skip any platform carrying a target, which quietly starved
  // every section past the fourth: once the target count saturates at six there
  // is barely a platform left to spike. They now share a platform with a
  // target, taking the end furthest from it.
  const spikeChance = Math.min(.62, .1 + index * .06);
  for (const spot of playable.slice(1)) {
    if (spot.kind === "ice" || random() >= spikeChance) continue;
    const w = Math.min(72, Math.max(26, spot.w * .28));
    const at = spikePlacement(spot, w, SPIKE_RUNWAY, targetLines.get(spot), random() < .5);
    if (at !== null) hazards.push({ x: at, y: spot.y - 22, w, h: 22 });
  }

  // A spike on the ice is the beat the handcrafted sections are remembered for:
  // you have to come down on the right side of it, because a slide cannot be
  // aimed out of. Both ends keep a landing zone, so either approach works.
  const iceSpikeChance = Math.min(.72, .16 + index * .07);
  for (const ice of playable) {
    if (ice.kind !== "ice" || random() >= iceSpikeChance) continue;
    const at = spikePlacement(ice, 54, ICE_SPIKE_RUNWAY, targetLines.get(ice), random() < .5);
    if (at !== null) hazards.push({ x: at, y: ice.y - 22, w: 54, h: 22 });
  }

  const end = gatePlatform.x + gatePlatform.w;
  return { start, end, gate: { x: end - 72, y: gatePlatform.y - 145, h: 145 }, targetCount: count };
}

function resize(): void {
  width = innerWidth;
  height = innerHeight;
  pixelRatio = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
}

function reset(): void {
  surfaces = [];
  hazards = [];
  targets = [];
  particles = [];
  checkpoint = 1;
  jumps = jumpsForCheckpoint(checkpoint);
  jumpsSaved = 0;
  targetsHit = 0;
  runStartedAt = performance.now();
  elapsedBeforePause = 0;
  pausedAt = null;
  cameraX = 0;
  screenShake = 0;
  flash = 0;
  state = "playing";
  aiming = false;
  pointerId = null;
  firstMove = true;
  landingCooldown = 0;
  finalElapsedMs = 0;
  attachedSurface = null;
  levelReveal = 2.2;
  checkpointTimeLeft = secondsForCheckpoint(checkpoint);
  deathReason = "";
  lives = STARTING_LIVES;
  runToken += 1;
  Object.assign(ninja, { x: 150, y: 540, vx: 0, vy: 0, stuck: true, onIce: false, rotation: 0 });
  section = addFirstSection();
  ensureIceHasStickyEnds(section.start);
  anchor = { x: ninja.x, y: ninja.y, surface: surfaces[0] ?? null };
  endPanel.hidden = true;
  canvas.focus();
}

function remainingTargets(): number {
  return targets.filter((target) => target.alive && target.x >= section.start - 100).length;
}

function worldPointer(event: PointerEvent): Vec {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left + cameraX, y: event.clientY - rect.top };
}

function onPointerDown(event: PointerEvent): void {
  if (state !== "playing" || !ninja.stuck || jumps <= 0) return;
  const point = worldPointer(event);
  if (Math.hypot(point.x - ninja.x, point.y - ninja.y) > Math.max(74, width * .085)) return;
  pointerId = event.pointerId;
  pointer = point;
  aiming = true;
  canvas.classList.add("is-aiming");
  canvas.setPointerCapture(event.pointerId);
}

function onPointerMove(event: PointerEvent): void {
  if (aiming && event.pointerId === pointerId) pointer = worldPointer(event);
}

function onPointerUp(event: PointerEvent): void {
  if (!aiming || event.pointerId !== pointerId) return;
  const dx = ninja.x - pointer.x;
  const dy = ninja.y - pointer.y;
  const distance = Math.hypot(dx, dy);
  aiming = false;
  pointerId = null;
  canvas.classList.remove("is-aiming");
  if (distance < 14) return;
  const power = Math.min(MAX_LAUNCH, distance * 5.1);
  ninja.vx = dx / distance * power;
  ninja.vy = dy / distance * power;
  ninja.stuck = false;
  ninja.onIce = false;
  attachedSurface = null;
  jumps -= 1;
  firstMove = false;
  landingCooldown = .12;
  burst(ninja.x, ninja.y, 7, "#f6eee1", 160);
  tone(210 + Math.min(300, power * .35), .055, "triangle", .035);
}

function burst(x: number, y: number, count: number, colour: string, speed: number): void {
  const amount = reducedMotion ? Math.min(3, count) : count;
  for (let i = 0; i < amount; i += 1) {
    const angle = Math.random() * TAU;
    const magnitude = speed * (.35 + Math.random() * .65);
    particles.push({ x, y, vx: Math.cos(angle) * magnitude, vy: Math.sin(angle) * magnitude, life: .45 + Math.random() * .3, colour });
  }
}

let audioContext: AudioContext | null = null;
function tone(frequency: number, duration: number, type: OscillatorType, volume: number): void {
  try {
    audioContext ??= new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch { /* Audio is optional. */ }
}

function kill(reason: string): void {
  if (state === "dead") return;
  deathReason = reason;
  finalElapsedMs = elapsedTime();
  state = "dead";
  aiming = false;
  canvas.classList.remove("is-aiming");
  screenShake = reducedMotion ? 0 : 18;
  flash = .8;
  burst(ninja.x, ninja.y, 22, "#ee5d54", 360);
  tone(90, .48, "sawtooth", .07);
  lives -= 1;
  const token = runToken;
  setTimeout(() => {
    if (token !== runToken) return;
    if (lives > 0) respawnAtCheckpoint();
    else showEnd();
  }, reducedMotion ? 120 : 680);
}

function showEnd(): void {
  const stats = { checkpoints: checkpoint - 1, targets: targetsHit, jumpsSaved, elapsedMs: finalElapsedMs };
  statCheckpoints.textContent = String(stats.checkpoints);
  statTargets.textContent = String(stats.targets);
  statJumps.textContent = String(stats.jumpsSaved);
  statTime.textContent = formatTime(stats.elapsedMs);
  statScore.textContent = scoreRun(stats).toLocaleString("en-AU");
  endReason.textContent = deathReason;
  endPanel.hidden = false;
  restartButton.focus();
}

function elapsedTime(): number {
  if (pausedAt !== null) return elapsedBeforePause;
  return elapsedBeforePause + performance.now() - runStartedAt;
}

function circleRect(cx: number, cy: number, radius: number, rect: { x: number; y: number; w: number; h: number }): boolean {
  const nearestX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearestY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  return (cx - nearestX) ** 2 + (cy - nearestY) ** 2 < radius ** 2;
}

function resolveSurface(surface: Surface, previous: Vec): boolean {
  if (surface.broken || !circleRect(ninja.x, ninja.y, NINJA_RADIUS, surface)) return false;
  const tolerance = 4;
  const crossedTop = previous.y + NINJA_RADIUS <= surface.y + tolerance && ninja.vy >= 0;
  const crossedBottom = previous.y - NINJA_RADIUS >= surface.y + surface.h - tolerance && ninja.vy <= 0;
  const crossedLeft = previous.x + NINJA_RADIUS <= surface.x + tolerance && ninja.vx >= 0;
  const crossedRight = previous.x - NINJA_RADIUS >= surface.x + surface.w - tolerance && ninja.vx <= 0;
  let normal: Vec;

  if (crossedTop) normal = { x: 0, y: -1 };
  else if (crossedBottom) normal = { x: 0, y: 1 };
  else if (crossedLeft) normal = { x: -1, y: 0 };
  else if (crossedRight) normal = { x: 1, y: 0 };
  else {
    const exits = [
      { distance: Math.abs(ninja.x - (surface.x - NINJA_RADIUS)), normal: { x: -1, y: 0 } },
      { distance: Math.abs(ninja.x - (surface.x + surface.w + NINJA_RADIUS)), normal: { x: 1, y: 0 } },
      { distance: Math.abs(ninja.y - (surface.y - NINJA_RADIUS)), normal: { x: 0, y: -1 } },
      { distance: Math.abs(ninja.y - (surface.y + surface.h + NINJA_RADIUS)), normal: { x: 0, y: 1 } },
    ];
    exits.sort((a, b) => a.distance - b.distance);
    normal = exits[0]!.normal;
  }

  if (normal.x < 0) ninja.x = surface.x - NINJA_RADIUS;
  else if (normal.x > 0) ninja.x = surface.x + surface.w + NINJA_RADIUS;
  else if (normal.y < 0) ninja.y = surface.y - NINJA_RADIUS;
  else ninja.y = surface.y + surface.h + NINJA_RADIUS;

  // The wall at the end of an ice run is caught on one frame, but the ice the
  // ninja is still sunk into resolves on the next one — and the slip branch
  // below would unstick it and shove it back at the slide floor, forever. A
  // grip on anything that is not ice therefore outranks the ice underfoot.
  const grippingCatch = ninja.stuck && attachedSurface !== null && attachedSurface.kind !== "ice";
  if (surface.kind === "ice" && normal.y !== 0 && grippingCatch) {
    ninja.vx = 0;
    ninja.vy = 0;
    ninja.onIce = false;
  } else if (surface.kind === "ice" && normal.y !== 0) {
    const enteredIce = !ninja.onIce;
    ninja.vy = 0;
    ninja.onIce = true;
    ninja.stuck = false;
    attachedSurface = null;
    if (Math.abs(ninja.vx) < 155) ninja.vx = Math.sign(ninja.vx || 1) * 155;
    if (enteredIce) tone(720, .035, "sine", .018);
  } else {
    const newContact = attachedSurface !== surface;
    ninja.vx = 0;
    ninja.vy = 0;
    ninja.stuck = true;
    ninja.onIce = false;
    attachedSurface = surface;
    if (newContact) tone(surface.kind === "crumble" ? 185 : 135, .035, "square", .018);
    if (jumps === 0 && landingCooldown <= 0) kill("out of jumps");
  }
  return true;
}

function breakAttachedSurface(): void {
  if (!attachedSurface || attachedSurface.kind !== "crumble" || attachedSurface.broken) return;
  const breaking = attachedSurface;
  breaking.broken = true;
  attachedSurface = null;
  aiming = false;
  pointerId = null;
  canvas.classList.remove("is-aiming");
  ninja.stuck = false;
  ninja.vy = Math.max(140, ninja.vy);
  landingCooldown = .18;
  burst(ninja.x, ninja.y, 18, "#f2c86b", 250);
  screenShake = reducedMotion ? 0 : 8;
  tone(78, .22, "square", .055);
}

function gatePlatform(gate: Gate): Surface | undefined {
  const spanning = surfaces.filter((surface) =>
    !surface.broken && gate.x >= surface.x && gate.x <= surface.x + surface.w);
  // A gate stands 145px tall on top of the platform it guards, so the platform
  // is the one whose surface meets the gate's foot; anything else is scenery.
  return spanning.find((surface) => Math.abs(surface.y - (gate.y + gate.h)) < 1) ?? spanning[0];
}

// Clearing a checkpoint has to stop the ninja dead on the platform it earned.
// Carrying the entry speed through would fling it into a section that has only
// just been generated and not yet drawn, so a well-aimed run could end in a gap
// the player never had a chance to see.
function parkOnCheckpoint(platform: Surface | undefined): void {
  ninja.vx = 0;
  ninja.vy = 0;
  ninja.stuck = true;
  ninja.onIce = false;
  ninja.rotation = 0;
  aiming = false;
  pointerId = null;
  canvas.classList.remove("is-aiming");
  landingCooldown = .25;
  // Never anchor to crumble: parking on a timer would re-create the same fall.
  attachedSurface = platform && platform.kind !== "crumble" ? platform : null;
  if (!platform) return;
  const left = platform.x + NINJA_RADIUS;
  ninja.x = Math.min(Math.max(ninja.x, left), Math.max(left, platform.x + platform.w - NINJA_RADIUS));
  ninja.y = platform.y - NINJA_RADIUS;
}

function clearCheckpoint(): void {
  jumpsSaved += jumps;
  checkpoint += 1;
  jumps = jumpsForCheckpoint(checkpoint);
  checkpointTimeLeft = secondsForCheckpoint(checkpoint);
  levelReveal = 1.8;
  burst(section.gate.x, section.gate.y + section.gate.h * .5, 28, "#f2c86b", 320);
  tone(520, .12, "sine", .06);
  setTimeout(() => tone(780, .18, "sine", .05), 90);
  const oldStart = section.start;
  const gateSurface = gatePlatform(section.gate);
  parkOnCheckpoint(gateSurface);
  anchor = { x: ninja.x, y: ninja.y, surface: attachedSurface };
  section = addSection(checkpoint, section.end + 105, gateSurface?.y ?? 470);
  ensureIceHasStickyEnds(section.start);
  surfaces = surfaces.filter((surface) => surface.x + surface.w > oldStart - 500);
  hazards = hazards.filter((hazard) => hazard.x + hazard.w > oldStart - 500);
  targets = targets.filter((target) => target.alive || target.x > oldStart - 500);
}

function respawnAtCheckpoint(): void {
  // Restore the section, not just the ninja. Respawning onto a checkpoint whose
  // ledges have already fallen and whose targets are half gone is either
  // unwinnable or free, and both are worse than the death that got you here.
  for (const surface of surfaces) {
    if (surface.kind !== "crumble") continue;
    surface.broken = false;
    surface.stress = 0;
  }
  for (const target of targets) {
    if (target.alive || target.x < section.start - 100) continue;
    target.alive = true;
    targetsHit = Math.max(0, targetsHit - 1);
  }
  jumps = jumpsForCheckpoint(checkpoint);
  checkpointTimeLeft = secondsForCheckpoint(checkpoint);
  particles = [];
  screenShake = 0;
  flash = 0;
  aiming = false;
  pointerId = null;
  canvas.classList.remove("is-aiming");
  landingCooldown = .3;
  levelReveal = 1.2;
  deathReason = "";
  Object.assign(ninja, {
    x: anchor.x,
    y: anchor.y,
    vx: 0,
    vy: 0,
    stuck: true,
    onIce: false,
    rotation: 0,
  });
  attachedSurface = anchor.surface;
  cameraX = Math.max(0, ninja.x - width * .32);
  state = "playing";
  tone(330, .1, "sine", .05);
  setTimeout(() => tone(495, .12, "sine", .04), 80);
}

function update(dt: number): void {
  flash = Math.max(0, flash - dt * 2.5);
  screenShake *= Math.pow(.025, dt);
  landingCooldown = Math.max(0, landingCooldown - dt);
  levelReveal = Math.max(0, levelReveal - dt);
  for (const particle of particles) {
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vy += GRAVITY * .45 * dt;
    particle.life -= dt;
  }
  particles = particles.filter((particle) => particle.life > 0);
  if (state === "playing" && ninja.stuck && attachedSurface?.kind === "crumble") {
    attachedSurface.stress = Math.min(1, (attachedSurface.stress ?? 0) + dt / CRUMBLE_HOLD_SECONDS);
    if (attachedSurface.stress >= 1) breakAttachedSurface();
  }
  // The clock runs while aiming, the way crumble stress already does: taking
  // your time to line a shot up is the cost the countdown is there to price.
  if (state === "playing") {
    const wholeSecondBefore = Math.ceil(checkpointTimeLeft);
    checkpointTimeLeft = Math.max(0, checkpointTimeLeft - dt);
    const wholeSecond = Math.ceil(checkpointTimeLeft);
    if (wholeSecond !== wholeSecondBefore && wholeSecond > 0 && wholeSecond <= 5) {
      tone(196 + (6 - wholeSecond) * 24, .05, "square", .03);
    }
    if (checkpointTimeLeft <= 0) {
      kill("out of time");
      return;
    }
  }
  if (state !== "playing" || aiming) return;
  if (ninja.stuck && jumps === 0 && landingCooldown <= 0) {
    kill("out of jumps");
    return;
  }

  const previous = { x: ninja.x, y: ninja.y };
  if (!ninja.stuck) {
    ninja.vy += GRAVITY * dt;
    ninja.x += ninja.vx * dt;
    ninja.y += ninja.vy * dt;
    ninja.rotation += (ninja.onIce ? ninja.vx * .006 : (ninja.vx + ninja.vy) * .0025) * dt * 60;
  }

  let collided = false;
  const collisionCandidates = surfaces
    .filter((surface) => !surface.broken && circleRect(ninja.x, ninja.y, NINJA_RADIUS, surface))
    .sort((a, b) => Number(a.kind === "ice") - Number(b.kind === "ice"));
  for (const surface of collisionCandidates) {
    if (resolveSurface(surface, previous)) { collided = true; break; }
  }
  if (ninja.onIce && !collided) ninja.onIce = false;

  for (const target of targets) {
    if (!target.alive) continue;
    if (Math.hypot(ninja.x - target.x, ninja.y - target.y) < NINJA_RADIUS + target.r) {
      target.alive = false;
      targetsHit += 1;
      ninja.vx *= 1.04;
      ninja.vy -= 90;
      burst(target.x, target.y, 16, "#ee5d54", 260);
      screenShake = reducedMotion ? 0 : 7;
      tone(310, .08, "square", .055);
    }
  }

  for (const hazard of hazards) if (circleRect(ninja.x, ninja.y, NINJA_RADIUS * .72, hazard)) kill("caught the spikes");

  const ready = canClearCheckpoint(remainingTargets(), jumps);
  const gateHorizontalPadding = ready ? 48 : 8;
  const gateVerticalPadding = ready ? 70 : 25;
  const touchesGate = ninja.x + NINJA_RADIUS >= section.gate.x - gateHorizontalPadding
    && ninja.y > section.gate.y - gateVerticalPadding
    && ninja.y < section.gate.y + section.gate.h + gateVerticalPadding;
  if (touchesGate) {
    if (ready) clearCheckpoint();
    else {
      ninja.x = section.gate.x - NINJA_RADIUS - 2;
      ninja.vx = -Math.max(210, Math.abs(ninja.vx) * .5);
      ninja.stuck = false;
      attachedSurface = null;
      screenShake = reducedMotion ? 0 : 5;
      tone(105, .12, "sawtooth", .045);
    }
  }

  if (ninja.y > WORLD_FLOOR) kill("fell");
  else if (ninja.x < cameraX - 260) kill("left behind");
  const desiredCamera = Math.max(0, ninja.x - width * .32);
  cameraX += (desiredCamera - cameraX) * Math.min(1, dt * 4.2);
}

function drawBackground(time: number): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#090b18");
  gradient.addColorStop(.55, "#16172b");
  gradient.addColorStop(1, "#2a1e2e");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const moonX = width * .76 - cameraX * .018;
  const moonY = Math.min(175, height * .22);
  const moonR = Math.min(78, width * .085);
  ctx.fillStyle = "rgba(242, 200, 107, .075)";
  ctx.beginPath(); ctx.arc(moonX, moonY, moonR * 1.7, 0, TAU); ctx.fill();
  ctx.fillStyle = "#e8d9b9";
  ctx.beginPath(); ctx.arc(moonX, moonY, moonR, 0, TAU); ctx.fill();
  ctx.fillStyle = "#111326";
  ctx.beginPath(); ctx.arc(moonX + moonR * .38, moonY - moonR * .14, moonR * .86, 0, TAU); ctx.fill();
  drawMountain(.055, height * .62, "#111326", 170);
  drawMountain(.11, height * .73, "#18182b", 120);
  drawCity(.2, height * .78, "#0b0d19");
  ctx.strokeStyle = "rgba(246, 238, 225, .09)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    const x = ((i * 193 - cameraX * .08) % (width + 240)) - 120;
    const y = 70 + ((i * 67) % Math.max(120, height * .48));
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12 + Math.sin(time + i) * 4, y - 3); ctx.stroke();
  }
}

function drawMountain(parallax: number, baseline: number, colour: string, amplitude: number): void {
  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.moveTo(0, height);
  const offset = -(cameraX * parallax) % 420;
  for (let x = offset - 420; x <= width + 420; x += 210) {
    ctx.lineTo(x, baseline);
    ctx.lineTo(x + 105, baseline - amplitude * (.65 + ((x / 210) % 3 + 3) % 3 * .12));
    ctx.lineTo(x + 210, baseline);
  }
  ctx.lineTo(width, height);
  ctx.closePath();
  ctx.fill();
}

function drawCity(parallax: number, baseline: number, colour: string): void {
  ctx.fillStyle = colour;
  const offset = -(cameraX * parallax) % 155;
  for (let x = offset - 155; x < width + 155; x += 62) {
    const h = 40 + ((Math.abs(Math.floor(x / 62)) * 47) % 110);
    ctx.fillRect(x, baseline - h, 48, height - baseline + h);
    if ((Math.floor(x / 62) & 2) === 0) {
      ctx.fillStyle = "rgba(238, 93, 84, .12)";
      ctx.fillRect(x + 11, baseline - h + 20, 4, 7);
      ctx.fillStyle = colour;
    }
  }
}

function drawSurface(surface: Surface, time: number): void {
  if (surface.broken) return;
  const stress = surface.stress ?? 0;
  const shake = surface.kind === "crumble" && stress > .45
    ? Math.sin(time * (18 + stress * 22)) * stress * 2.5
    : 0;
  const x = surface.x - cameraX + shake;
  if (x > width + 100 || x + surface.w < -100) return;
  if (surface.kind === "ice") {
    const gradient = ctx.createLinearGradient(0, surface.y, 0, surface.y + surface.h);
    gradient.addColorStop(0, "#a7e7ec");
    gradient.addColorStop(.22, "#4da8ba");
    gradient.addColorStop(1, "#173f57");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, surface.y, surface.w, surface.h);
    ctx.strokeStyle = "rgba(232, 252, 248, .6)";
    ctx.beginPath();
    ctx.moveTo(x + 14, surface.y + 7); ctx.lineTo(x + surface.w * .42, surface.y + 14);
    ctx.moveTo(x + surface.w * .57, surface.y + 8); ctx.lineTo(x + surface.w - 16, surface.y + 13);
    ctx.stroke();
  } else if (surface.kind === "crumble") {
    const gradient = ctx.createLinearGradient(0, surface.y, 0, surface.y + surface.h);
    gradient.addColorStop(0, stress > .72 ? "#f2c86b" : "#a8784b");
    gradient.addColorStop(.18, "#6b4939");
    gradient.addColorStop(1, "#2b2028");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, surface.y, surface.w, surface.h);
    ctx.fillStyle = `rgba(242, 200, 107, ${.2 + stress * .65})`;
    ctx.fillRect(x, surface.y, surface.w, 4);
    ctx.strokeStyle = `rgba(12, 10, 18, ${.45 + stress * .5})`;
    ctx.lineWidth = 1.5;
    const crackDepth = 7 + stress * Math.max(8, surface.h - 8);
    for (let cx = x + 28; cx < x + surface.w; cx += 42) {
      ctx.beginPath();
      ctx.moveTo(cx, surface.y + 3);
      ctx.lineTo(cx - 5, surface.y + crackDepth * .48);
      ctx.lineTo(cx + 4, surface.y + crackDepth);
      ctx.stroke();
    }
  } else {
    const gradient = ctx.createLinearGradient(0, surface.y, 0, surface.y + surface.h);
    gradient.addColorStop(0, "#34354a");
    gradient.addColorStop(.12, "#24263a");
    gradient.addColorStop(1, "#10121f");
    ctx.fillStyle = gradient;
    ctx.fillRect(x, surface.y, surface.w, surface.h);
    ctx.fillStyle = "#565267";
    ctx.fillRect(x, surface.y, surface.w, 5);
    ctx.strokeStyle = "rgba(246, 238, 225, .075)";
    for (let bx = x + 38; bx < x + surface.w; bx += 52) {
      ctx.beginPath(); ctx.moveTo(bx, surface.y + 9); ctx.lineTo(bx - 8, surface.y + Math.min(45, surface.h)); ctx.stroke();
    }
  }
}

function drawHazard(hazard: Hazard): void {
  const x = hazard.x - cameraX;
  ctx.fillStyle = "#ee5d54";
  ctx.shadowColor = "rgba(238, 93, 84, .55)";
  ctx.shadowBlur = 12;
  const teeth = Math.max(2, Math.floor(hazard.w / 18));
  ctx.beginPath(); ctx.moveTo(x, hazard.y + hazard.h);
  for (let i = 0; i < teeth; i += 1) {
    const step = hazard.w / teeth;
    ctx.lineTo(x + (i + .5) * step, hazard.y);
    ctx.lineTo(x + (i + 1) * step, hazard.y + hazard.h);
  }
  ctx.closePath(); ctx.fill(); ctx.shadowBlur = 0;
}

function drawTarget(target: Target, time: number): void {
  if (!target.alive) return;
  const x = target.x - cameraX;
  const bob = Math.sin(time * 3 + target.phase) * 4;
  ctx.save();
  ctx.translate(x, target.y + bob);
  ctx.rotate(time * .35 + target.phase);
  ctx.strokeStyle = "#ee5d54";
  ctx.lineWidth = 4;
  ctx.shadowColor = "rgba(238, 93, 84, .65)";
  ctx.shadowBlur = 16;
  ctx.beginPath(); ctx.arc(0, 0, target.r, 0, TAU); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-target.r - 5, 0); ctx.lineTo(target.r + 5, 0); ctx.moveTo(0, -target.r - 5); ctx.lineTo(0, target.r + 5); ctx.stroke();
  ctx.fillStyle = "#f6eee1";
  ctx.beginPath(); ctx.arc(0, 0, 4, 0, TAU); ctx.fill();
  ctx.restore();
}

function nearestTarget(): Target | undefined {
  return targets
    .filter((target) => target.alive && target.x >= section.start - 100)
    .sort((a, b) => Math.hypot(a.x - ninja.x, a.y - ninja.y) - Math.hypot(b.x - ninja.x, b.y - ninja.y))[0];
}

function drawTargetArrow(time: number): void {
  const target = nearestTarget();
  if (!target) return;
  const ninjaScreenX = ninja.x - cameraX;
  const targetScreenX = target.x - cameraX;
  const angle = Math.atan2(target.y - ninja.y, target.x - ninja.x);
  const targetOffscreen = targetScreenX < 35 || targetScreenX > width - 35 || target.y < 55 || target.y > height - 35;
  const radius = 49 + Math.sin(time * 5) * 3;
  const x = targetOffscreen
    ? Math.max(42, Math.min(width - 42, targetScreenX))
    : ninjaScreenX + Math.cos(angle) * radius;
  const y = targetOffscreen
    ? Math.max(68, Math.min(height - 42, target.y))
    : ninja.y + Math.sin(angle) * radius;

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = "#ee5d54";
  ctx.shadowColor = "rgba(238, 93, 84, .72)";
  ctx.shadowBlur = 12;
  ctx.globalAlpha = .84;
  ctx.beginPath();
  ctx.moveTo(11, 0);
  ctx.lineTo(-7, -8);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawLevelReveal(): void {
  if (levelReveal <= 0) return;
  const alpha = Math.min(.16, levelReveal * .11);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = "#f6eee1";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `800 ${Math.min(width * .27, 190)}px ui-monospace, monospace`;
  ctx.fillText(String(checkpoint).padStart(2, "0"), width * .5, height * .34);
  ctx.strokeStyle = "#f2c86b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(width * .2, height * .48);
  ctx.lineTo(width * .8, height * .48);
  ctx.stroke();
  ctx.restore();
}

function drawGate(time: number): void {
  const x = section.gate.x - cameraX;
  const ready = canClearCheckpoint(remainingTargets(), jumps);
  const colour = ready ? "#f2c86b" : "#ee5d54";
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.fillStyle = colour;
  ctx.lineWidth = 5;
  ctx.globalAlpha = ready ? .95 : .62;
  ctx.shadowColor = colour;
  ctx.shadowBlur = ready ? 22 + Math.sin(time * 5) * 5 : 8;
  ctx.beginPath();
  ctx.moveTo(x - 42, section.gate.y + section.gate.h);
  ctx.lineTo(x - 42, section.gate.y + 24);
  ctx.quadraticCurveTo(x, section.gate.y - 14, x + 42, section.gate.y + 24);
  ctx.lineTo(x + 42, section.gate.y + section.gate.h);
  ctx.stroke();
  if (!ready) {
    ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(x - 30, section.gate.y + 65); ctx.lineTo(x + 30, section.gate.y + 105); ctx.moveTo(x + 30, section.gate.y + 65); ctx.lineTo(x - 30, section.gate.y + 105); ctx.stroke();
  } else {
    ctx.beginPath(); ctx.arc(x, section.gate.y + 82, 7, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

function drawNinja(time: number): void {
  const x = ninja.x - cameraX;
  const y = ninja.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ninja.rotation);
  ctx.shadowColor = "rgba(0, 0, 0, .55)";
  ctx.shadowBlur = 15;
  ctx.fillStyle = "#060711";
  ctx.beginPath(); ctx.arc(0, 0, NINJA_RADIUS, 0, TAU); ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#24253a";
  ctx.beginPath(); ctx.arc(-4, -5, NINJA_RADIUS * .72, Math.PI, TAU); ctx.fill();
  ctx.fillStyle = "#ee5d54";
  ctx.fillRect(-18, -6, 36, 7);
  ctx.beginPath(); ctx.moveTo(14, -5); ctx.lineTo(30, -13); ctx.lineTo(20, 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = "#f6eee1";
  ctx.beginPath(); ctx.ellipse(-7, -3, 3.2, 1.8, 0, 0, TAU); ctx.ellipse(6, -3, 3.2, 1.8, 0, 0, TAU); ctx.fill();
  ctx.restore();
  if (ninja.stuck && !aiming) {
    const pulse = reducedMotion ? 1 : 1 + Math.sin(time * 3.6) * .12;
    ctx.strokeStyle = `rgba(246, 238, 225, ${firstMove ? .36 : .14})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(x, y, (NINJA_RADIUS + 13) * pulse, 0, TAU); ctx.stroke();
  }
}

function drawAim(): void {
  if (!aiming) return;
  const dx = ninja.x - pointer.x;
  const dy = ninja.y - pointer.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const power = Math.min(MAX_LAUNCH, distance * 5.1);
  let px = ninja.x;
  let py = ninja.y;
  const vx = dx / distance * power;
  let vy = dy / distance * power;
  ctx.strokeStyle = "rgba(238, 93, 84, .7)";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(ninja.x - cameraX, ninja.y); ctx.lineTo(pointer.x - cameraX, pointer.y); ctx.stroke();
  for (let i = 1; i <= 18; i += 1) {
    const dt = .055;
    vy += GRAVITY * dt;
    px += vx * dt;
    py += vy * dt;
    ctx.fillStyle = `rgba(242, 200, 107, ${1 - i / 22})`;
    ctx.beginPath(); ctx.arc(px - cameraX, py, Math.max(1.5, 4 - i * .11), 0, TAU); ctx.fill();
  }
}

function drawOpeningGesture(time: number): void {
  if (!firstMove || aiming || !ninja.stuck) return;
  const phase = (time * .48) % 1;
  const eased = phase < .75 ? phase / .75 : 1;
  const startX = ninja.x - cameraX;
  const startY = ninja.y;
  const x = startX - eased * 82;
  const y = startY + eased * 65;
  ctx.globalAlpha = phase > .78 ? 1 - (phase - .78) / .22 : .46;
  ctx.strokeStyle = "rgba(246, 238, 225, .36)";
  ctx.setLineDash([4, 7]);
  ctx.beginPath(); ctx.moveTo(startX, startY); ctx.lineTo(x, y); ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = "rgba(246, 238, 225, .82)";
  ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill();
  ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.stroke();
  ctx.globalAlpha = 1;
}

function drawClockBar(): void {
  const fraction = Math.max(0, Math.min(1, checkpointTimeLeft / secondsForCheckpoint(checkpoint)));
  ctx.fillStyle = "rgba(246, 238, 225, .08)";
  ctx.fillRect(0, 0, width, 4);
  ctx.fillStyle = fraction <= .18 ? "#ee5d54" : fraction <= .45 ? "#f2c86b" : "rgba(246, 238, 225, .5)";
  ctx.fillRect(0, 0, width * fraction, 4);
}

function drawHud(time: number): void {
  const pad = width < 520 ? 16 : 24;
  ctx.font = `600 ${width < 520 ? 15 : 17}px ui-monospace, monospace`;
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(246, 238, 225, .76)";
  ctx.textAlign = "left";
  const column = pad + 28;
  ctx.fillText(`◆ ${checkpoint}`, column, 32);
  const secondsLeft = Math.ceil(checkpointTimeLeft);
  const urgent = secondsLeft <= 8;
  ctx.fillStyle = urgent ? "#ee5d54" : "rgba(246, 238, 225, .58)";
  if (urgent && !reducedMotion) ctx.globalAlpha = .58 + Math.abs(Math.sin(time * 5.2)) * .42;
  ctx.fillText(`◷ ${formatTime(secondsLeft * 1_000)}`, column, 58);
  ctx.globalAlpha = 1;
  ctx.fillStyle = lives > 1 ? "rgba(238, 93, 84, .82)" : "#ee5d54";
  ctx.fillText(
    Array.from({ length: STARTING_LIVES }, (_, i) => (i < lives ? "●" : "○")).join(" "),
    column,
    84,
  );
  ctx.textAlign = "center";
  ctx.fillStyle = remainingTargets() === 0 ? "#f2c86b" : "rgba(238, 93, 84, .9)";
  ctx.fillText(`◎ ${section.targetCount - remainingTargets()}/${section.targetCount}`, width / 2, 32);
  ctx.textAlign = "right";
  const jumpGlyphs = width < 400 ? `✦ ${jumps}` : Array.from({ length: jumps }, () => "✦").join(" ");
  ctx.fillStyle = jumps > 1 ? "rgba(246, 238, 225, .76)" : "#ee5d54";
  ctx.fillText(jumpGlyphs, width - pad, 32);
  ctx.textAlign = "left";
}

function drawParticles(): void {
  for (const particle of particles) {
    ctx.globalAlpha = Math.min(1, particle.life * 2.2);
    ctx.fillStyle = particle.colour;
    ctx.fillRect(particle.x - cameraX, particle.y, 3, 3);
  }
  ctx.globalAlpha = 1;
}

function render(timeMs: number): void {
  const time = timeMs / 1000;
  ctx.save();
  ctx.translate(screenShake ? (Math.random() - .5) * screenShake : 0, screenShake ? (Math.random() - .5) * screenShake : 0);
  drawBackground(time);
  drawLevelReveal();
  for (const surface of surfaces) drawSurface(surface, time);
  for (const hazard of hazards) drawHazard(hazard);
  drawGate(time);
  for (const target of targets) drawTarget(target, time);
  drawAim();
  drawNinja(time);
  drawTargetArrow(time);
  drawOpeningGesture(time);
  drawParticles();
  drawClockBar();
  drawHud(time);
  if (flash > 0) {
    ctx.fillStyle = `rgba(238, 93, 84, ${flash * .35})`;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.restore();
}

function frame(now: number): void {
  const dt = Math.min(.025, Math.max(0, (now - lastTime) / 1000));
  lastTime = now;
  if (pausedAt === null) for (let i = 0; i < 2; i += 1) update(dt / 2);
  render(now);
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerUp);
restartButton.addEventListener("click", reset);
addEventListener("resize", resize);
addEventListener("keydown", (event) => {
  if (state === "dead" && (event.key === "Enter" || event.key === " ")) reset();
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden && pausedAt === null) {
    elapsedBeforePause += performance.now() - runStartedAt;
    pausedAt = performance.now();
  } else if (!document.hidden && pausedAt !== null) {
    runStartedAt = performance.now();
    pausedAt = null;
    lastTime = performance.now();
  }
});

resize();
reset();
requestAnimationFrame(frame);
