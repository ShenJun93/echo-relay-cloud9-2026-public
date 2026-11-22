import { describe, expect, it } from "vitest";
import { startGame, switchLane, tickGame, ROUND_SECONDS } from "../src/game/engine";

function play(seed: number, pattern: "idle" | "periodic") {
  let state = startGame(seed);
  let peakPackets = 0;
  for (let frame = 0; frame < ROUND_SECONDS * 60; frame++) {
    if (pattern === "periodic" && frame % 45 === 0) state = switchLane(state);
    state = tickGame(state, 1 / 60);
    peakPackets = Math.max(peakPackets, state.packets.length);
    if (!Number.isFinite(state.score) || state.score < 0 ||
      state.packets.some(p => !Number.isFinite(p.x))) {
      throw new Error("Invalid simulation state for seed " + seed + " frame " + frame);
    }
  }
  return { state, peakPackets };
}

describe("P2 booth soak: 100 independent fixed-duration rounds", () => {
  it("finishes every round with bounded packet memory and valid scores", () => {
    const scenarios = Array.from({ length: 100 }, (_, i) => 1000 + i * 7919);
    for (const [index, seed] of scenarios.entries()) {
      const { state, peakPackets } = play(seed, index % 2 ? "periodic" : "idle");
      expect(state.status).toBe("finished");
      expect(state.time).toBe(60);
      expect(state.packets).toHaveLength(0);
      expect(state.impacts.length).toBeLessThan(20);
      expect(state.integrity).toBeGreaterThan(0);
      expect(state.score).toBeGreaterThanOrEqual(0);
      expect(peakPackets).toBeLessThan(10);
    }
  });

  it("never leaks score, combo, or frame state into a new round", () => {
    const a = play(42, "periodic").state;
    const b = startGame(42);
    expect(a.status).toBe("finished");
    expect(b.score).toBe(0);
    expect(b.combo).toBe(0);
    expect(b.packets).toHaveLength(0);
    expect(b.time).toBe(0);
    expect(b.status).toBe("running");
  });
});
