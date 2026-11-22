import type { GameState, Lane, Packet } from "./engine";
import { ECHO_SECONDS, PLAYER_X, ROUND_SECONDS, remainingSeconds } from "./engine";
import { drawAtmosphere, drawTrackFlux, drawShipField, drawHitParticles, drawTelemetry } from "./visuals";

export const VIEW_W = 960;
export const VIEW_H = 540;
const LANE_Y: Record<Lane, number> = { 0: 201, 1: 341 };

const CYAN = "#65e0ff";
const LIME = "#d8fd7b";
const PINK = "#ff6c92";

function polygon(ctx: CanvasRenderingContext2D, points: Array<[number, number]>, fill: string, stroke: string, width = 2) {
  ctx.beginPath();
  points.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
  ctx.closePath();
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = width;
  ctx.stroke();
}

function neonLine(ctx: CanvasRenderingContext2D, y: number, color: string, time: number, reduced: boolean) {
  const top = y - 38;
  const bottom = y + 38;
  const bg = ctx.createLinearGradient(42, top, VIEW_W - 42, bottom);
  bg.addColorStop(0, "rgba(29,45,70,.22)");
  bg.addColorStop(0.53, "rgba(16,34,58,.38)");
  bg.addColorStop(1, "rgba(9,19,32,.78)");
  ctx.fillStyle = bg;
  ctx.fillRect(24, top, VIEW_W - 48, bottom - top);
  ctx.strokeStyle = "rgba(135,175,213,.12)";
  ctx.lineWidth = 1;
  ctx.strokeRect(24, top, VIEW_W - 48, bottom - top);
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = color;
  ctx.globalAlpha = .34;
  ctx.beginPath();
  ctx.moveTo(25, y);
  ctx.lineTo(VIEW_W - 25, y);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = "rgba(196,218,246,.18)";
  for (let x = 56; x < VIEW_W - 35; x += 48) {
    const offset = reduced ? 0 : (time * 36) % 48;
    ctx.fillRect((x - offset + 48) % VIEW_W, y - 1, 17, 2);
  }
}

function packetShape(ctx: CanvasRenderingContext2D, packet: Packet) {
  const x = packet.x * VIEW_W;
  const y = LANE_Y[packet.lane];
  const hazard = packet.kind === "hazard";
  const stroke = hazard ? PINK : LIME;
  const radius = hazard ? 15 : 13;
  ctx.save();
  ctx.translate(x, y);
  ctx.shadowColor = stroke;
  ctx.shadowBlur = packet.resolved ? 2 : 17;
  ctx.globalAlpha = packet.resolved ? 0.2 : 1;
  if (hazard) {
    polygon(ctx, [[-radius, -radius], [radius, -radius], [radius, radius], [-radius, radius]], "rgba(75,22,48,.9)", stroke, 2.5);
    ctx.strokeStyle = "#ffd4df";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -6); ctx.lineTo(6, 6);
    ctx.moveTo(6, -6); ctx.lineTo(-6, 6); ctx.stroke();
  } else {
    polygon(ctx, [[0, -radius - 4], [radius + 4, 0], [0, radius + 4], [-radius - 4, 0]], "rgba(167,220,95,.16)", stroke, 2.5);
    ctx.fillStyle = "#f2ffd0";
    ctx.beginPath(); ctx.arc(0, 0, 4, 0, 2 * Math.PI); ctx.fill();
    ctx.globalAlpha = .24;
    ctx.fillStyle = stroke;
    ctx.fillRect(14, -2, 40, 4);
  }
  ctx.restore();
}

function ship(ctx: CanvasRenderingContext2D, lane: Lane, ghost: boolean, glowAmount = 1) {
  const x = PLAYER_X * VIEW_W;
  const y = LANE_Y[lane];
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha = ghost ? Math.min(.75, glowAmount * .72) : 1;
  ctx.shadowColor = ghost ? "#f6b5ff" : CYAN;
  ctx.shadowBlur = ghost ? 20 : 27;
  polygon(ctx, [[-24, 0], [-6, -18], [25, 0], [-6, 18]], ghost ? "rgba(160,86,194,.13)" : "#154b69", ghost ? "#cba9fb" : CYAN, ghost ? 1.5 : 2.7);
  ctx.shadowBlur = 0;
  polygon(ctx, [[-12, 0], [4, -8], [16, 0], [4, 8]], ghost ? "rgba(240,198,255,.15)" : "#d7fdff", ghost ? "#cfb6e9" : "#e0ffff", 1);
  ctx.strokeStyle = ghost ? "rgba(220,170,255,.45)" : "rgba(101,224,255,.5)";
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(0, 0, 32, -.7, .7); ctx.stroke();
  ctx.restore();
}

