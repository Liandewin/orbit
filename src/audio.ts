import { CONFIG } from './config';

type Ctor = typeof AudioContext;

// Major pentatonic steps: capture pitch climbs with the combo.
const PENTA = [0, 2, 4, 7, 9];

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private noise: AudioBuffer | null = null;

  /** Must be called from a user gesture (iOS/Chrome autoplay policy). */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AC: Ctor | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: Ctor }).webkitAudioContext;
        if (!AC) return;
        const ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.connect(ctx.destination);
        const master = ctx.createGain();
        master.gain.value = CONFIG.audio.masterVolume;
        master.connect(comp);
        const len = Math.floor(ctx.sampleRate * 0.6);
        const noise = ctx.createBuffer(1, len, ctx.sampleRate);
        const data = noise.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        // A silent buffer played inside the gesture fully unlocks older iOS.
        const src = ctx.createBufferSource();
        src.buffer = ctx.createBuffer(1, 1, 22050);
        src.connect(ctx.destination);
        src.start(0);
        this.ctx = ctx;
        this.master = master;
        this.noise = noise;
      }
      if (this.ctx.state !== 'running') void this.ctx.resume();
    } catch {
      /* audio is optional */
    }
  }

  private ready(): AudioContext | null {
    return this.ctx && this.master && this.ctx.state === 'running' ? this.ctx : null;
  }

  private tone(freq: number, freqEnd: number, dur: number, type: OscillatorType, vol: number, delay = 0, attack = 0.004): void {
    const ctx = this.ready();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== freq) o.frequency.exponentialRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  ui(): void {
    this.tone(660, 990, 0.06, 'triangle', 0.12);
  }

  release(): void {
    this.tone(1400, 700, 0.06, 'square', 0.05);
    this.tone(2800, 1600, 0.05, 'sine', 0.05);
  }

  capture(combo: number, perfect: boolean): void {
    if (!perfect) {
      this.tone(300, 260, 0.14, 'triangle', 0.2);
      this.tone(600, 520, 0.08, 'sine', 0.06);
      return;
    }
    const step = Math.max(0, combo - 2);
    const semis = PENTA[step % PENTA.length] + 12 * Math.floor(step / PENTA.length);
    const f = 440 * Math.pow(2, semis / 12);
    this.tone(f, f, 0.25, 'triangle', 0.22);
    this.tone(f * 1.5, f * 1.5, 0.3, 'sine', 0.1, 0.03);
    this.tone(f * 2, f * 2.02, 0.22, 'sine', 0.08, 0.07);
  }

  death(): void {
    const ctx = this.ready();
    if (!ctx || !this.noise) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(3000, t);
    lp.frequency.exponentialRampToValueAtTime(80, t + 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    src.connect(lp).connect(g).connect(this.master!);
    src.start(t);
    src.stop(t + 0.6);
    this.tone(220, 35, 0.7, 'sawtooth', 0.18);
  }
}
