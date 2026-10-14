"""Tiny composition toolkit: chords, voicings, bass lines, drum grids, melodies,
rendered with FluidSynth into seamless loops.

A loop file holds exactly one period of the piece *as it sounds when looping*
(rendered from the second pass, so reverb and release tails from the end of
the piece carry into its start) plus a short tail; the game loops natively
between loopStart and loopStart + period.
"""
import json
import math
import os
import random
import subprocess
import wave

import mido
import numpy as np

SF2 = '/usr/share/sounds/sf2/FluidR3_GM.sf2'
TPB = 960
OUT = os.path.join(os.path.dirname(__file__), 'out')
os.makedirs(OUT, exist_ok=True)

NAMES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}


def P(name):
    """'C4' -> 60, 'Eb3' -> 51, 'F#5' -> 78."""
    letter = name[0].upper()
    i = 1
    acc = 0
    while i < len(name) and name[i] in '#b':
        acc += 1 if name[i] == '#' else -1
        i += 1
    octave = int(name[i:])
    return 12 * (octave + 1) + NAMES[letter] + acc


QUALITIES = {
    '': [0, 4, 7], 'm': [0, 3, 7], 'sus4': [0, 5, 7], 'sus2': [0, 2, 7], 'add9': [0, 4, 7, 14],
    '6': [0, 4, 7, 9], '69': [0, 4, 7, 9, 14], 'm6': [0, 3, 7, 9], 'maj7': [0, 4, 7, 11], 'maj9': [0, 4, 7, 11, 14],
    'maj7#11': [0, 4, 7, 11, 18], 'm7': [0, 3, 7, 10], 'm9': [0, 3, 7, 10, 14], 'm11': [0, 3, 7, 10, 14, 17],
    'mmaj7': [0, 3, 7, 11], '7': [0, 4, 7, 10], '9': [0, 4, 7, 10, 14], '13': [0, 4, 7, 10, 14, 21],
    '7b9': [0, 4, 7, 10, 13], '7#9': [0, 4, 7, 10, 15], '7b13': [0, 4, 7, 10, 20], '7alt': [0, 4, 10, 13, 20],
    '7sus': [0, 5, 7, 10], '9sus': [0, 5, 7, 10, 14], '13sus': [0, 5, 10, 14, 21], 'm7b5': [0, 3, 6, 10], 'dim7': [0, 3, 6, 9],
}


class Chord:
    def __init__(self, sym):
        self.sym = sym
        body, _, bass = sym.partition('/')
        r = body[0]
        i = 1
        acc = 0
        # an accidental right after the letter belongs to the root (qualities never start with one)
        if i < len(body) and body[i] in '#b':
            acc = 1 if body[i] == '#' else -1
            i += 1
        self.root = (NAMES[r] + acc) % 12
        q = body[i:]
        if q not in QUALITIES:
            raise ValueError(f'unknown chord quality {q!r} in {sym}')
        self.iv = QUALITIES[q]
        self.quality = q
        if bass:
            b = NAMES[bass[0]] + (1 if '#' in bass else -1 if len(bass) > 1 and bass[1] == 'b' else 0)
            self.bass = b % 12
        else:
            self.bass = self.root

    def pcs(self):
        return [(self.root + x) % 12 for x in self.iv]

    def tone(self, degree):
        """Pitch class of a chord degree: 1, 3, 5, 7, 9, 11, 13."""
        q = self.quality
        third = 3 if q.startswith('m') and not q.startswith('maj') else 4
        if 'sus' in q:
            third = 5
        fifth = 6 if 'b5' in q or q == 'dim7' else 7
        seventh = 11 if 'maj' in q else 9 if q in ('6', '69', 'm6', 'dim7') else 10
        ninth = 13 if 'b9' in q or 'alt' in q else 15 if '#9' in q else 14
        m = {1: 0, 3: third, 5: fifth, 7: seventh, 9: ninth, 11: 17, 13: 20 if 'b13' in q else 21}
        return (self.root + m[degree]) % 12


def nearest(pc, around):
    """Pitch with pitch class pc closest to `around`."""
    base = around - ((around - pc) % 12)
    return base if around - base <= 6 else base + 12


