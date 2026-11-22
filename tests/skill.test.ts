import { describe, expect, it } from "vitest";
import {
  startGame, switchLane, tickGame,
  ROUND_SECONDS, SPEED, PLAYER_X, rankForScore,
  type GameState, type Packet,
} from "../src/game/engine";

type Bot = "idle" | "spam" | "reactive";

/**
 * Deterministic model-based QA policies, NOT human playtest evidence.
 * The reactive bot knows imminent packets and approximates optimal timing.
 */
function simulate(seed: number, bot: Bot): GameState {
  let state = startGame(seed);
  const acted = new Set<number>();
  for (let i = 0; i < ROUND_SECONDS * 60; i++) {
    if (bot === "spam" && i % 15 === 0) state = switchLane(state);
    if (bot === "reactive") {
      const waves = new Map<number, Packet[]>();
      for (const packet of state.packets) {
        if (packet.resolved || packet.x <= PLAYER_X) continue;
        const row = waves.get(packet.wave) ?? [];
        row.push(packet);
        waves.set(packet.wave, row);
      }
      const closest = [...waves.values()].sort((a, b) => a[0].x - b[0].x)[0];
      if (closest && !acted.has(closest[0].wave)) {
        const eta = (closest[0].x - PLAYER_X) / SPEED;
        if (eta > 0 && eta <= 0.13 && state.time >= state.nextFlipAt) {
          acted.add(closest[0].wave);
          const good = closest.filter(p => p.kind === "signal").map(p => p.lane);
          const bad = closest.filter(p => p.kind === "hazard").map(p => p.lane);
          if (good.length === 2 || (good.length === 1 && good[0] !== state.lane) || bad.includes(state.lane)) {
            state = switchLane(state);
          }
        }
      }
    }
    state = tickGame(state, 1 / 60);
  }
  return state;
}

const seeds = [0xe9c92026, 20261120, 1, 42, 777, 2027];

describe("P0 booth skill differential", () => {
  it("requires meaningful input: idle never reaches a top-tier result", () => {
    for (const seed of seeds) {
      const idle = simulate(seed, "idle");
      expect(idle.status).toBe("finished");
      expect(idle.score).toBeLessThan(8000);
      expect(rankForScore(idle.score)).toBe("FIRST CONTACT");
      expect(idle.dualLinks).toBe(0);
      expect(idle.misses).toBeGreaterThan(20);
      expect(idle.glitches).toBeGreaterThan(0);
    }
  });

  it("tests both lanes: the seed is not biased to a permanently safe lane", () => {
    let state = startGame(0xe9c92026);
    const packets = new Map<number, Packet>();
    for (let frame = 0; frame < 20 * 60; frame++) {
      state = tickGame(state, 1 / 60);
      for (const packet of state.packets) {
        if (!packets.has(packet.id)) packets.set(packet.id, packet);
      }
    }
    const tally = (kind: Packet["kind"], lane: 0 | 1) =>
      [...packets.values()].filter(p => p.kind === kind && p.lane === lane).length;
    expect(tally("signal", 0)).toBeGreaterThan(10);
    expect(tally("signal", 1)).toBeGreaterThan(10);
    expect(tally("hazard", 0)).toBeGreaterThan(2);
    expect(tally("hazard", 1)).toBeGreaterThan(2);
  });

  it("rewards timed play substantially over periodic switch spamming", () => {
    for (const seed of seeds) {
      const idle = simulate(seed, "idle");
      const spam = simulate(seed, "spam");
      const timed = simulate(seed, "reactive");
      expect(timed.score).toBeGreaterThan(idle.score * 4);
      expect(timed.score).toBeGreaterThan(spam.score * 1.25);
      expect(timed.echoCollected).toBeGreaterThan(15);
      expect(timed.dualLinks).toBeGreaterThan(15);
      expect(timed.glitches).toBeLessThanOrEqual(3);
      expect(timed.score).toBeGreaterThan(25000);
    }
  });

  it("keeps blind periodic lane-switching below skilled play on the event seed", () => {
    // The old spam bot pressed every 15 frames; it missed cooldown-aligned exploits.
    const seed = 0xe9c92026;
    const skilled = simulate(seed, "reactive");
    let highestBlind = 0;
    for (const period of [37, 38, 42, 45, 48, 54, 60, 72, 90, 120]) {
      for (let phase = 0; phase < period; phase++) {
        let state = startGame(seed);
        for (let frame = 0; frame < ROUND_SECONDS * 60; frame++) {
          if (frame >= phase && (frame - phase) % period === 0) {
            state = switchLane(state);
          }
          state = tickGame(state, 1 / 60);
        }
        highestBlind = Math.max(highestBlind, state.score);
      }
    }
    expect(highestBlind).toBeLessThan(skilled.score * 0.6);
  });
});
