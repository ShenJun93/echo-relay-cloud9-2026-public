import "./style.css";
import { createGame, startGame, switchLane, tickGame, remainingSeconds, rankForScore, type GameState } from "./game/engine";
import { VIEW_W, VIEW_H, paint, drawReadyAttract, drawTitleBackdrop } from "./game/render";
import { chapterFor } from "./game/visuals";
import { ArcadeAudio } from "./game/audio";

const GAME_SEED = 0xe9c92026;
// Balance revision: keep historic scores from the old timing rules separate.
const BOARD_KEY = "echo-relay-booth-scores-v3";
type Entry = { score: number; echoes: number; duals: number; stamped: number };

function readBoard(): Entry[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(BOARD_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    return raw
        .filter((r): r is Entry =>
            !!r && typeof r === "object" &&
            Number.isFinite(r.score) && r.score >= 0 && r.score < 10000000 &&
            Number.isFinite(r.echoes) && Number.isFinite(r.duals) && Number.isFinite(r.stamped))
        .slice(0, 5).sort((a, b) => b.score - a.score);
  } catch { return []; }
}
function writeBoard(game: GameState): Entry[] {
  const next = [...readBoard(), {
    score: game.score, echoes: game.echoCollected,
    duals: game.dualLinks, stamped: Date.now(),
  }].sort((a, b) => b.score - a.score).slice(0, 5);
  try { localStorage.setItem(BOARD_KEY, JSON.stringify(next)); } catch { /* private browsing */ }
  return next;
}
function format(num: number): string {
  return Math.trunc(num).toLocaleString("en-US");
}

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("Missing app container");
app.innerHTML = `
  <div class="shell">
    <header class="brandline">
      <div class="brand-lockup" aria-label="Echo Relay">
        <span class="brand-icon" aria-hidden="true"><span></span><span></span></span>
        <span>ECHO<span class="slashes">//</span>RELAY</span>
      </div>
      <div class="brand-meta"><span class="dot-live"></span> ONE-MINUTE ARCADE <span class="divider-pipe">/</span> EVENT BUILD 01</div>
      <div class="utility-buttons"><button id="fullscreen-button" class="icon-button" type="button" aria-label="FULL SCREEN — enter booth mode">FULL SCREEN</button>
      <button id="sound-button" class="icon-button" type="button" aria-label="SOUND OFF — enable original sound effects" aria-pressed="false">SOUND OFF</button></div>
    </header>

    <section class="hero">
      <div class="intro-copy">
        <span class="intro-index">01 / THE TWO-TIMELINE CHALLENGE</span>
        <h1>ONE SWITCH.<br><em>TWO SELVES.</em></h1>
        <p>Switch tracks to collect bright signals. Your <strong>afterimage</strong> stays behind briefly, catching what you leave behind.</p>
      </div>
      <div class="mini-manual">
        <div class="mini-manual-head"><span>HOW TO PLAY</span><span>60 SEC</span></div>
        <div><b class="keycap">SPACE</b><span>Switch channels</span></div>
        <div><span class="legend-diamond">◆</span><span>Collect signals</span></div>
        <div><span class="legend-cross">✕</span><span>Avoid glitches</span></div>
        <div><span class="legend-echo">◌</span><span>Catch with your echo</span></div>
      </div>
    </section>

    <main>
      <div class="arena-shell" id="arena-shell">
        <div class="arena-top"><span><i class="active-bullet"></i> SIGNAL FIELD <b>/</b> 001</span><span id="chapter-label">PHASE 01 / 04</span><span id="arena-status">AWAITING PLAYER</span></div>
        <canvas id="arena" width="960" height="540" tabindex="0" aria-label="Arcade field with two lanes. Press Space or touch SWITCH to change lanes." role="img"></canvas>
        <div class="stage-overlay" id="overlay">
          <div class="overlay-body" id="overlay-body">
            <div class="overlay-kicker">A NEW RULE OF REACTION</div>
            <div class="overlay-headline">YOUR PAST<br><span>PLAYS TOO.</span></div>
            <p>Press <strong>SPACE</strong> or tap the field to switch lanes.<br>Your echo catches the old lane. Catch both for +250.</p>
            <div class="tutorial-steps" aria-label="Three-step guide to catching a Dual Link">
              <span><b>01</b> SEE TWO SIGNALS</span><i aria-hidden="true">/</i>
              <span><b>02</b> PRESS SPACE TO SWITCH</span><i aria-hidden="true">/</i>
              <span><b>03</b> CATCH BOTH +250</span>
            </div>
            <button type="button" id="start-button" class="primary-button"><span>START 60-SECOND RUN</span><span aria-hidden="true">↗</span></button>
            <span class="microcopy">NO LOGIN · NO DOWNLOAD · SAME CHALLENGE FOR EVERY PLAYER</span>
          </div>
        </div>
        <div class="stage-caption"><span>LIVE SIGNAL FEED</span><span>ONE KEY · TWO TRACKS · ENDLESS REPLAY</span></div>
      </div>

      <div class="dashboard">
        <div class="metrics" aria-label="Live game statistics">
          <div class="metric"><span>YOUR SCORE</span><strong id="score">000000</strong></div>
          <div class="metric"><span>COMBO</span><strong id="combo">x0</strong></div>
          <div class="metric"><span>DUAL LINKS</span><strong id="duals">00</strong></div>
          <div class="metric"><span>INTEGRITY</span><strong id="integrity">▮▮▮▮</strong></div>
          <div class="metric"><span>TIME LEFT</span><strong id="time-left">60.0</strong></div>
        </div>
        <button class="swap-button" type="button" id="switch-button" ><span class="swap-glyph" aria-hidden="true">⇅</span><span>SWITCH<br>CHANNEL</span><small aria-hidden="true">SPACE / TAP</small></button>
      </div>

      <div class="bottom-grid">
        <section class="board-panel">
          <div class="section-heading"><span>LOCAL HIGH SCORES</span><span>TOP 05</span></div>
          <ol id="leaderboard"><li class="board-empty">NO RUNS YET. BE THE FIRST.</li></ol>
          <div class="board-bottom"><span class="fineprint">Anonymous scores stored on this device only. Not a verified online leaderboard.</span><button type="button" id="board-clear" class="text-button" aria-label="CLEAR SCORES — remove local high scores">CLEAR SCORES</button></div>
        </section>
        <aside class="design-note">
          <span>THE SECRET WEAPON</span>
          <strong>PLAY WHERE<br>YOU WERE.</strong>
          <p>Hit Space just before a pair arrives. Your echo stays on the old lane while you catch the new one.</p>
          <div class="note-line">+250 DUAL LINK <span>↗</span></div>
        </aside>
      </div>
    </main>
    <footer><span>ECHO//RELAY <span class="footer-quiet">/ ORIGINAL EVENT ARCADE</span></span><span id="offline-status" role="status" aria-live="polite">LOCAL BOOTH</span><span>KEYBOARD + TOUCH <i>·</i> NO EXTERNAL ASSETS</span></footer>
    <div id="announcer" class="sr-only" role="status" aria-live="polite"></div>
  </div>
`;

