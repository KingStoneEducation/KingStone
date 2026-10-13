import type { Ambience } from '../data/locations';

/**
 * Everything audible is synthesized with the Web Audio API at runtime:
 * short effects, looping ambience beds and a small generative music system.
 * No audio files are shipped or downloaded.
 */

export type SfxName = 'card' | 'chip' | 'chips' | 'win' | 'bigwin' | 'lose' | 'click' | 'door' | 'shuffle' | 'cash' | 'phone' | 'ball' | 'deny' | 'blackjack';
export type MusicMood = 'menu' | 'day' | 'night' | 'casino' | 'home' | 'lounge' | null;

interface Volumes {
  music: number;
  sfx: number;
  ambience: number;
}

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private vol: Volumes = { music: 0.5, sfx: 0.7, ambience: 0.6 };
  private amb: { kind: string; nodes: AudioNode[]; gain: GainNode; timer?: number } | null = null;
  private music: { mood: MusicMood; timer: number; gain: GainNode; nextBar: number; bar: number } | null = null;
  private wantMusic: MusicMood = null;
  private wantAmb: { kind: Ambience | null; night: boolean } = { kind: null, night: false };
  private whirr: { src: AudioBufferSourceNode; gain: GainNode; filter: BiquadFilterNode } | null = null;

  /** Must be called from a user gesture (browsers block audio until then). */
  unlock(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    this.master.gain.value = 0.9;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 3;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.musicBus = c.createGain();
    this.ambBus = c.createGain();
    for (const b of [this.sfxBus, this.musicBus, this.ambBus]) b.connect(this.master);
    this.applyVolumes(this.vol);
    const len = c.sampleRate * 2;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    if (this.wantMusic) this.setMusic(this.wantMusic);
    if (this.wantAmb.kind) this.setAmbience(this.wantAmb.kind, this.wantAmb.night);
  }

  applyVolumes(v: Volumes): void {
    this.vol = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(v.sfx * 0.8, t, 0.05);
    this.musicBus.gain.setTargetAtTime(v.music * 0.32, t, 0.2);
    this.ambBus.gain.setTargetAtTime(v.ambience * 0.5, t, 0.2);
  }

  private noise(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
    s.loopStart = Math.random();
    return s;
  }

  private tone(freq: number, start: number, dur: number, type: OscillatorType, gain: number, bus: AudioNode, attack = 0.005): void {
    const c = this.ctx!;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(gain, start + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    o.connect(g).connect(bus);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  private burst(start: number, dur: number, freq: number, q: number, gain: number, bus: AudioNode, type: BiquadFilterType = 'bandpass'): void {
    const c = this.ctx!;
    const s = this.noise();
    if (!s) return;
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, start);
    g.gain.exponentialRampToValueAtTime(0.0008, start + dur);
    s.connect(f).connect(g).connect(bus);
    s.start(start, Math.random());
    s.stop(start + dur + 0.05);
  }

  sfx(name: SfxName): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    const b = this.sfxBus;
    switch (name) {
      case 'card':
        this.burst(t, 0.05, 3200, 0.8, 0.5, b, 'highpass');
        this.burst(t + 0.01, 0.07, 1800, 1.5, 0.25, b);
        break;
      case 'chip':
        this.tone(2600 + Math.random() * 300, t, 0.05, 'sine', 0.18, b);
        this.tone(3900 + Math.random() * 300, t + 0.012, 0.04, 'sine', 0.12, b);
        break;
      case 'chips':
        for (let i = 0; i < 5; i++) {
          this.tone(2400 + Math.random() * 900, t + i * 0.035 + Math.random() * 0.01, 0.045, 'sine', 0.13, b);
        }
        break;
      case 'win':
        [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.08, 0.35, 'triangle', 0.16, b));
        break;
      case 'bigwin':
        [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, t + i * 0.07, 0.5, 'triangle', 0.17, b));
        this.chimes(t + 0.45);
        break;
      case 'blackjack':
        [659, 831, 988, 1319].forEach((f, i) => this.tone(f, t + i * 0.06, 0.45, 'square', 0.06, b));
        [659, 831, 988, 1319].forEach((f, i) => this.tone(f, t + i * 0.06, 0.45, 'triangle', 0.12, b));
        break;
      case 'lose':
        this.tone(392, t, 0.25, 'triangle', 0.12, b);
        this.tone(311, t + 0.14, 0.4, 'triangle', 0.11, b);
        break;
      case 'deny':
        this.tone(180, t, 0.12, 'square', 0.06, b);
        break;
      case 'click':
        this.tone(1400, t, 0.03, 'sine', 0.05, b);
        break;
      case 'door':
        this.tone(90, t, 0.25, 'sine', 0.25, b, 0.01);
        this.burst(t, 0.18, 400, 2, 0.15, b);
        break;
      case 'shuffle':
        for (let i = 0; i < 14; i++) this.burst(t + i * 0.035, 0.04, 2400 + Math.random() * 1600, 1, 0.18, b);
        break;
      case 'cash':
        this.tone(1318, t, 0.12, 'square', 0.05, b);
        this.tone(1760, t + 0.07, 0.35, 'triangle', 0.14, b);
        this.burst(t, 0.12, 5000, 0.6, 0.12, b, 'highpass');
        break;
      case 'phone':
        this.tone(1175, t, 0.12, 'sine', 0.12, b);
        this.tone(1568, t + 0.13, 0.2, 'sine', 0.12, b);
        break;
      case 'ball':
        this.tone(3000 + Math.random() * 800, t, 0.025, 'sine', 0.1, b);
        break;
    }
  }

  private chimes(t: number): void {
    for (let i = 0; i < 6; i++) this.tone(2093 + Math.random() * 400, t + i * 0.09, 0.3, 'sine', 0.06, this.sfxBus);
  }

  /** Roulette wheel rumble: starts with the spin, fades when the ball settles. */
  wheel(on: boolean): void {
    if (!this.ctx) return;
    const c = this.ctx;
    if (on && !this.whirr) {
      const src = this.noise();
      if (!src) return;
      const filter = c.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 900;
      filter.Q.value = 2.5;
      const gain = c.createGain();
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(0.16, c.currentTime + 0.3);
      src.connect(filter).connect(gain).connect(this.sfxBus);
      src.start();
      filter.frequency.linearRampToValueAtTime(380, c.currentTime + 6);
      this.whirr = { src, gain, filter };
    } else if (!on && this.whirr) {
      const w = this.whirr;
      w.gain.gain.setTargetAtTime(0, c.currentTime, 0.25);
      w.src.stop(c.currentTime + 1.2);
      this.whirr = null;
    }
  }

  // ------------------------------------------------------------------ ambience

  setAmbience(kind: Ambience | null, night: boolean): void {
    this.wantAmb = { kind, night };
    if (!this.ctx) return;
    const key = `${kind}:${night}`;
    if (this.amb?.kind === key) return;
    const c = this.ctx;
    if (this.amb) {
      const old = this.amb;
      old.gain.gain.setTargetAtTime(0, c.currentTime, 0.4);
      if (old.timer) clearInterval(old.timer);
      setTimeout(() => old.nodes.forEach((n) => (n as AudioScheduledSourceNode).stop?.()), 2500);
      this.amb = null;
    }
    if (!kind) return;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, c.currentTime, 0.6);
    gain.connect(this.ambBus);
    const nodes: AudioNode[] = [];
    const bed = (freq: number, q: number, level: number, type: BiquadFilterType = 'bandpass') => {
      const s = this.noise();
      if (!s) return;
      const f = c.createBiquadFilter();
      f.type = type;
      f.frequency.value = freq;
      f.Q.value = q;
      const g = c.createGain();
      g.gain.value = level;
      s.connect(f).connect(g).connect(gain);
      s.start();
      nodes.push(s);
    };
    let timer: number | undefined;
    switch (kind) {
      case 'city':
        bed(180, 0.7, night ? 0.25 : 0.45, 'lowpass');
        bed(900, 0.5, night ? 0.04 : 0.08);
        timer = window.setInterval(() => {
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          if (night && Math.random() < 0.5) for (let i = 0; i < 3; i++) this.tone(4200 + Math.random() * 300, t + i * 0.06, 0.04, 'sine', 0.012, gain);
          if (!night && Math.random() < 0.08) this.tone(420, t, 0.4, 'square', 0.012, gain);
        }, 900);
        break;
      case 'casino':
        bed(700, 0.6, 0.35);
        bed(2400, 1.2, 0.05);
        timer = window.setInterval(() => {
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          // slot machine melodies and chip clacks from across the floor
          if (Math.random() < 0.55) {
            const base = [523, 587, 659, 784, 880][Math.floor(Math.random() * 5)];
            for (let i = 0; i < 3; i++) this.tone(base * (1 + i * 0.25), t + i * 0.09, 0.12, 'square', 0.006, gain);
          }
          if (Math.random() < 0.5) this.tone(2600 + Math.random() * 600, t + Math.random() * 0.4, 0.04, 'sine', 0.012, gain);
          if (Math.random() < 0.05) [784, 988, 1175, 1568].forEach((f, i) => this.tone(f, t + i * 0.1, 0.25, 'triangle', 0.01, gain));
        }, 700);
        break;
      case 'cafe':
      case 'restaurant':
        bed(600, 0.6, 0.22);
        timer = window.setInterval(() => {
          if (!this.ctx) return;
          const t = this.ctx.currentTime;
          if (Math.random() < 0.25) this.tone(3500 + Math.random() * 900, t, 0.06, 'sine', 0.01, gain);
          if (kind === 'cafe' && Math.random() < 0.04) this.burst(t, 1.2, 5000, 0.4, 0.02, gain, 'highpass');
        }, 1200);
        break;
      case 'bar':
      case 'club':
        bed(500, 0.6, 0.25);
        bed(90, 0.9, 0.12, 'lowpass');
        break;
      case 'store':
      case 'bank':
      case 'office':
      case 'boutique':
        bed(250, 0.6, 0.08, 'lowpass');
        bed(120, 4, 0.03);
        break;
      default:
        bed(160, 0.5, 0.06, 'lowpass');
    }
    this.amb = { kind: key, nodes, gain, timer };
  }

  // ------------------------------------------------------------------ music

  setMusic(mood: MusicMood): void {
    this.wantMusic = mood;
    if (!this.ctx) return;
    if (this.music?.mood === mood) return;
    const c = this.ctx;
    if (this.music) {
      const old = this.music;
      clearInterval(old.timer);
      old.gain.gain.setTargetAtTime(0, c.currentTime, 0.8);
      setTimeout(() => old.gain.disconnect(), 4000);
      this.music = null;
    }
    if (!mood) return;
    const gain = c.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(1, c.currentTime, 1.2);
    gain.connect(this.musicBus);
    const m = { mood, timer: 0, gain, nextBar: c.currentTime + 0.3, bar: 0 };
    m.timer = window.setInterval(() => this.scheduleMusic(m), 200);
    this.music = m;
  }

  private scheduleMusic(m: { mood: MusicMood; gain: GainNode; nextBar: number; bar: number }): void {
    const c = this.ctx;
    if (!c) return;
    const bpm = m.mood === 'casino' ? 96 : m.mood === 'night' || m.mood === 'menu' || m.mood === 'lounge' ? 78 : m.mood === 'home' ? 70 : 88;
    const beat = 60 / bpm;
    const barLen = beat * 4;
    const prog: number[][] =
      m.mood === 'day'
        ? [[60, 64, 67, 71], [57, 60, 64, 67], [53, 57, 60, 64], [55, 59, 62, 65]]
        : m.mood === 'home'
          ? [[62, 65, 69, 72], [58, 62, 65, 69], [60, 64, 67, 70], [57, 60, 64, 67]]
          : [[57, 60, 64, 67], [62, 65, 69, 72], [55, 59, 62, 65], [60, 64, 67, 71]];
    const hz = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
    while (m.nextBar < c.currentTime + 1.2) {
      const t = m.nextBar;
      const chord = prog[m.bar % prog.length];
      // soft electric-piano pad
      for (const n of chord) {
        const o = c.createOscillator();
        const o2 = c.createOscillator();
        const g = c.createGain();
        o.type = 'sine';
        o2.type = 'triangle';
        o.frequency.value = hz(n);
        o2.frequency.value = hz(n) * 2.001;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(0.05, t + 0.04);
        g.gain.exponentialRampToValueAtTime(0.012, t + barLen * 0.9);
        g.gain.linearRampToValueAtTime(0, t + barLen);
        const g2 = c.createGain();
        g2.gain.value = 0.25;
        o.connect(g);
        o2.connect(g2).connect(g);
        g.connect(m.gain);
        o.start(t);
        o2.start(t);
        o.stop(t + barLen + 0.05);
        o2.stop(t + barLen + 0.05);
      }
      // walking bass
      const root = chord[0] - 24;
      const walk = [root, root + 7, root + 12, root + 10];
      walk.forEach((n, i) => this.tone(hz(n), t + i * beat, beat * 0.9, 'triangle', 0.09, m.gain, 0.01));
      // brushes / light percussion
      if (m.mood !== 'home') {
        for (let i = 0; i < 4; i++) {
          if (!this.noiseBuf) break;
          this.burst(t + i * beat + beat * 0.5, 0.06, 7000, 0.7, i % 2 ? 0.03 : 0.018, m.gain, 'highpass');
        }
      }
      // sparse melody
      if (m.mood !== 'day' || m.bar % 2 === 0) {
        const scale = [0, 2, 3, 5, 7, 9, 10, 12];
        const notes = 2 + ((m.bar * 7) % 3);
        for (let i = 0; i < notes; i++) {
          if (Math.random() < 0.35) continue;
          const n = chord[0] + 12 + scale[Math.floor(Math.random() * scale.length)];
          this.tone(hz(n), t + (i + Math.random() * 0.5) * beat, beat * 1.4, 'sine', 0.035, m.gain, 0.02);
        }
      }
      m.nextBar += barLen;
      m.bar += 1;
    }
  }
}

export const audio = new AudioEngine();

export function sfx(name: SfxName): void {
  audio.sfx(name);
}
