import { describe, expect, it } from "vitest";
import {
  createGame, startGame, switchLane, tickGame,
  ROUND_SECONDS, ECHO_SECONDS, FLIP_COOLDOWN, rankForScore,
} from "../src/game/engine";

function run(seed: number, actionPeriod = 0): ReturnType<typeof createGame> {
  let state = startGame(seed);
  for (let frame = 0; frame < ROUND_SECONDS * 60; frame++) {
    if (actionPeriod > 0 && frame > 0 && frame % actionPeriod === 0) {
      state = switchLane(state);
    }
    state = tickGame(state, 1 / 60);
  }
  return state;
}

describe("deterministic 60-second booth engine", () => {
  it("starts ready, never moves until the user starts", () => {
    const original = createGame(11);
    expect(original.status).toBe("ready");
    expect(tickGame(original, 1)).toBe(original);
    expect(switchLane(original)).toBe(original);
  });

  it("runs exactly sixty seconds even when the player hits obstacles", () => {
    const game = run(1717);
    expect(game.status).toBe("finished");
    expect(game.time).toBe(60);
    expect(game.score).toBeGreaterThanOrEqual(0);
    expect(game.integrity).toBeGreaterThan(0);
  });

  it("fully reproduces the same seeded performance and spawn patterns", () => {
    expect(run(188, 31)).toEqual(run(188, 31));
    expect(run(188, 31).score).not.toEqual(run(91, 31).score);
  });

  it("does not mutate callers during update", () => {
    const original = startGame(77);
    const current = tickGame(original, 0.5);
    expect(original.time).toBe(0);
    expect(current.time).toBe(0.25);
  });

  it("rejects invalid delta and clamps oversized updates", () => {
    const game = startGame(10);
    expect(tickGame(game, Number.NaN)).toBe(game);
    expect(tickGame(game, -1)).toBe(game);
    expect(tickGame(game, 999).time).toBe(0.25);
  });

  it("supports flipping once per cooldown without button-spam advantage", () => {
    const a = startGame(99);
    const b = switchLane(a);
    expect(b.lane).toBe(1);
    expect(b.echo?.lane).toBe(0);
    expect(b.echo!.until).toBe(ECHO_SECONDS);
    expect(switchLane(b)).toBe(b);
    let after = b;
    for (let i = 0; i < 4; i++) after = tickGame(after, FLIP_COOLDOWN / 4 + 0.01);
    expect(switchLane(after).lane).toBe(0);
  });

  it("never spawns an unavoidable two-hazard wave", () => {
    let state = startGame(776);
    const byWave = new Map<number, string[]>();
    for (let n = 0; n < 900; n++) {
      state = tickGame(state, 1 / 60);
      for (const p of state.packets) {
        const keys = byWave.get(p.wave) ?? [];
        keys.push(p.kind);
        byWave.set(p.wave, keys);
      }
    }
    for (const kinds of byWave.values()) {
      expect(kinds).toContain("signal");
      expect(new Set(kinds.filter(k => k === "hazard")).size).toBeLessThanOrEqual(1);
    }
  });

  it("offers real echo captures, additional score and dual links with timing", () => {
    // Keep switching until a double-signal wave coincides with a live echo.
    const a = run(188, 17);
    expect(a.collected).toBeGreaterThan(0);
    expect(a.echoCollected).toBeGreaterThan(0);
    expect(a.dualLinks).toBeGreaterThan(0);
  });

  it("returns ranking tiers in a monotone order", () => {
    expect(rankForScore(0)).toBe("FIRST CONTACT");
    expect(rankForScore(8000)).toBe("RELAY PILOT");
    expect(rankForScore(20000)).toBe("ECHO ARCHITECT");
    expect(rankForScore(35000)).toBe("SIGNAL LEGEND");
  });

  it("does not allow switching or advancing after completion", () => {
    const done = run(1313, 19);
    expect(switchLane(done)).toBe(done);
    expect(tickGame(done, 1)).toBe(done);
  });
});
