import type { GameState, Lane } from "./engine";
import { ECHO_SECONDS, PLAYER_X, ROUND_SECONDS } from "./engine";

const WIDTH = 960;
const HEIGHT = 540;
const TRACK_Y: Record<Lane, number> = { 0: 201, 1: 341 };
const BLUE = "#65ddff";
const VIOLET = "#c3a3ff";
const GOLD = "#dcff81";
const CORAL = "#ff7b9f";
const PI2 = 2 * Math.PI;

function hash(n: number): number {
  // Only decorative randomness. Neither PRNG nor visual time can affect scoring.
  const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Four visual chapters use the clock only; there is no game-mode/rule branching. */
export function chapterFor(time: number) {
  if (time >= 45) return { label: "FINAL TRANSMISSION", color: CORAL, number: 4 };
  if (time >= 30) return { label: "HYPERDRIVE", color: GOLD, number: 3 };
  if (time >= 15) return { label: "DUAL FREQUENCY", color: VIOLET, number: 2 };
  return { label: "SIGNAL ACQUISITION", color: BLUE, number: 1 };
}

/** Deep field + fixed-projection rails. Draw after renderBackground but before track geometry. */
export function drawAtmosphere(ctx: CanvasRenderingContext2D, game: GameState, reduced: boolean, ambientTime = game.time) {
  const t = ambientTime;
  const active = game.status !== "finished";
  const chapter = chapterFor(t);
  const parallax = reduced || !active ? 0 : t;
  ctx.save();
  // The energy field grows more dramatic as the clock approaches zero.
  const bloom = ctx.createRadialGradient(740, 270, 30, 740, 270, 590);
  bloom.addColorStop(0, game.time > 44 ? "rgba(170,55,84,.15)" : game.time > 30 ? "rgba(134,174,52,.10)" : "rgba(45,152,216,.13)");
  bloom.addColorStop(0.54, "rgba(51,86,155,.042)");
  bloom.addColorStop(1, "rgba(3,12,28,0)");
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // 64 deterministic deep-space dust motes, at three speeds.
  for (let i = 0; i < 64; i++) {
    const depth = 1 + (i % 3);
    const baseX = 35 + hash(i + 18) * 885;
    const baseY = 34 + hash(i + 221) * 448;
    const x = 35 + ((baseX - 35 - parallax * depth * 6.2) % 885 + 885) % 885;
    const y = baseY;
    const glint = reduced ? 0.75 : 0.5 + 0.5 * Math.sin(t * (0.8 + depth * .2) + i * 2.7);
    ctx.fillStyle = i % 11 === 0 ? "rgba(212,253,138,.72)" : "rgba(156,216,251,.65)";
    ctx.globalAlpha = (0.11 + depth * 0.07) * glint;
    ctx.fillRect(x, y, 0.7 + depth * .5, 0.7 + depth * .5);
  }
  ctx.globalAlpha = 1;

  // Low-opacity telemetry silhouettes at the skyline; no stock sprites/images.
  ctx.strokeStyle = "rgba(77,150,198,.16)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 12; i++) {
    const width = 38 + hash(i * 3) * 70;
    const x = -35 + i * 91;
    const h = 22 + hash(i * 5 + 55) * 49;
    ctx.strokeRect(x, 418 - h, width, h);
    if (i % 3 === 0) {
      ctx.fillStyle = "rgba(85,171,226,.12)";
      ctx.fillRect(x + 9, 414 - h + 9, 2, 9);
    }
  }

  // Vertical light gates anchor the two lanes spatially.
  for (let i = 0; i < 6; i++) {
    const x = 95 + i * 152;
    ctx.strokeStyle = "rgba(98,163,207,.12)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, 96);
    ctx.lineTo(x, 414);
    ctx.stroke();
    for (const y of [117, 240, 298, 416]) {
      ctx.fillStyle = "rgba(114,202,238,.22)";
      ctx.fillRect(x - 2, y - 2, 4, 4);
    }
  }

  if (!reduced && active) {
    const framePulse = Math.sin(t * 2.1) * 0.04 + 0.08;
    ctx.globalAlpha = framePulse;
    ctx.fillStyle = chapter.color;
    ctx.fillRect(24, 101, WIDTH - 48, 1);
    ctx.fillRect(24, 416, WIDTH - 48, 1);
  }
  ctx.restore();
}

