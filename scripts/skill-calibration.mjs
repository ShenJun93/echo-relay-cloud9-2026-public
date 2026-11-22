import { startGame, switchLane, tickGame, SPEED, PLAYER_X, ROUND_SECONDS } from "../src/game/engine.ts";

/** Deterministic bot is only an internal QA oracle, not an AI opponent or production bot. */
export function simulate(seed, policy = "idle") {
  let state = startGame(seed);
  let lastWave = -1;
  const seen = new Set();
  for (let frame = 0; frame < ROUND_SECONDS * 60; frame++) {
    if (policy === "spam" && frame % 15 === 0) state = switchLane(state);
    if (policy === "periodic" && frame % 45 === 0) state = switchLane(state);
    if (policy === "reactive") {
      const waves = new Map();
      for (const p of state.packets) {
        if (!p.resolved && p.x > PLAYER_X) {
          const arr = waves.get(p.wave) || [];
          arr.push(p);
          waves.set(p.wave, arr);
        }
      }
      const next = [...waves.values()].sort((a,b)=>a[0].x-b[0].x)[0];
      if (next && !seen.has(next[0].wave)) {
        const eta = (next[0].x - PLAYER_X)/SPEED;
        if (eta <= 0.33 && eta >= 0) {
          seen.add(next[0].wave);
          lastWave = next[0].wave;
          const signalLanes = next.filter(x=>x.kind==="signal").map(x=>x.lane);
          const hazardLanes = next.filter(x=>x.kind==="hazard").map(x=>x.lane);
          if (signalLanes.length===2
            || (signalLanes.length===1 && signalLanes[0]!==state.lane)
            || hazardLanes.includes(state.lane)) {
            state = switchLane(state);
          }
        }
      }
    }
    state = tickGame(state, 1/60);
  }
  return { score: state.score, hits: state.collected, echoes: state.echoCollected, links: state.dualLinks, misses: state.misses, glitches:state.glitches, bestCombo:state.bestCombo, lastWave };
}
const seeds=[0xe9c92026,20261120,1,42,777,2027];
for(const seed of seeds){
 const r={seed};
 for(const strategy of ["idle","periodic","spam","reactive"])r[strategy]=simulate(seed,strategy);
 console.log(JSON.stringify(r));
}
