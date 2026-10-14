import { LOOP_PAD, STINGERS, TRACKS, type StingerId, type TrackId } from './tracks';
import type { SpotAmbience } from './soundscape';

/**
 * Music: original looping tracks (see tracks.ts), streamed on demand,
 * looped natively between exact sample positions and crossfaded when the
 * player changes place. Feedback sounds: short instrument stingers for wins
 * and the phone, synthesized clicks for cards and chips. Ambience: only a few
 * sparse, quiet spot sounds — no continuous noise beds.
 */

export type SfxName = 'card' | 'chip' | 'chips' | 'win' | 'bigwin' | 'lose' | 'click' | 'door' | 'shuffle' | 'cash' | 'phone' | 'ball' | 'deny' | 'blackjack' | 'ding' | 'slide' | 'lift';

interface Volumes {
  music: number;
  sfx: number;
  ambience: number;
}

interface Playing {
  id: TrackId;
  src: AudioBufferSourceNode;
  gain: GainNode;
  /** context time at which file position `offset` was playing */
  startedAt: number;
  offset: number;
}

const FADE = 1.6;
/** come back to a track within this long and it carries on where it was */
const RESUME_WITHIN = 150;
/** decoded tracks are large (≈35 MB each); keep only a few */
const CACHE_TRACKS = 3;

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxBus!: GainNode;
  private musicBus!: GainNode;
  private ambBus!: GainNode;
  private noiseBuf: AudioBuffer | null = null;
  private vol: Volumes = { music: 0.5, sfx: 0.7, ambience: 0.6 };
  private wantMusic: TrackId | null = null;
  private wantAmb: SpotAmbience = null;
  private playing: Playing | null = null;
  private musicToken = 0;
  private buffers = new Map<TrackId, AudioBuffer>();
  private loading = new Map<TrackId, Promise<AudioBuffer | null>>();
  private resumeAt = new Map<TrackId, { pos: number; at: number }>();
  private stingers = new Map<StingerId, AudioBuffer>();
  private amb: { kind: SpotAmbience; timer: number } | null = null;
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
    comp.threshold.value = -8;
    comp.ratio.value = 2.5;
    comp.attack.value = 0.01;
    comp.release.value = 0.3;
    this.master.connect(comp).connect(c.destination);
    this.sfxBus = c.createGain();
    this.musicBus = c.createGain();
    this.ambBus = c.createGain();
    for (const b of [this.sfxBus, this.musicBus, this.ambBus]) b.connect(this.master);
    this.applyVolumes(this.vol);
    const len = c.sampleRate;
    this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    for (const [id, url] of Object.entries(STINGERS) as [StingerId, string][]) {
      void this.decode(url).then((b) => b && this.stingers.set(id, b));
    }
    const want = this.wantMusic;
    this.wantMusic = null;
    this.setMusic(want);
    const amb = this.wantAmb;
    this.wantAmb = null;
    this.setAmbience(amb);
  }

  applyVolumes(v: Volumes): void {
    this.vol = v;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.sfxBus.gain.setTargetAtTime(v.sfx * 0.8, t, 0.05);
    this.musicBus.gain.setTargetAtTime(v.music * 0.62, t, 0.2);
    this.ambBus.gain.setTargetAtTime(v.ambience * 0.5, t, 0.2);
  }

  private async decode(url: string): Promise<AudioBuffer | null> {
    const c = this.ctx;
    if (!c) return null;
    try {
      const res = await fetch(url);
      const data = await res.arrayBuffer();
      return await new Promise<AudioBuffer>((resolve, reject) => {
        // the callback form also works in older Safari
        const p = c.decodeAudioData(data, resolve, reject);
        if (p && typeof (p as Promise<AudioBuffer>).then === 'function') (p as Promise<AudioBuffer>).then(resolve, reject);
      });
    } catch {
      return null;
    }
  }

  // ------------------------------------------------------------------ music

  /** Which track is (or is about to be) playing. */
  currentTrack(): TrackId | null {
    return this.wantMusic;
  }

  setMusic(id: TrackId | null): void {
    if (id === this.wantMusic) return;
    this.wantMusic = id;
    const c = this.ctx;
    if (!c) return;
    const token = ++this.musicToken;
    if (this.playing) {
      const old = this.playing;
      this.resumeAt.set(old.id, { pos: this.position(old), at: c.currentTime });
      old.gain.gain.cancelScheduledValues(c.currentTime);
      old.gain.gain.setValueAtTime(old.gain.gain.value, c.currentTime);
      old.gain.gain.linearRampToValueAtTime(0, c.currentTime + FADE);
      old.src.stop(c.currentTime + FADE + 0.05);
      this.playing = null;
    }
    if (!id) return;
    void this.track(id).then((buf) => {
      if (!buf || token !== this.musicToken || !this.ctx) return;
      this.start(id, buf);
    });
  }

  private track(id: TrackId): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id);
    if (have) {
      // refresh its place in the cache
      this.buffers.delete(id);
      this.buffers.set(id, have);
      return Promise.resolve(have);
    }
    let p = this.loading.get(id);
    if (!p) {
      p = this.decode(TRACKS[id].url).then((b) => {
        this.loading.delete(id);
        if (b) {
          this.buffers.set(id, b);
          while (this.buffers.size > CACHE_TRACKS) {
            const oldest = this.buffers.keys().next().value as TrackId;
            if (oldest === this.wantMusic) break;
            this.buffers.delete(oldest);
          }
        }
        return b;
      });
      this.loading.set(id, p);
    }
    return p;
  }

  private start(id: TrackId, buf: AudioBuffer): void {
    const c = this.ctx!;
    const info = TRACKS[id];
    const loopStart = info.loopStart + LOOP_PAD;
    const loopEnd = Math.min(buf.duration, loopStart + info.period);
    const src = c.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    src.loopStart = loopStart;
    src.loopEnd = loopEnd;
    const gain = c.createGain();
    gain.gain.value = 0;
    src.connect(gain).connect(this.musicBus);
    const back = this.resumeAt.get(id);
    let offset = info.loopStart > 0 ? 0 : LOOP_PAD;
    if (back && c.currentTime - back.at < RESUME_WITHIN) offset = back.pos;
    const when = c.currentTime + 0.05;
    src.start(when, offset);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(1, when + FADE);
    this.playing = { id, src, gain, startedAt: when, offset };
  }

  /** Current file position of a playing track, folded into its loop. */
  private position(p: Playing): number {
    const info = TRACKS[p.id];
    const loopStart = info.loopStart + LOOP_PAD;
    let pos = p.offset + Math.max(0, this.ctx!.currentTime - p.startedAt);
    if (pos >= loopStart + info.period) pos = loopStart + ((pos - loopStart) % info.period);
    return pos;
  }

  // ------------------------------------------------------------------ effects

  private noise(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noiseBuf) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noiseBuf;
    s.loop = true;
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
    s.start(start, Math.random() * 0.5);
    s.stop(start + dur + 0.05);
  }

  private stinger(id: StingerId, gain = 1): boolean {
    const b = this.stingers.get(id);
    if (!b || !this.ctx) return false;
    const s = this.ctx.createBufferSource();
    s.buffer = b;
    const g = this.ctx.createGain();
    g.gain.value = gain;
    s.connect(g).connect(this.sfxBus);
    s.start(this.ctx.currentTime + 0.005);
    return true;
  }

  sfx(name: SfxName): void {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const t = this.ctx.currentTime + 0.005;
    const b = this.sfxBus;
    switch (name) {
      case 'card':
        this.burst(t, 0.05, 3200, 0.8, 0.45, b, 'highpass');
        this.burst(t + 0.01, 0.07, 1800, 1.5, 0.22, b);
        break;
      case 'chip':
        this.tone(2600 + Math.random() * 300, t, 0.05, 'sine', 0.16, b);
        this.tone(3900 + Math.random() * 300, t + 0.012, 0.04, 'sine', 0.1, b);
        break;
      case 'chips':
        for (let i = 0; i < 5; i++) this.tone(2400 + Math.random() * 900, t + i * 0.035 + Math.random() * 0.01, 0.045, 'sine', 0.12, b);
        break;
      case 'win':
        if (!this.stinger('win', 0.8)) [523, 659, 784, 1047].forEach((f, i) => this.tone(f, t + i * 0.08, 0.35, 'triangle', 0.14, b));
        break;
      case 'bigwin':
        if (!this.stinger('bigwin', 0.9)) [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => this.tone(f, t + i * 0.07, 0.5, 'triangle', 0.15, b));
        break;
      case 'blackjack':
        if (!this.stinger('blackjack', 0.9)) [659, 831, 988, 1319].forEach((f, i) => this.tone(f, t + i * 0.06, 0.45, 'triangle', 0.12, b));
        break;
      case 'lose':
        if (!this.stinger('lose', 0.7)) {
          this.tone(392, t, 0.25, 'triangle', 0.1, b);
          this.tone(311, t + 0.14, 0.4, 'triangle', 0.09, b);
        }
        break;
      case 'phone':
        if (!this.stinger('phone', 0.8)) {
          this.tone(1175, t, 0.12, 'sine', 0.12, b);
          this.tone(1568, t + 0.13, 0.2, 'sine', 0.12, b);
        }
        break;
      case 'deny':
        this.tone(220, t, 0.1, 'triangle', 0.08, b);
        break;
      case 'click':
        this.tone(1400, t, 0.03, 'sine', 0.045, b);
        break;
      case 'door':
        this.tone(90, t, 0.25, 'sine', 0.22, b, 0.01);
        this.burst(t, 0.16, 400, 2, 0.12, b);
        break;
      case 'shuffle':
        for (let i = 0; i < 14; i++) this.burst(t + i * 0.035, 0.04, 2400 + Math.random() * 1600, 1, 0.16, b);
        break;
      case 'cash':
        this.tone(1318, t, 0.12, 'triangle', 0.08, b);
        this.tone(1760, t + 0.07, 0.35, 'triangle', 0.12, b);
        break;
      case 'ball':
        this.tone(3000 + Math.random() * 800, t, 0.025, 'sine', 0.09, b);
        break;
      case 'ding':
        // the lift's chime: two soft bell notes, high then low
        this.tone(1319, t, 0.9, 'sine', 0.09, b, 0.004);
        this.tone(2637, t, 0.3, 'sine', 0.02, b, 0.004);
        this.tone(1047, t + 0.3, 1.3, 'sine', 0.09, b, 0.004);
        this.tone(2093, t + 0.3, 0.35, 'sine', 0.018, b, 0.004);
        break;
      case 'slide':
        // doors rolling on their track: a low, soft tone rather than a hiss
        this.tone(110, t, 0.42, 'triangle', 0.035, b, 0.12);
        this.tone(165, t, 0.3, 'sine', 0.012, b, 0.1);
        break;
      case 'lift':
        // the car moving: a slow low swell
        this.tone(55, t, 1.5, 'sine', 0.08, b, 0.5);
        this.tone(82.5, t, 1.4, 'sine', 0.03, b, 0.5);
        break;
    }
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
      gain.gain.linearRampToValueAtTime(0.12, c.currentTime + 0.3);
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

  /** A few quiet sounds from the room now and then; silence is part of it. */
  setAmbience(kind: SpotAmbience): void {
    if (kind === this.wantAmb && (this.amb || !kind)) return;
    this.wantAmb = kind;
    if (!this.ctx) return;
    if (this.amb) {
      clearInterval(this.amb.timer);
      this.amb = null;
    }
    if (!kind) return;
    const bus = this.ambBus;
    const pan = (v: number): AudioNode => {
      const c = this.ctx!;
      if (!c.createStereoPanner) return bus;
      const p = c.createStereoPanner();
      p.pan.value = v;
      p.connect(bus);
      return p;
    };
    const timer = window.setInterval(() => {
      const c = this.ctx;
      if (!c || c.state !== 'running') return;
      const t = c.currentTime + Math.random() * 0.6;
      if (kind === 'casino' && Math.random() < 0.3) {
        // chips set down at a table somewhere across the room
        const out = pan(Math.random() * 1.6 - 0.8);
        const n = 1 + Math.floor(Math.random() * 3);
        for (let i = 0; i < n; i++) this.tone(2500 + Math.random() * 700, t + i * 0.05, 0.04, 'sine', 0.02, out);
      } else if (kind === 'city_night' && Math.random() < 0.22) {
        const out = pan(Math.random() * 1.4 - 0.7);
        for (let i = 0; i < 3; i++) this.tone(4300 + Math.random() * 200, t + i * 0.055, 0.035, 'sine', 0.008, out);
      } else if (kind === 'cafe' && Math.random() < 0.12) {
        // a cup on a saucer
        const out = pan(Math.random() * 1.2 - 0.6);
        this.tone(3400 + Math.random() * 600, t, 0.12, 'sine', 0.012, out);
        this.tone(5100 + Math.random() * 500, t + 0.01, 0.08, 'sine', 0.006, out);
      }
    }, 1000);
    this.amb = { kind, timer };
  }
}

export const audio = new AudioEngine();

export function sfx(name: SfxName): void {
  audio.sfx(name);
}