def voice(chord, prev=None, low=52, high=76, kind='rootless', n=4):
    """Choose a voicing with good voice leading from `prev`."""
    c = chord
    q = c.quality
    if kind == 'rootless':
        if q in ('', 'm', 'sus4', 'sus2'):
            degs = [1, 3, 5, 9] if 'sus' not in q else [1, 5, 9, 3]
        elif q in ('6', 'm6', '69'):
            degs = [3, 13, 9, 5]
        elif q.startswith('m7b5') or q == 'dim7':
            degs = [3, 5, 7, 1]
        elif 'sus' in q:
            degs = [7, 9, 3, 13] if q == '13sus' else [7, 9, 3, 5]
        elif '13' in q:
            degs = [3, 13, 7, 9]
        else:
            degs = [3, 5, 7, 9]
        pcs = [c.tone(d) for d in degs][:n]
    elif kind == 'close':
        pcs = c.pcs()[:n]
    else:  # 'spread' for pads: root, fifth, tenth, seventh above
        pcs = c.pcs()
    best = None
    center = (low + high) // 2 if prev is None else sum(prev) / len(prev)
    for rot in range(len(pcs)):
        order = pcs[rot:] + pcs[:rot]
        for start in range(low - 6, high):
            notes = []
            cur = start
            for pc in order:
                cur = cur + ((pc - cur) % 12)
                notes.append(cur)
            if notes[0] < low or notes[-1] > high:
                continue
            if notes[-1] - notes[0] > 14:
                continue
            if prev:
                cost = sum(abs(a - b) for a, b in zip(sorted(notes), sorted(prev)))
            else:
                cost = abs(sum(notes) / len(notes) - center) * 2
            if best is None or cost < best[0]:
                best = (cost, notes)
            break
    return best[1] if best else [nearest(pc, center) for pc in pcs]


