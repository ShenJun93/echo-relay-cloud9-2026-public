/** Pure deterministic gameplay simulation. All dimensions are normalized to [0, 1]. */
export type Lane = 0 | 1;
export type PacketKind = "signal" | "hazard";
export type GameStatus = "ready" | "running" | "finished";

export interface Packet {
  id: number;
  wave: number;
  lane: Lane;
  kind: PacketKind;
  x: number;
  resolved: boolean;
}

export interface Impact {
  lane: Lane;
  time: number;
  kind: "signal" | "echo" | "hazard" | "dual";
  value: number;
}

export interface GameState {
  seed: number;
  rng: number;
  status: GameStatus;
  time: number;
  lane: Lane;
  echo: { lane: Lane; until: number } | null;
  nextFlipAt: number;
  nextSpawnAt: number;
  nextPacketId: number;
  nextWaveId: number;
  score: number;
  combo: number;
  bestCombo: number;
  integrity: number;
  collected: number;
  echoCollected: number;
  dualLinks: number;
  misses: number;
  glitches: number;
  lastCatch: { wave: number; lane: Lane } | null;
  lastFeedback: string;
  feedbackAt: number;
  packets: Packet[];
  impacts: Impact[];
}

export const ROUND_SECONDS = 60;
export const PLAYER_X = 0.225;
export const SPEED = 0.54;
export const ECHO_SECONDS = 0.33;
export const FLIP_COOLDOWN = 0.80;

/** Non-cryptographic deterministic RNG; NEVER used as security randomness. */
function randomStep(seed: number): number {
  return (Math.imul(seed, 1664525) + 1013904223) >>> 0;
}

export function createGame(seed = 20261120): GameState {
  const safeSeed = (Math.trunc(seed) >>> 0) || 1;
  return {
    seed: safeSeed, rng: safeSeed, status: "ready", time: 0,
    lane: 0, echo: null, nextFlipAt: 0, nextSpawnAt: 0.38,
    nextPacketId: 1, nextWaveId: 1, score: 0, combo: 0,
    bestCombo: 0, integrity: 4, collected: 0, echoCollected: 0,
    dualLinks: 0, misses: 0, glitches: 0, lastCatch: null,
    lastFeedback: "", feedbackAt: 0, packets: [], impacts: [],
  };
}

export function startGame(seed = 20261120): GameState {
  return { ...createGame(seed), status: "running" };
}

export function switchLane(game: GameState): GameState {
  if (game.status !== "running" || game.time < game.nextFlipAt) return game;
  const previous = game.lane;
  return {
    ...game,
    lane: previous === 0 ? 1 : 0,
    echo: { lane: previous, until: game.time + ECHO_SECONDS },
    nextFlipAt: game.time + FLIP_COOLDOWN,
  };
}

function spawnWave(game: GameState): void {
  game.rng = randomStep(game.rng);
  // Use higher PRNG bits: LCG low bits repeat predictably across two draws per wave.
  const pattern = (game.rng >>> 16) % 6;
  game.rng = randomStep(game.rng);
  const offset = (game.rng >>> 16) & 1;
  const wave = game.nextWaveId++;
  const insert = (lane: Lane, kind: PacketKind): void => {
    game.packets.push({
      id: game.nextPacketId++, wave, lane, kind, x: 1.06, resolved: false,
    });
  };
  if (pattern === 0 || pattern === 5) {
    // Double signal. A timed switch can capture both via the active ship + its echo.
    insert(0, "signal"); insert(1, "signal");
  } else if (pattern === 1 || pattern === 3) {
    // Every wave has at least one safe scoring lane; NEVER two simultaneous hazards.
    insert(offset as Lane, "signal"); insert((1 - offset) as Lane, "hazard");
  } else {
    insert(offset as Lane, "signal");
  }
  const pace = Math.max(0.61, 0.86 - 0.0035 * game.time);
  game.nextSpawnAt += pace;
}