/** Scrolling energy strips make the game feel like a physical arcade machine. */
export function drawTrackFlux(ctx: CanvasRenderingContext2D, game: GameState, reduced: boolean, ambientTime = game.time) {
  const t = ambientTime;
  const tSpeed = reduced || game.status === "finished" ? 0 : t;
  ctx.save();
  for (const lane of [0, 1] as const) {
    const y = TRACK_Y[lane];
    const color = lane === 0 ? BLUE : VIOLET;
    // Pulse generator against the right side of each transit lane.
    ctx.strokeStyle = lane === 0 ? "rgba(84,211,255,.19)" : "rgba(202,156,255,.20)";
    ctx.lineWidth = 1;
    for (let x = 40; x < 940; x += 92) {
      const offset = (tSpeed * 53) % 92;
      const px = x - offset;
      if (px < 28 || px > 930) continue;
      ctx.beginPath();
      ctx.moveTo(px, y - 31);
      ctx.lineTo(px - 11, y);
      ctx.lineTo(px, y + 31);
      ctx.stroke();
    }
    ctx.shadowColor = color;
    ctx.shadowBlur = 9;
    ctx.globalAlpha = lane === game.lane ? .52 : .17;
    ctx.fillStyle = color;
    ctx.fillRect(24, y - 40, 5, 80);
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.font = "700 9px ui-monospace, Consolas, monospace";
    ctx.fillStyle = lane === game.lane ? color : "rgba(165,191,214,.45)";
    ctx.fillText(lane === 0 ? "PRIMARY CHANNEL" : "ECHO CHANNEL", 48, y + 52);
  }
  ctx.restore();
}