class Song:
    def __init__(self, name, bpm, beats_per_bar=4, swing=0.5, seed=1, swing16=False):
        self.name = name
        self.bpm = bpm
        self.bpb = beats_per_bar
        self.swing = swing  # 0.5 = straight, 0.667 = full triplet swing
        self.swing16 = swing16
        self.rng = random.Random(seed)
        self.parts = {}
        self.length_beats = 0
        self.intro_beats = 0

    # -------------------------------------------------------------- parts
    def part(self, name, program, ch, vol=100, pan=64, reverb=40, chorus=0, humanize=0.012, vel_jitter=6):
        self.parts[name] = {'program': program, 'ch': ch, 'vol': vol, 'pan': pan, 'reverb': reverb, 'chorus': chorus,
                            'notes': [], 'cc': [], 'humanize': humanize, 'vj': vel_jitter}
        return name

    def swung(self, beat):
        if self.swing != 0.5 and not self.swing16:
            whole = math.floor(beat + 1e-9)
            frac = beat - whole
            if abs(frac - 0.5) < 1e-6:
                return whole + self.swing
        if self.swing16 and self.swing != 0.5:
            q = math.floor(beat * 2 + 1e-9) / 2
            frac = beat - q
            if abs(frac - 0.25) < 1e-6:
                return q + 0.5 * self.swing
        return beat

    def note(self, part, beat, dur, pitch, vel, swing=True, exact=False):
        p = self.parts[part]
        b = self.swung(beat) if swing else beat
        e = self.swung(beat + dur) if swing else beat + dur
        if not exact:
            j = self.rng.uniform(-p['humanize'], p['humanize'])
            b += j
            e += j * 0.5
            vel = vel + self.rng.randint(-p['vj'], p['vj'])
        vel = max(1, min(127, int(vel)))
        p['notes'].append((max(0.0, b), max(b + 0.02, e), int(pitch), vel))

    def cc(self, part, beat, control, value):
        self.parts[part]['cc'].append((beat, control, int(value)))

    def chord_notes(self, part, beat, dur, pitches, vel, roll=0.0):
        for i, n in enumerate(sorted(pitches)):
            self.note(part, beat + i * roll, dur - i * roll, n, vel)

    def melody(self, part, start, text, vel=80, transpose=0, octave=0):
        """'A4:1.5 C5:.5 r:1 | ...' — pitch:beats; 'r' rests; '>' before a note accents it; '~' after legato."""
        for i, b in enumerate(text.split('|')):
            if not b.strip():
                continue
            total = sum(float(tok.partition(':')[2]) for tok in b.split())
            if abs(total - self.bpb) > 1e-6:
                raise ValueError(f'{self.name}/{part}: bar {i + 1} lasts {total} beats: {b.strip()}')
        t = start
        for tok in text.replace('|', ' ').split():
            accent = tok.startswith('>')
            tok = tok.lstrip('>')
            name, _, d = tok.partition(':')
            d = float(d)
            if name != 'r':
                legato = name.endswith('~')
                name = name.rstrip('~')
                pitch = P(name) + transpose + 12 * octave
                self.note(part, t, d * (1.0 if legato else 0.92), pitch, vel + (14 if accent else 0))
            t += d
        return t

    def drums(self, part, start_bar, bars, grid, steps=16, vel=None):
        """grid: {pitch: 'x.o.' string per bar}, x = strong, o = soft, - = ghost."""
        vel = vel or {'x': 92, 'o': 62, '-': 34, 'X': 110}
        for b in range(bars):
            for pitch, pat in grid.items():
                for i, ch in enumerate(pat):
                    if ch in vel:
                        beat = (start_bar + b) * self.bpb + i * self.bpb / steps
                        self.note(part, beat, 0.12, pitch, vel[ch])

    # -------------------------------------------------------------- output
    def harmony_line(self, line, start_bar):
        """Record the chords of a section (for the melody checker; rendering does not use it)."""
        if not hasattr(self, 'harmony'):
            self.harmony = []
        t = start_bar * self.bpb
        for sym, beats in bars(line, self.bpb):
            self.harmony.append((t, t + beats, Chord(sym)))
            t += beats

    def finish(self, total_bars, intro_bars=0):
        """The form's exact length: the loop period must be whole bars, not 'wherever the last note ends'."""
        self.length_beats = total_bars * self.bpb
        self.intro_beats = intro_bars * self.bpb
        self.fixed = True

    def midi(self, repeats=3, send=False):
        """MIDI with the intro once, then the body `repeats` times.

        send=False: the dry mix. send=True: every part's level weighted by its reverb send (the reverb's input).
        FluidSynth's own reverb is never used: its modulated delay lines drift from pass to pass, which would
        break the loop; reverb is added afterwards, linearly, in `render`.
        """
        if not getattr(self, 'fixed', False):
            raise RuntimeError('call finish(total_bars) before rendering')
        mid = mido.MidiFile(ticks_per_beat=TPB)
        meta = mido.MidiTrack()
        mid.tracks.append(meta)
        meta.append(mido.MetaMessage('set_tempo', tempo=mido.bpm2tempo(self.bpm), time=0))
        body = self.length_beats - self.intro_beats
        self.body_beats = body
        for name, p in self.parts.items():
            tr = mido.MidiTrack()
            mid.tracks.append(tr)
            ch = p['ch']
            ev = [(0, 0, mido.Message('program_change', program=p['program'], channel=ch, time=0))]
            vol = p['vol'] if not send else max(0, min(127, round(p['vol'] * math.sqrt(p['reverb'] / 127))))
            ev += [(0, 1, mido.Message('control_change', control=7, value=vol, channel=ch, time=0)),
                   (0, 1, mido.Message('control_change', control=10, value=p['pan'], channel=ch, time=0)),
                   (0, 1, mido.Message('control_change', control=91, value=0, channel=ch, time=0)),
                   (0, 1, mido.Message('control_change', control=93, value=p['chorus'], channel=ch, time=0))]
            for rep in range(repeats):
                for (b, e, pitch, vel) in p['notes']:
                    if rep > 0 and b < self.intro_beats:
                        continue
                    off = 0 if (rep == 0 or b < self.intro_beats) else rep * body
                    if rep > 0:
                        off = rep * body
                    s = int((b + off) * TPB)
                    t = int((e + off) * TPB)
                    ev.append((s, 3, mido.Message('note_on', note=pitch, velocity=vel, channel=ch, time=0)))
                    ev.append((t, 2, mido.Message('note_off', note=pitch, velocity=0, channel=ch, time=0)))
                for (b, control, value) in p['cc']:
                    if rep > 0 and b < self.intro_beats:
                        continue
                    off = rep * body if rep > 0 else 0
                    ev.append((int((b + off) * TPB), 1, mido.Message('control_change', control=control, value=value, channel=ch, time=0)))
            ev.sort(key=lambda x: (x[0], x[1]))
            last = 0
            for tick, _, msg in ev:
                msg.time = tick - last
                last = tick
                tr.append(msg)
        return mid

    def render(self, tail=1.0, gain=0.55, lufs=-17.0, rt60=1.9, wet=0.42, predelay=0.02):
        path_mid = os.path.join(OUT, f'{self.name}.mid')
        path_send = os.path.join(OUT, f'{self.name}.send.mid')
        path_wav = os.path.join(OUT, f'{self.name}.raw.wav')
        self.midi(3).save(path_mid)
        self.midi(3, send=True).save(path_send)
        # the chorus LFO runs freely across passes: give it a whole number of cycles per loop period
        spb0 = 60.0 / self.bpm
        per0 = (self.length_beats - self.intro_beats) * spb0
        chorus_hz = max(1, round(0.3 * per0)) / per0

        def synth(midi_path, g):
            subprocess.run(['fluidsynth', '-ni', '-q', '-g', f'{g:.4f}', '-r', '44100', '-R', '0', '-C', '1',
                            '-o', f'synth.chorus.speed={chorus_hz:.9f}', '-o', 'synth.chorus.level=1.2',
                            '-F', path_wav, SF2, midi_path], check=True)
            with wave.open(path_wav, 'rb') as w:
                rate = w.getframerate()
                nch = w.getnchannels()
                data = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, nch).astype(np.float64)
            return rate, data

        sr, dry = synth(path_mid, gain)
        pk = 20 * math.log10(max(1.0, np.max(np.abs(dry))) / 32768)
        if pk < -9:
            # quiet arrangements: render hotter so tails keep their resolution in 16 bits
            gain = min(10.0, gain * 10 ** ((-6 - pk) / 20))
            sr, dry = synth(path_mid, gain)
        _, send = synth(path_send, gain)
        n = min(len(dry), len(send))
        ir = make_ir(sr, rt60=rt60, predelay=predelay, seed=len(self.name))
        mono = (send[:n, 0] + send[:n, 1]) * 0.5
        raw = dry[:n].copy()
        for c in range(2):
            raw[:, c] += fftconv(mono, ir[:, c])[:n] * wet
        spb = 60.0 / self.bpm
        intro = self.intro_beats * spb
        period = self.body_beats * spb
        # FluidSynth dispatches MIDI on 64-sample blocks timed in whole milliseconds: only a period that is a
        # whole number of both renders every pass sample-identically (period must be a multiple of 0.64 s)
        ms = period * 1000
        if abs(ms - round(ms)) > 1e-6 or round(period * 44100) % 64 != 0:
            raise ValueError(f'{self.name}: period {period:.6f}s is not a multiple of 0.64 s; pick another tempo or length')
        a = int(round((intro + period) * sr)) if intro == 0 else int(round(intro * sr))
        if intro > 0:
            # keep the intro, then two passes so the loop region (second pass) has its true tails
            seg = raw[0:int(round((intro + 2 * period + tail) * sr))]
            loop_start = intro + period
        else:
            seg = raw[a:a + int(round((period + tail) * sr))]
            loop_start = 0.0
        peak = np.max(np.abs(seg))
        tmp = os.path.join(OUT, f'{self.name}.loop.wav')
        with wave.open(tmp, 'wb') as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(sr)
            w.writeframes(np.clip(seg, -32768, 32767).astype(np.int16).tobytes())
        # loudness: measure, then apply one linear gain (no dynamic processing, so the loop stays periodic)
        meas = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'],
                              capture_output=True, text=True).stderr
        integ = None
        for line in meas.splitlines():
            line = line.strip()
            if line.startswith('I:') and 'LUFS' in line:
                integ = float(line.split()[1])
        g_db = (lufs - integ) if integ is not None else 0.0
        peak_db = 20 * math.log10(max(peak, 1) / 32768)
        g_db = min(g_db, -1.0 - peak_db)  # keep 1 dB of headroom
        mp3 = os.path.join(OUT, f'{self.name}.mp3')
        subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-af', f'volume={g_db:.2f}dB',
                        '-c:a', 'libmp3lame', '-b:a', '160k', mp3], check=True)
        info = {'name': self.name, 'bpm': self.bpm, 'loopStart': round(loop_start, 6), 'period': round(period, 6),
                'tail': tail, 'lufsBefore': integ, 'gainDb': round(g_db, 2), 'peakDb': round(peak_db, 2),
                'seconds': round(len(seg) / sr, 2), 'bytes': os.path.getsize(mp3)}
        with open(os.path.join(OUT, f'{self.name}.json'), 'w') as f:
            json.dump(info, f)
        os.remove(path_wav)
        return info