function renderBackground(ctx: CanvasRenderingContext2D, time: number, reduced: boolean) {
  const bg = ctx.createLinearGradient(0, 0, VIEW_W, VIEW_H);
  bg.addColorStop(0, "#071120");
  bg.addColorStop(.55, "#081a30");
  bg.addColorStop(1, "#0a1021");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
  const pulse = reduced ? .13 : (.12 + .04 * Math.sin(time * .6));
  ctx.strokeStyle = "rgba(105,177,230," + pulse + ")";
  ctx.lineWidth = 1;
  for (let x = 0; x < VIEW_W; x += 48) {
    ctx.beginPath(); ctx.moveTo(x, 30); ctx.lineTo(x, VIEW_H - 25); ctx.stroke();
  }
  for (let y = 35; y < VIEW_H - 20; y += 48) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(VIEW_W, y); ctx.stroke();
  }
  const halo = ctx.createRadialGradient(245, VIEW_H / 2, 4, 245, VIEW_H / 2, 340);
  halo.addColorStop(0, "rgba(35,138,194,.13)");
  halo.addColorStop(1, "rgba(2,8,15,0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);
}

function renderImpact(ctx: CanvasRenderingContext2D, x: number, y: number, impact: GameState["impacts"][number], age: number, reduced: boolean) {
  const color = impact.kind === "hazard" ? PINK : impact.kind === "dual" ? LIME : impact.kind === "echo" ? "#c9a5ff" : CYAN;
  const alpha = Math.max(0, 1 - age / .68);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, reduced ? 26 : 17 + age * 70, 0, 2 * Math.PI);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.font = "700 16px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText((impact.value > 0 ? "+" : "") + impact.value, x + 43, y - 35 - (reduced ? 0 : age * 30));
  ctx.restore();
}

export function paint(ctx: CanvasRenderingContext2D, game: GameState, reducedMotion = false, wallTime = game.time) {
  ctx.clearRect(0, 0, VIEW_W, VIEW_H);
  const time = game.status === "ready" ? wallTime : game.time;
  renderBackground(ctx, time, reducedMotion);
  drawAtmosphere(ctx, game, reducedMotion, time);
  neonLine(ctx, LANE_Y[0], CYAN, time, reducedMotion);
  neonLine(ctx, LANE_Y[1], "#af9afd", time, reducedMotion);
  drawTrackFlux(ctx, game, reducedMotion, time);

  ctx.save();
  ctx.strokeStyle = "rgba(205,250,255,.34)";
  ctx.setLineDash([5, 7]);
  ctx.beginPath();
  ctx.moveTo(PLAYER_X * VIEW_W, 105);
  ctx.lineTo(PLAYER_X * VIEW_W, 421);
  ctx.stroke();
  ctx.restore();

  for (const p of game.packets) packetShape(ctx, p);
  if (game.echo) {
    const ageFraction = Math.max(0, (game.echo.until - game.time) / ECHO_SECONDS);
    ship(ctx, game.echo.lane, true, ageFraction);
    ctx.fillStyle = "rgba(217,181,255,.72)";
    ctx.font = "700 11px system-ui";
    ctx.fillText("AFTERIMAGE", 122, LANE_Y[game.echo.lane] - 47);
  }
  ship(ctx, game.lane, false);
  drawShipField(ctx, game, reducedMotion, time);

  drawHitParticles(ctx, game, reducedMotion);
  for (const impact of game.impacts) {
    renderImpact(ctx, PLAYER_X * VIEW_W, LANE_Y[impact.lane], impact, Math.max(0, game.time - impact.time), reducedMotion);
  }

  const progress = game.status === "ready" ? 0 : game.time / ROUND_SECONDS;
  ctx.fillStyle = "rgba(175,208,238,.12)";
  ctx.fillRect(24, 454, VIEW_W - 48, 5);
  ctx.fillStyle = progress > .75 ? LIME : CYAN;
  ctx.fillRect(24, 454, (VIEW_W - 48) * progress, 5);

  ctx.font = "700 12px system-ui";
  ctx.fillStyle = "rgba(201,224,242,.64)";
  ctx.fillText("A / SIGNAL", 42, 148);
  ctx.fillText("B / ECHO", 42, 289);
  ctx.fillStyle = game.status === "finished" ? LIME : "rgba(195,221,251,.46)";
  ctx.textAlign = "right";
  ctx.fillText(Math.ceil(remainingSeconds(game)).toString().padStart(2, "0") + " SEC", VIEW_W - 38, 494);
  ctx.textAlign = "left";

  drawTelemetry(ctx, game, reducedMotion);
  if (game.status === "running" && game.time - game.feedbackAt < .65) {
    const age = game.time - game.feedbackAt;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - age / .65);
    ctx.font = "800 18px system-ui";
    ctx.fillStyle = game.lastFeedback.startsWith("SIGNAL JAM") || game.lastFeedback.startsWith("REBOOT") ? PINK : LIME;
    ctx.textAlign = "center";
    ctx.fillText(game.lastFeedback, VIEW_W * .55, 90);
    ctx.restore();
  }
}