function hit(game: GameState, packet: Packet, isEcho: boolean): void {
  packet.resolved = true;
  if (packet.kind === "hazard") {
    game.glitches++;
    game.combo = 0;
    game.integrity--;
    game.score = Math.max(0, game.score - 120);
    game.lastCatch = null;
    game.lastFeedback = "SIGNAL JAM";
    game.feedbackAt = game.time;
    game.impacts.push({ lane: packet.lane, time: game.time, kind: "hazard", value: -120 });
    if (game.integrity <= 0) {
      // Soft recovery keeps every booth round exactly 60 seconds.
      game.integrity = 3;
      game.score = Math.max(0, game.score - 250);
      game.lastFeedback = "REBOOT -250";
    }
    return;
  }

  game.collected++;
  if (isEcho) game.echoCollected++;
  game.combo = Math.min(99, game.combo + 1);
  game.bestCombo = Math.max(game.bestCombo, game.combo);
  const multiplier = 1 + Math.floor(Math.min(9, game.combo - 1) / 3);
  const earned = (isEcho ? 150 : 100) * multiplier;
  game.score += earned;
  game.lastFeedback = isEcho ? "ECHO CAPTURE" : "SIGNAL SECURED";
  game.feedbackAt = game.time;
  game.impacts.push({
    lane: packet.lane, time: game.time, kind: isEcho ? "echo" : "signal", value: earned,
  });
  if (game.lastCatch?.wave === packet.wave && game.lastCatch.lane !== packet.lane) {
    game.score += 250;
    game.dualLinks++;
    game.lastFeedback = "DUAL LINK +250";
    game.impacts.push({ lane: packet.lane, time: game.time, kind: "dual", value: 250 });
  }
  game.lastCatch = { wave: packet.wave, lane: packet.lane };
}

export function tickGame(game: GameState, dt: number): GameState {
  if (game.status !== "running" || !Number.isFinite(dt) || dt <= 0) return game;
  // Fixed-step caller should pass 1/60. Guard against accidental enormous deltas.
  const step = Math.min(dt, 0.25, ROUND_SECONDS - game.time);
  if (step <= 0) return { ...game, status: "finished" };
  const nextTime = game.time + step;
  const next: GameState = {
    ...game,
    time: nextTime,
    packets: game.packets.map(p => ({ ...p })),
    impacts: game.impacts.filter(p => nextTime - p.time < 0.68),
    echo: game.echo && game.echo.until >= nextTime ? game.echo : null,
  };

  while (next.nextSpawnAt <= nextTime) spawnWave(next);
  for (const packet of next.packets) {
    const previousX = packet.x;
    packet.x -= SPEED * step;
    if (packet.resolved || previousX < PLAYER_X || packet.x > PLAYER_X) continue;
    if (packet.lane === next.lane) {
      hit(next, packet, false);
    } else if (packet.kind === "signal" && next.echo?.lane === packet.lane) {
      hit(next, packet, true);
    } else {
      packet.resolved = true;
      if (packet.kind === "signal") {
        next.misses++;
        next.combo = 0;
        next.lastCatch = null;
      }
    }
  }
  next.packets = next.packets.filter(p => p.x > -0.08 && (!p.resolved || p.x > PLAYER_X - 0.10));
  if (next.time >= ROUND_SECONDS - 0.000001) {
    next.time = ROUND_SECONDS;
    next.status = "finished";
    next.echo = null;
    next.packets = [];
  }
  return next;
}

export function remainingSeconds(game: GameState): number {
  return Math.max(0, ROUND_SECONDS - game.time);
}

export function rankForScore(score: number): string {
  // Calibrated from deterministic idle / periodic / reactive test policies.
  if (score >= 35000) return "SIGNAL LEGEND";
  if (score >= 20000) return "ECHO ARCHITECT";
  if (score >= 8000) return "RELAY PILOT";
  return "FIRST CONTACT";
}
