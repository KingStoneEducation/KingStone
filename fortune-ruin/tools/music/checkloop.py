"""Decode an encoded loop and measure how well it repeats across the loop point."""
import json
import subprocess
import sys

import numpy as np


def decode(path, sr=44100):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 's16le', '-ac', '2', '-ar', str(sr), '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).reshape(-1, 2).astype(np.float64) / 32768, sr


def check(name, offset=0.25, win=0.5):
    info = json.load(open(f'out/{name}.json'))
    x, sr = decode(f'out/{name}.mp3')
    a = int(round((info['loopStart'] + offset) * sr))
    b = a + int(round(info['period'] * sr))
    n = int(win * sr)
    seg1 = x[a:a + n]
    seg2 = x[b:b + n]
    rms = np.sqrt(np.mean(seg1 ** 2)) + 1e-12
    diff = np.sqrt(np.mean((seg1 - seg2) ** 2))
    # the jump itself: last samples before loopEnd vs first after loopStart
    jump = np.max(np.abs(x[b - 1] - x[a]))
    step = np.max(np.abs(np.diff(x[a - 200:a + 200], axis=0)))
    whole = np.sqrt(np.mean(x ** 2))
    print(f'{name:14s} period {info["period"]:7.2f}s  seam diff {20 * np.log10(diff / rms):6.1f} dB rel  '
          f'jump {jump:.4f} (typical step {step:.4f})  rms {20 * np.log10(whole):6.1f} dBFS  peak {20 * np.log10(np.max(np.abs(x))):5.1f} dBFS')


for n in sys.argv[1:]:
    check(n)