# ------------------------------------------------------------------ accompaniment helpers

def walking_bass(song, part, chords, start_bar=0, low=P('E1'), high=P('C3'), vel=84, beats_per_chord=None):
    """Quarter-note walking line. chords: list of (chord, beats)."""
    rng = song.rng
    t = start_bar * song.bpb
    seq = []
    for sym, beats in chords:
        seq.append((Chord(sym), beats))
    prev = None
    for idx, (c, beats) in enumerate(seq):
        nxt = seq[(idx + 1) % len(seq)][0]
        root = nearest(c.bass, prev if prev is not None else P('A1'))
        while root < low:
            root += 12
        while root > high - 5:
            root -= 12
        target = nearest(nxt.bass, root)
        line = [root]
        for k in range(1, int(beats)):
            last = line[-1]
            if k == int(beats) - 1:
                # approach the next root by a half step from above or below
                line.append(target + (1 if rng.random() < 0.5 else -1))
            else:
                tones = [nearest(c.tone(d), last) for d in (3, 5, 7)]
                cand = [x for x in tones if x != last and low <= x <= high]
                cand.sort(key=lambda x: abs(x - (last + (target - last) / max(1, beats - k))))
                line.append(cand[0] if cand else last + 2)
        for k, p in enumerate(line):
            song.note(part, t + k, 0.92, p, vel + (6 if k == 0 else 0))
        t += beats
        prev = line[-1]
    return t


