"""Flag melody notes that clash with the harmony on strong beats."""
import sys
import tracks
from mus import Chord

LEADS = {'vibes', 'tpt', 'sax', 'piano', 'flute', 'marimba', 'guitar', 'strings'}

def kind(c):
    q = c.quality
    if q.startswith('m7b5') or q == 'dim7':
        return 'half'
    if q.startswith('m') and not q.startswith('maj'):
        return 'min'
    if q in ('7', '9', '13', '7b9', '7#9', '7b13', '7alt', '7sus', '9sus', '13sus'):
        return 'dom'
    return 'maj'

AVOID = {  # interval above the root -> why it clashes when held on a strong beat
    'maj': {5: 'P4 over major', 10: 'b7 over major', 1: 'b9 over major', 3: 'm3 over major', 8: 'b6 over major'},
    'min': {4: 'M3 over minor', 1: 'b9 over minor', 11: 'M7 over minor7', 8: 'b6 over minor'},
    'dom': {5: 'P4 over dominant (no sus)', 11: 'M7 over dominant'},
    'half': {4: 'M3 over m7b5', 7: 'P5 over m7b5', 11: 'M7 over m7b5'},
}

def check(name):
    s = tracks.TRACKS[name]()
    H = getattr(s, 'harmony', [])
    if not H:
        print(f'{name}: (no harmony recorded)')
        return
    issues = 0
    for pname, p in s.parts.items():
        if pname not in LEADS or p['ch'] == 9:
            continue
        for (b, e, pitch, vel) in p['notes']:
            seg = [h for h in H if h[0] <= b + 0.05 < h[1]]
            if not seg:
                continue
            c = seg[-1][2]
            iv = (pitch - c.root) % 12
            if iv in [x % 12 for x in c.iv]:
                continue
            k = kind(c)
            if 'sus' in c.quality and iv == 5:
                continue
            frac = (b + 0.02) % 1
            strong = frac < 0.12 and (e - b) >= 0.7
            why = AVOID[k].get(iv)
            if why and strong:
                issues += 1
                bar = int(b // s.bpb) + 1
                print(f'  {name}/{pname} bar {bar} beat {b % s.bpb + 1:.2f}: {c.sym} + {pitch} ({why}), {e - b:.2f} beats')
    print(f'{name}: {issues} strong-beat clashes')

for n in sys.argv[1:] or tracks.TRACKS:
    check(n)
