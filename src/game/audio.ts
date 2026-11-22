/** Original procedural arcade effects. No copyrighted audio, samples, loops or external APIs. */
export type Cue = "switch" | "signal" | "echo" | "dual" | "hazard" | "finish" | "on";

type Tone = {
  pitch: number;
  endPitch?: number;
  length: number;
  delay?: number;
  wave?: OscillatorType;
  level?: number;
};

const CUES: Record<Cue, Tone[]> = {
  on: [{ pitch: 660, endPitch: 870, length: .095, wave: "sine" }],
  switch: [
    { pitch: 355, endPitch: 530, length: .085, wave: "triangle" },
    { pitch: 710, endPitch: 840, length: .07, delay: .035, wave: "sine", level: .65 },
  ],
  signal: [{ pitch: 560, endPitch: 720, length: .095, wave: "sine" }],
  echo: [
    { pitch: 630, endPitch: 810, length: .11, wave: "triangle", level: .6 },
    { pitch: 950, endPitch: 1150, length: .13, delay: .02, wave: "sine", level: .44 },
  ],
  dual: [
    { pitch: 523.25, endPitch: 659.25, length: .21, wave: "triangle", level: .58 },
    { pitch: 783.99, endPitch: 987.77, length: .24, delay: .04, wave: "sine", level: .60 },
    { pitch: 1046.5, endPitch: 1318.5, length: .2, delay: .08, wave: "sine", level: .43 },
  ],
  hazard: [
    { pitch: 195, endPitch: 105, length: .17, wave: "sawtooth", level: .42 },
    { pitch: 138, endPitch: 85, length: .22, delay: .035, wave: "triangle", level: .3 },
  ],
  finish: [
    { pitch: 440, endPitch: 554.37, length: .21, wave: "sine", level: .65 },
    { pitch: 659.25, endPitch: 830.61, length: .22, delay: .12, wave: "triangle", level: .61 },
    { pitch: 987.77, endPitch: 1174.66, length: .31, delay: .23, wave: "sine", level: .65 },
  ],
};

export class ArcadeAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private enabled = false;

  get isEnabled() {
    return this.enabled;
  }

  async setEnabled(value: boolean) {
    this.enabled = value;
    if (!value) {
      if (this.master && this.context) {
        this.master.gain.setTargetAtTime(0, this.context.currentTime, .015);
      }
      return;
    }
    try {
      this.context ??= new AudioContext({ latencyHint: "interactive" });
      if (!this.master) {
        const master = this.context.createGain();
        master.gain.value = 0;
        master.connect(this.context.destination);
        this.master = master;
      }
      await this.context.resume();
      this.master.gain.setTargetAtTime(.095, this.context.currentTime, .03);
      this.play("on");
    } catch {
      // Muting is safe if audio is unavailable on event/kiosk machines.
      this.enabled = false;
    }
  }

  play(cue: Cue) {
    if (!this.enabled || !this.context || !this.master) return;
    const context = this.context;
    const start = context.currentTime;
    for (const tone of CUES[cue]) {
      const onset = start + (tone.delay ?? 0);
      const end = onset + tone.length;
      const gain = context.createGain();
      const osc = context.createOscillator();
      osc.type = tone.wave ?? "sine";
      osc.frequency.setValueAtTime(tone.pitch, onset);
      osc.frequency.exponentialRampToValueAtTime(tone.endPitch ?? tone.pitch, end);
      const level = (tone.level ?? 1) * .8;
      gain.gain.setValueAtTime(.0001, onset);
      gain.gain.exponentialRampToValueAtTime(level, onset + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, end);
      osc.connect(gain);
      gain.connect(this.master);
      osc.start(onset);
      osc.stop(end + .018);
      osc.addEventListener("ended", () => {
        gain.disconnect();
        osc.disconnect();
      }, { once: true });
    }
  }
}