export function drawTitleBackdrop(ctx: CanvasRenderingContext2D) {
  const placeholder = {
    ...({ status: "ready", time: 0, packets: [], echo: null, lane: 0, impacts: [] } as unknown as GameState),
  };
  paint(ctx, placeholder, true);
  ctx.save();
  ctx.globalAlpha = .28;
  for (let x = 420; x < 960; x += 90) {
    ctx.fillStyle = x % 180 ? LIME : PINK;
    ctx.beginPath(); ctx.arc(x, 201, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 40, 341, 5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.restore();
}

/** Silent, scripted READY-only teaching sequence. No engine state, scores or timers. */
export function drawReadyAttract(ctx: CanvasRenderingContext2D, seconds: number, reducedMotion = false): void {
  const phase = reducedMotion ? 3.8 : ((seconds % 6) + 6) % 6;
  const switched = phase >= 1.5;
  const linked = phase >= 3.2 && phase < 5.1;
  const x = 734;
  const top = 201;
  const bottom = 341;

  ctx.save();
  ctx.fillStyle = "rgba(4, 14, 29, .9)";
  ctx.fillRect(527, 110, 410, 300);
  ctx.strokeStyle = "rgba(140, 194, 225, .32)";
  ctx.lineWidth = 1.4;
  ctx.strokeRect(527, 110, 410, 300);

  ctx.fillStyle = "#d7fd85";
  ctx.font = "800 16px system-ui, sans-serif";
  ctx.fillText("HOW THE ECHO WORKS", 550, 143);
  ctx.fillStyle = "#abcbe0";
  ctx.font = "700 11px system-ui, sans-serif";
  ctx.fillText("SLOW-MOTION EXAMPLE - NO POINTS AWARDED", 550, 161);

  for (const [lane, color, label] of [
    [top, "#65e0ff", "A"],
    [bottom, "#b6a4ff", "B"],
  ] as const) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = .55;
    ctx.beginPath();
    ctx.moveTo(551, lane);
    ctx.lineTo(910, lane);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = color;
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.fillText(label, 554, lane - 14);
  }

  const drawDemoShip = (y: number, echo: boolean) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.shadowColor = echo ? "#d5b3ff" : "#65e0ff";
    ctx.shadowBlur = 14;
    polygon(ctx, [[-21, 0], [-5, -15], [21, 0], [-5, 15]],
        echo ? "rgba(155, 112, 195, .23)" : "#15536d",
        echo ? "#d5b3ff" : "#65e0ff", 2.2);
    ctx.restore();
  };

  drawDemoShip(switched ? bottom : top, false);
  if (switched) {
    drawDemoShip(top, true);
    ctx.fillStyle = "#d5b3ff";
    ctx.font = "800 12px system-ui, sans-serif";
    ctx.fillText("ECHO", 755, top - 24);
  }

  if (!linked) {
    const px = Math.max(751, 911 - phase * 50);
    for (const y of [top, bottom]) {
      ctx.save();
      ctx.translate(px, y);
      ctx.shadowColor = "#d7fd85";
      ctx.shadowBlur = 12;
      polygon(ctx, [[0, -12], [12, 0], [0, 12], [-12, 0]],
          "rgba(181, 240, 112, .18)", "#d7fd85", 2);
      ctx.restore();
    }
  }

  ctx.fillStyle = linked ? "#d7fd85" : "#eff8ff";
  ctx.font = "900 16px system-ui, sans-serif";
  ctx.fillText(linked ? "DUAL LINK +250" :
      switched ? "SHIP + ECHO = TWO CATCHES" : "ONE SHIP / TWO SIGNALS", 550, 383);
  ctx.restore();
}