const maybeCanvas = document.querySelector<HTMLCanvasElement>("#arena");
if (!maybeCanvas) throw new Error("Canvas unavailable");
const canvas: HTMLCanvasElement = maybeCanvas;
const maybeCtx = canvas.getContext("2d", { alpha: false });
if (!maybeCtx) throw new Error("Canvas 2D unavailable");
const ctx: CanvasRenderingContext2D = maybeCtx;
canvas.width = VIEW_W;
canvas.height = VIEW_H;
const overlay = document.querySelector<HTMLDivElement>("#overlay")!;
const overlayBody = document.querySelector<HTMLDivElement>("#overlay-body")!;
const readyKicker = overlayBody.querySelector<HTMLElement>(".overlay-kicker");
const startButton = document.querySelector<HTMLButtonElement>("#start-button")!;
const switchButton = document.querySelector<HTMLButtonElement>("#switch-button")!;
const soundButton = document.querySelector<HTMLButtonElement>("#sound-button")!;
const fullscreenButton = document.querySelector<HTMLButtonElement>("#fullscreen-button")!;
const boardClearButton = document.querySelector<HTMLButtonElement>("#board-clear")!;
const announcer = document.querySelector<HTMLDivElement>("#announcer")!;
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
let game = createGame(GAME_SEED);
let readyVisibleTime = 0;
let accumulator = 0;
let previousFrame: number | null = null;
let boardSaved = false;
const audioFx = new ArcadeAudio();
let lastAnnouncementAt = -10;
let clearPending = false;
let clearTimer: ReturnType<typeof setTimeout> | null = null;

function boardList() {
  const ol = document.querySelector<HTMLOListElement>("#leaderboard")!;
  ol.replaceChildren();
  const scores = readBoard();
  if (!scores.length) {
    const li = document.createElement("li");
    li.className = "board-empty";
    li.textContent = "NO RUNS YET. BE THE FIRST.";
    ol.appendChild(li);
    return;
  }
  for (const [index, s] of scores.entries()) {
    const li = document.createElement("li");
    const position = document.createElement("span");
    position.textContent = String(index + 1).padStart(2, "0");
    const summary = document.createElement("span");
    summary.textContent = s.duals + " DUAL LINKS";
    const score = document.createElement("strong");
    score.textContent = format(s.score);
    li.append(position, summary, score);
    ol.appendChild(li);
  }
}

