"""Short instrument stingers for the game's feedback sounds (no loops)."""
import json
import os
import subprocess
import wave

import numpy as np

from mus import OUT, SF2, Song, fftconv, make_ir, P


def stinger(name, build, seconds, bpm=120, peak_db=-4.0, rt60=1.4, wet=0.3):
    s = Song(name, bpm=bpm, seed=5)
    build(s)
    bars_needed = int(np.ceil(seconds * bpm / 60 / 4)) + 1
    s.finish(bars_needed)
    mid = s.midi(1)
    pm = os.path.join(OUT, f'sfx_{name}.mid')
    pw = os.path.join(OUT, f'sfx_{name}.wav')
    mid.save(pm)
    subprocess.run(['fluidsynth', '-ni', '-q', '-g', '1.2', '-r', '44100', '-R', '0', '-C', '0', '-F', pw, SF2, pm], check=True)
    with wave.open(pw, 'rb') as w:
        sr = w.getframerate()
        x = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16).reshape(-1, 2).astype(np.float64) / 32768
    ir = make_ir(sr, rt60=rt60, predelay=0.012, seed=3)
    mono = x.mean(axis=1)
    y = x.copy()
    for c in range(2):
        y[:, c] += fftconv(mono, ir[:, c])[:len(x)] * wet
    n = int(seconds * sr)
    y = y[:n]
    fade = int(0.25 * sr)
    y[-fade:] *= np.linspace(1, 0, fade)[:, None] ** 2
    y *= 10 ** (peak_db / 20) / max(1e-6, np.max(np.abs(y)))
    tmp = os.path.join(OUT, f'sfx_{name}.out.wav')
    with wave.open(tmp, 'wb') as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(sr)
        w.writeframes((np.clip(y, -1, 1) * 32767).astype(np.int16).tobytes())
    mp3 = os.path.join(OUT, f'sfx_{name}.mp3')
    subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-i', tmp, '-c:a', 'libmp3lame', '-b:a', '128k', mp3], check=True)
    print(name, round(seconds, 2), 's', os.path.getsize(mp3), 'bytes')


def win(s):
    s.part('vibes', 11, 0, vol=110, humanize=0.0, vel_jitter=0)
    for i, p in enumerate(('C5', 'E5', 'G5', 'C6')):
        s.note('vibes', i * 0.14, 1.6 - i * 0.14, P(p), 84 + i * 4, exact=True)


def bigwin(s):
    s.part('vibes', 11, 0, vol=112, humanize=0.0, vel_jitter=0)
    s.part('celesta', 8, 1, vol=100, humanize=0.0, vel_jitter=0)
    s.part('glock', 9, 2, vol=84, humanize=0.0, vel_jitter=0)
    seq = ('C5', 'E5', 'G5', 'C6', 'E6', 'G6')
    for i, p in enumerate(seq):
        s.note('vibes', i * 0.12, 2.6 - i * 0.12, P(p), 86 + i * 3, exact=True)
        s.note('celesta', i * 0.12 + 0.02, 1.0, P(p) + 12, 70, exact=True)
    for i, p in enumerate(('G6', 'C7', 'E7')):
        s.note('glock', 0.8 + i * 0.1, 1.2, P(p), 64, exact=True)


def blackjack(s):
    s.part('glock', 9, 0, vol=96, humanize=0.0, vel_jitter=0)
    s.part('vibes', 11, 1, vol=108, humanize=0.0, vel_jitter=0)
    for i, p in enumerate(('G5', 'C6', 'E6', 'G6')):
        s.note('glock', i * 0.08, 1.4, P(p), 74, exact=True)
    for p in ('C5', 'E5', 'G5', 'B5'):
        s.note('vibes', 0.34, 2.4, P(p), 82, exact=True)


def lose(s):
    s.part('vibes', 11, 0, vol=96, humanize=0.0, vel_jitter=0)
    s.note('vibes', 0, 0.5, P('E5'), 66, exact=True)
    s.note('vibes', 0.32, 1.6, P('C5'), 60, exact=True)
    s.note('vibes', 0.32, 1.6, P('A4'), 54, exact=True)


def phone(s):
    s.part('marimba', 12, 0, vol=112, humanize=0.0, vel_jitter=0)
    for k in range(2):
        s.note('marimba', k * 0.36, 0.3, P('E6'), 96, exact=True)
        s.note('marimba', k * 0.36 + 0.12, 0.3, P('B6'), 90, exact=True)


if __name__ == '__main__':
    stinger('win', win, 1.7)
    stinger('bigwin', bigwin, 2.8)
    stinger('blackjack', blackjack, 2.4)
    stinger('lose', lose, 1.6, peak_db=-7.0)
    stinger('phone', phone, 1.0, peak_db=-5.0, wet=0.18)