function thruster(ctx: CanvasRenderingContext2D, x: number, y: number, t: number, ghost: boolean, reduced: boolean) {
  const flicker = reduced ? 1 : 0.78 + Math.sin(t * 20) * .22;
  ctx.save();
  ctx.globalAlpha = ghost ? .27 : .77;
  const tail = ghost ? 33 : 38 + flicker * 13;
  const trail = ctx.createLinearGradient(x - tail - 22, y, x - 12, y);
  trail.addColorStop(0, "rgba(91,226,255,0)");
  trail.addColorStop(1, ghost ? "rgba(228,194,255,.76)" : "rgba(116,237,253,.83)");
  ctx.fillStyle = trail;
  ctx.beginPath();
  ctx.moveTo(x - 18, y - 8);
  ctx.lineTo(x - tail - 22, y);
  ctx.lineTo(x - 18, y + 8);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draw behind ship silhouettes for thrust plumes, phase tether and capture reticles. */
export function drawShipField(ctx: CanvasRenderingContext2D, game: GameState, reduced: boolean, ambientTime = game.time) {
  const t = ambientTime;
  const x = PLAYER_X * WIDTH;
  const y = TRACK_Y[game.lane];
  ctx.save();
  thruster(ctx, x, y, t, false, reduced);
  if (game.echo) {
    const ey = TRACK_Y[game.echo.lane];
    const life = Math.max(0, Math.min(1, (game.echo.until - t) / ECHO_SECONDS));
    thruster(ctx, x, ey, t, true, reduced);
    const chord = ctx.createLinearGradient(x, y, x, ey);
    chord.addColorStop(0, "rgba(107,227,255,.65)");
    chord.addColorStop(1, "rgba(212,159,255,.27)");
    ctx.globalAlpha = .26 + .6 * life;
    ctx.setLineDash([3, 7]);
    ctx.lineDashOffset = reduced ? 0 : -t * 29;
    ctx.strokeStyle = chord;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x + 39, y + (ey - y) * .34, x - 34, ey - (ey - y) * .31, x, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  const orbit = reduced ? 0 : t * 2.8;
  for (let i = 0; i < 4; i++) {
    const angle = orbit + (i * PI2) / 4;
    ctx.fillStyle = i % 2 ? GOLD : BLUE;
    ctx.globalAlpha = .35 + (game.combo > 4 ? .3 : 0);
    ctx.beginPath();
    ctx.arc(x + 39 * Math.cos(angle), y + 25 * Math.sin(angle), 1.8, 0, PI2);
    ctx.fill();
  }
  ctx.restore();
}

function shard(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, distance: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + Math.cos(angle) * distance, y + Math.sin(angle) * distance);
  ctx.lineWidth = size;
  ctx.stroke();
}

/** Short-lived event shards; no persistent particle arrays and no randomness per frame. */
export function drawHitParticles(ctx: CanvasRenderingContext2D, game: GameState, reduced: boolean) {
  ctx.save();
  const px = PLAYER_X * WIDTH;
  for (const impact of game.impacts) {
    const age = Math.max(0, game.time - impact.time);
    const lifetime = impact.kind === "dual" ? .68 : .46;
    if (age >= lifetime) continue;
    const life = Math.max(0, 1 - age / lifetime);
    const y = TRACK_Y[impact.lane];
    const color = impact.kind === "hazard" ? CORAL : impact.kind === "echo" ? VIOLET : impact.kind === "dual" ? GOLD : BLUE;
    ctx.strokeStyle = color;
    ctx.globalAlpha = reduced ? .16 : .88 * life;
    ctx.shadowColor = color;
    ctx.shadowBlur = reduced ? 0 : 9;
    if (!reduced) {
      const count = impact.kind === "dual" ? 17 : 9;
      for (let i = 0; i < count; i++) {
        const angle = PI2 * i / count + hash(i * 13) * .2;
        const distance = 11 + age * (120 + hash(i + 42) * 120);
        shard(ctx, px + Math.cos(angle) * distance, y + Math.sin(angle) * distance, angle, 9 * life, Math.max(1, 3 * life));
      }
    }
    ctx.beginPath();
    ctx.lineWidth = impact.kind === "dual" ? 3 : 1.5;
    ctx.arc(px, y, 20 + age * (impact.kind === "dual" ? 190 : 106), 0, PI2);
    ctx.stroke();
  }
  ctx.restore();
}

/** Game-independent overlay telemetry. Drawing not connected to scoring. */
export function drawTelemetry(ctx: CanvasRenderingContext2D, game: GameState, reduced: boolean) {
  const chapter = chapterFor(game.time);
  const multiplier = 1 + Math.floor(Math.min(9, Math.max(0, game.combo - 1)) / 3);
  const progress = game.status === "ready" ? 0 : game.time / ROUND_SECONDS;
  ctx.save();

  // Chapter breaks are part of the aesthetic, not distinct difficulty rules.
  ctx.font = "800 11px ui-monospace, Consolas, monospace";
  ctx.fillStyle = chapter.color;
  ctx.textAlign = "center";
  ctx.fillText(chapter.label, 480, 56);
  ctx.fillStyle = "rgba(187,207,231,.52)";
  ctx.font = "700 9px ui-monospace, Consolas, monospace";
  ctx.fillText("TRANSMISSION 0" + chapter.number + "/04", 480, 73);

  // Clear module around the active ship: the human uses this as the collision reference.
  const activeY = TRACK_Y[game.lane];
  const sx = PLAYER_X * WIDTH;
  ctx.strokeStyle = "rgba(143,239,255,.34)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx, activeY - 56);
  ctx.lineTo(sx, activeY - 44);
  ctx.moveTo(sx, activeY + 44);
  ctx.lineTo(sx, activeY + 56);
  ctx.stroke();

  const offset = reduced ? 0 : Math.sin(game.time * 3) * 2;
  ctx.fillStyle = game.combo >= 9 ? GOLD : "rgba(130,182,205,.83)";
  ctx.font = "800 11px ui-monospace, Consolas, monospace";
  ctx.textAlign = "right";
  ctx.fillText("COMBO x" + multiplier, 916, 104 + offset);

  // Four unmistakable chapters. Tiny ticks at 0/15/30/45/60sec in progress bar.
  for (let i = 1; i <= 3; i++) {
    const x = 24 + ((WIDTH - 48) * i) / 4;
    ctx.fillStyle = game.time >= i * 15 ? chapter.color : "rgba(185,209,233,.38)";
    ctx.fillRect(x - 1, 447, 2, 19);
  }
  if (game.status === "running" && progress > .76) {
    ctx.fillStyle = "rgba(255,139,163,.8)";
    ctx.font = "800 11px ui-monospace, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText("LAST SIGNAL // DON'T BREAK THE LINK", 480, 513);
  }
  ctx.restore();
}