function updateHud() {
  document.querySelector("#score")!.textContent = format(game.score).padStart(6, "0");
  document.querySelector("#combo")!.textContent = "x" + game.combo;
  document.querySelector("#duals")!.textContent = String(game.dualLinks).padStart(2, "0");
  document.querySelector("#integrity")!.textContent = "▮".repeat(game.integrity) + "▯".repeat(4 - Math.min(game.integrity, 4));
  document.querySelector("#time-left")!.textContent = remainingSeconds(game).toFixed(1);
  document.querySelector("#arena-status")!.textContent = game.status === "running" ? "LINK ACTIVE" : game.status === "finished" ? "RUN COMPLETE" : "AWAITING PLAYER";
  document.querySelector("#chapter-label")!.textContent = "PHASE 0" + chapterFor(game.time).number + " / 04";
  switchButton.disabled = game.status !== "running";
}

function start() {
  game = startGame(GAME_SEED);
  readyVisibleTime = 0;
  overlay.classList.remove("attract-mode");
  accumulator = 0;
  previousFrame = null;
  boardSaved = false;
  lastAnnouncementAt = -10;
  overlayBody.classList.remove("result-layout");
  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
  announcer.textContent = "Run started. Press Space or tap Switch to change lane.";
  canvas.focus({ preventScroll: true });
  audioFx.play("switch");
  updateHud();
}

function finish() {
  if (boardSaved) return;
  boardSaved = true;
  const oldBest = readBoard()[0]?.score ?? -1;
  const personalBest = game.score > oldBest;
  writeBoard(game);
  boardList();
  overlayBody.replaceChildren();
  overlayBody.classList.add("result-layout");

  const kicker = document.createElement("div");
  kicker.className = "overlay-kicker";
  kicker.textContent = personalBest ? "NEW LOCAL RECORD // TRANSMISSION COMPLETE" : "TRANSMISSION COMPLETE // 60 SECONDS";

  const title = document.createElement("div");
  title.className = "overlay-headline result-score";
  title.textContent = format(game.score);
  title.setAttribute("aria-label", "Final score " + game.score);

  const medal = document.createElement("div");
  medal.className = "result-rank";
  medal.textContent = rankForScore(game.score);

  const stats = document.createElement("div");
  stats.className = "result-stats";
  const statValues: Array<[string, string]> = [
    ["DUAL LINKS", String(game.dualLinks).padStart(2, "0")],
    ["ECHO CATCHES", String(game.echoCollected).padStart(2, "0")],
    ["BEST COMBO", "x" + game.bestCombo],
  ];
  for (const [label, value] of statValues) {
    const cell = document.createElement("div");
    const name = document.createElement("span");
    const number = document.createElement("strong");
    name.textContent = label;
    number.textContent = value;
    cell.append(name, number);
    stats.append(cell);
  }

  const again = document.createElement("button");
  again.type = "button";
  again.className = "primary-button";
  again.textContent = "PLAY AGAIN ↗";
  again.addEventListener("click", start);
  const micro = document.createElement("span");
  micro.className = "microcopy";
  micro.textContent = "SAME SEED · SAME 60-SECOND CHALLENGE";
  overlayBody.append(kicker, title, medal, stats, again, micro);
  overlay.classList.remove("hidden");
  overlay.removeAttribute("aria-hidden");
  announcer.textContent = "Run complete. Score " + game.score + ". " + rankForScore(game.score) + ".";
  again.focus({ preventScroll: true });
  audioFx.play("finish");
}

function flip() {
  const next = switchLane(game);
  if (next === game) return;
  game = next;
  audioFx.play("switch");
  announcer.textContent = game.lane === 0 ? "Signal channel." : "Echo channel.";
}