def charleston(song, part, chords, start_bar=0, low=52, high=74, vel=58, pattern=((0, 0.8), (1.5, 0.45))):
    t = start_bar * song.bpb
    prev = None
    for sym, beats in chords:
        v = voice(Chord(sym), prev, low, high)
        prev = v
        for at, d in pattern:
            if at < beats:
                song.chord_notes(part, t + at, d, v, vel)
        t += beats
    return t


def pad(song, part, chords, start_bar=0, low=48, high=79, vel=46, kind='spread'):
    t = start_bar * song.bpb
    prev = None
    for sym, beats in chords:
        c = Chord(sym)
        v = voice(c, prev, low + 7, high, 'rootless' if kind == 'rootless' else 'close', 4)
        prev = v
        song.chord_notes(part, t, beats - 0.05, v, vel)
        t += beats
    return t


def bars(chord_line, bpb=4):
    """'Dm9 | G13 | Cmaj9 Am7 |' -> [(sym, beats)], two chords in a bar split it evenly."""
    out = []
    for bar in chord_line.split('|'):
        syms = bar.split()
        if not syms:
            continue
        for s in syms:
            out.append((s, bpb / len(syms)))
    return out


def fftconv(x, h, block=1 << 16):
    """Linear convolution by overlap-add."""
    m = len(h)
    nfft = 1 << int(math.ceil(math.log2(block + m - 1)))
    H = np.fft.rfft(h, nfft)
    y = np.zeros(len(x) + m - 1)
    for i in range(0, len(x), block):
        seg = x[i:i + block]
        out = np.fft.irfft(np.fft.rfft(seg, nfft) * H, nfft)[:len(seg) + m - 1]
        y[i:i + len(out)] += out
    return y