startButton.addEventListener("click", start);
switchButton.addEventListener("click", flip);
canvas.addEventListener("pointerdown", () => { if (game.status === "running") flip(); });
document.addEventListener("keydown", event => {
  if (event.code !== "Space" || game.status !== "running" ||
      event.defaultPrevented || event.repeat ||
      event.altKey || event.ctrlKey || event.metaKey) return;
  // Let native Space activation work on focused controls (including SWITCH);
  // a player should never change lanes while toggling sound or fullscreen.
  const target = event.target;
  if (target instanceof Element &&
      target.closest("button, input, select, textarea, a[href], [role='button'], [contenteditable='true']")) return;
  event.preventDefault();
  flip();
});
fullscreenButton.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.querySelector(".shell")?.requestFullscreen();
    fullscreenButton.textContent = document.fullscreenElement ? "EXIT FULLSCREEN" : "FULL SCREEN";
    fullscreenButton.setAttribute("aria-label", document.fullscreenElement ? "EXIT FULLSCREEN — return to normal view" : "FULL SCREEN — enter booth mode");
  } catch {
    fullscreenButton.textContent = "NOT AVAILABLE";
    fullscreenButton.setAttribute("aria-label", "NOT AVAILABLE — fullscreen could not be started");
  }
});
document.addEventListener("fullscreenchange", () => {
  fullscreenButton.textContent = document.fullscreenElement ? "EXIT FULLSCREEN" : "FULL SCREEN";
  fullscreenButton.setAttribute("aria-label", document.fullscreenElement ? "EXIT FULLSCREEN — return to normal view" : "FULL SCREEN — enter booth mode");
});

boardClearButton.addEventListener("click", () => {
  if (!clearPending) {
    clearPending = true;
    boardClearButton.textContent = "CONFIRM CLEAR?";
    boardClearButton.setAttribute("aria-label", "CONFIRM CLEAR? — erase local high scores");
    clearTimer = setTimeout(() => {
      clearPending = false;
      boardClearButton.textContent = "CLEAR SCORES";
      boardClearButton.setAttribute("aria-label", "CLEAR SCORES — remove local high scores");
    }, 5000);
    return;
  }
  if (clearTimer) clearTimeout(clearTimer);
  clearPending = false;
  try { localStorage.removeItem(BOARD_KEY); } catch { /* blocked storage */ }
  boardList();
  boardClearButton.textContent = "CLEAR SCORES";
  boardClearButton.setAttribute("aria-label", "CLEAR SCORES — remove local high scores");
  announcer.textContent = "Local high scores cleared.";
});

function refreshConnectivity() {
  const status = document.querySelector("#offline-status");
  if (!status) return;
  if (!navigator.onLine) status.textContent = "OFFLINE PLAY READY";
  else status.textContent = "LOCAL BOOTH / NO ACCOUNT";
}
addEventListener("online", refreshConnectivity);
addEventListener("offline", refreshConnectivity);
refreshConnectivity();
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  // Explicitly constrained to production, never intercept Vite hot reload in dev.
  void navigator.serviceWorker.register("/sw.js").catch(() => {
    // Offline is best effort; gameplay does not depend on service worker.
  });
}

soundButton.addEventListener("click", async () => {
  await audioFx.setEnabled(!audioFx.isEnabled);
  const soundOn = audioFx.isEnabled;
  soundButton.textContent = soundOn ? "SOUND ON" : "SOUND OFF";
  soundButton.setAttribute("aria-label", soundOn ? "SOUND ON — mute original sound effects" : "SOUND OFF — enable original sound effects");
  soundButton.setAttribute("aria-pressed", String(soundOn));
});

function frame(now: number) {
  if (previousFrame === null || document.hidden) previousFrame = now;
  const delta = Math.min(0.12, Math.max(0, (now - previousFrame) / 1000));
  previousFrame = now;
  if (game.status === "ready" && !document.hidden) readyVisibleTime += delta;
  if (game.status === "running" && !document.hidden) {
    accumulator = Math.min(.2, accumulator + delta);
    while (accumulator >= 1 / 60 && game.status === "running") {
      game = tickGame(game, 1 / 60);
      accumulator -= 1 / 60;
    }
    const newest = game.impacts.at(-1);
    if (newest && newest.time !== lastAnnouncementAt) {
      audioFx.play(newest.kind);
      lastAnnouncementAt = newest.time;
    }
    if (game.status === "finished") finish();
  }
  paint(ctx, game, reducedMotion, now / 1000);
  const attractActive = game.status === "ready" && !document.hidden && readyVisibleTime >= 15 && matchMedia("(min-width: 800px)").matches;
  if (attractActive !== overlay.classList.contains("attract-mode")) {
    overlay.classList.toggle("attract-mode", attractActive);
    if (readyKicker) {
      readyKicker.textContent = attractActive
          ? "WATCH THE ECHO CATCH BOTH"
          : "A NEW RULE OF REACTION";
    }
  }
  if (attractActive) drawReadyAttract(ctx, readyVisibleTime - 15, reducedMotion);
  updateHud();
  requestAnimationFrame(frame);
}

drawTitleBackdrop(ctx);
boardList();
updateHud();
requestAnimationFrame(frame);