def make_ir(sr, rt60=1.9, predelay=0.02, seed=1):
    """A synthetic stereo hall: early reflections, then decorrelated noise that builds up over a few
    milliseconds and decays exponentially, high frequencies dying away faster (air and wall absorption)."""
    rng = np.random.default_rng(seed)
    n = int(rt60 * 1.15 * sr)
    t = np.arange(n) / sr
    ir = np.zeros((n, 2))
    for c in range(2):
        noise = rng.standard_normal(n)
        # time-varying one-pole lowpass: ~9 kHz at the start, ~1.8 kHz by the end of the decay
        cutoff = 9000 * (1800 / 9000) ** np.clip(t / rt60, 0, 1)
        a = 1 - np.exp(-2 * np.pi * cutoff / sr)
        y = np.empty(n)
        acc = 0.0
        for i in range(n):
            acc += a[i] * (noise[i] - acc)
            y[i] = acc
        env = 10 ** (-3 * t / rt60) * (1 - np.exp(-t / 0.018))
        ir[:, c] = y * env
    # a few early reflections, different on each side
    for c, taps in enumerate(([(0.007, 0.55), (0.016, 0.38), (0.031, 0.27), (0.047, 0.18)],
                              [(0.010, 0.5), (0.021, 0.36), (0.036, 0.24), (0.052, 0.16)])):
        for d, g in taps:
            k = int(d * sr)
            ir[k, c] += g * (np.sqrt(np.sum(ir[:, c] ** 2)) * 0.12)
    ir /= np.sqrt(np.sum(ir ** 2) / 2)
    pad = np.zeros((int(predelay * sr), 2))
    return np.vstack([pad, ir])


ROLE_LU = {  # loudness of a part (while it plays) relative to the lead melody
    'lead': 0.0, 'lead2': -4.0, 'riff': -2.5, 'comp': -6.5, 'bass': -5.0, 'pad': -8.0, 'arp': -9.0,
    'drums': -10.0, 'accent': -10.0, 'brush': -13.0, 'perc': -11.5,
}


def part_loudness(song, name):
    """Integrated loudness of one part alone (dry, one pass), LUFS; gating ignores the bars it rests."""
    import copy
    s = copy.deepcopy(song)
    s.parts = {name: s.parts[name]}
    mid = s.midi(1)
    p = os.path.join(OUT, '_part.mid')
    w = os.path.join(OUT, '_part.wav')
    mid.save(p)
    subprocess.run(['fluidsynth', '-ni', '-q', '-g', '1.0', '-r', '44100', '-R', '0', '-C', '1', '-F', w, SF2, p], check=True)
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', w, '-af', 'ebur128=framelog=quiet', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    for line in r.splitlines():
        line = line.strip()
        if line.startswith('I:') and 'LUFS' in line:
            return float(line.split()[1])
    return -70.0


def autobalance(song, roles, verbose=True):
    """Set every part's channel volume so the parts sit at their role's level relative to the lead.
    FluidSynth's CC7 curve is 40*log10(cc/127) dB, so a change of d dB is cc * 10**(d/40)."""
    levels = {n: part_loudness(song, n) for n in song.parts}
    leads = [levels[n] for n, r in roles.items() if r == 'lead']
    ref = sum(leads) / len(leads)
    report = []
    for n, p in song.parts.items():
        want = ref + ROLE_LU[roles[n]]
        d = want - levels[n]
        cc = p['vol'] * 10 ** (d / 40)
        if cc > 127:
            # cannot go louder by volume alone: lift the velocities instead
            extra = 40 * math.log10(cc / 127)
            scale = 10 ** (extra / 40)
            p['notes'] = [(b, e, pitch, max(1, min(127, int(v * scale)))) for (b, e, pitch, v) in p['notes']]
            cc = 127
        report.append(f'{n}:{levels[n] - ref:+.1f}->{ROLE_LU[roles[n]]:+.1f}')
        p['vol'] = max(1, int(round(cc)))
    if verbose:
        print(f'  balance {song.name}: ' + ' '.join(report))
    return song
