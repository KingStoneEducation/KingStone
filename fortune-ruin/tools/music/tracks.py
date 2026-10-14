"""The game's soundtrack. Each function composes one looping track.

    python3 tracks.py            # render everything
    python3 tracks.py poker home # render some
"""
import sys

from mus import Chord, P, Song, autobalance, bars, nearest, voice, walking_bass


# ------------------------------------------------------------------ shared accompaniment patterns

def bass_root(c, low='E1', high='D2'):
    r = nearest(c.bass, P('A1'))
    while r < P(low):
        r += 12
    while r > P(high):
        r -= 12
    return r


def two_feel(s, part, line, start_bar, vel=80):
    t = start_bar * s.bpb
    for sym, beats in bars(line, s.bpb):
        c = Chord(sym)
        r = bass_root(c)
        if beats >= 4:
            s.note(part, t, 1.9, r, vel)
            fifth = r + 7 if r + 7 <= P('C3') else r - 5
            s.note(part, t + 2, 1.9, fifth, vel - 8)
        else:
            s.note(part, t, beats * 0.95, r, vel)
        t += beats


def comp_hold(s, part, line, start_bar, vel=48, low=52, high=74, kind='rootless'):
    t = start_bar * s.bpb
    prev = None
    for sym, beats in bars(line, s.bpb):
        v = voice(Chord(sym), prev, low, high, kind)
        prev = v
        s.chord_notes(part, t, beats * 0.97, v, vel)
        t += beats


def arp_lh(s, part, line, start_bar, vel=52, pattern=(0, 7, 16, 7, 12, 7, 16, 19), low='C2', step=0.5):
    """Left-hand broken chords: offsets from the root (16 = tenth, the chord's third an octave up)."""
    t = start_bar * s.bpb
    for sym, beats in bars(line, s.bpb):
        c = Chord(sym)
        r = nearest(c.bass, P('C3'))
        while r < P(low) + 12:
            r += 12
        while r > P('A3'):
            r -= 12
        third = (c.tone(3) - c.root) % 12
        seventh = (c.tone(7) - c.root) % 12
        fifth = (c.tone(5) - c.root) % 12
        sub = {0: 0, 7: fifth, 16: 12 + third, 12: 12, 19: 12 + fifth, 10: seventh, 22: 12 + seventh, 14: 14, 4: third, 24: 24}
        n = int(round(beats / step))
        for i in range(n):
            off = sub.get(pattern[i % len(pattern)], pattern[i % len(pattern)])
            s.note(part, t + i * step, step * 1.6, r + off, vel - (0 if i % 4 == 0 else 8))
        t += beats


def ride_swing(s, part, start_bar, nbars, vel=60, fills=(), hat=True, kick=True):
    for k in range(nbars):
        bb = (start_bar + k) * s.bpb
        for at, v in ((0, 0), (1, 8), (1.5, -14), (2, 0), (3, 8), (3.5, -14)):
            s.note(part, bb + at, 0.25, 51, vel + v)
        if hat:
            for at in (1, 3):
                s.note(part, bb + at, 0.2, 44, vel - 8)
        if kick:
            for at in range(4):
                s.note(part, bb + at, 0.2, 36, 22)
        if (start_bar + k) in fills:
            for i, at in enumerate((2, 2 + 2 / 3, 2 + 4 / 3, 3, 3 + 2 / 3)):
                s.note(part, bb + at, 0.15, 38, 36 + i * 6, swing=False)


# ------------------------------------------------------------------ the tracks

def casino_day():
    s = Song('casino_day', bpm=120, swing=0.64, seed=11)
    s.part('vibes', 11, 0, vol=96, pan=78, reverb=46)
    s.part('tpt', 59, 1, vol=100, pan=50, reverb=40)
    s.part('piano', 0, 2, vol=84, pan=44, reverb=36)
    s.part('bass', 32, 3, vol=112, pan=64, reverb=18, humanize=0.008)
    s.part('drums', 32, 9, vol=88, pan=64, reverb=26, humanize=0.006, vel_jitter=4)

    A1 = 'Fmaj7 | Dm7 | Gm7 | C7 | Am7 | D7b9 | Gm7 | C7'
    A2 = 'Fmaj7 | Dm7 | Gm7 | C7 | Am7 | D7b9 | Gm7 C7 | Fmaj7'
    B = 'Cm7 | F7 | Bbmaj7 | Bbmaj7 | Am7 | D7 | Gm7 | C7'
    FORM = [A1, A2, B, A2]

    MEL_A = ('r:.5 A4:.5 C5:.5 E5:1 D5:.5 C5:1 | A4:1.5 F4:.5 A4:1 r:1 | r:.5 Bb4:.5 D5:.5 F5:1 E5:.5 D5:1 | '
             'Bb4:1.5 G4:.5 E4:1 r:1 | r:.5 C5:.5 E5:.5 G5:1 F5:.5 E5:1 | Eb5:1 D5:.5 C5:.5 A4:1 F#4:1 | ')
    MEL_A1_END = 'G4:.5 A4:.5 Bb4:.5 D5:1 F5:.5 E5:1 | G4:3 r:1'
    MEL_A2_END = 'D5:1 Bb4:1 E5:1 C5:.5 Bb4:.5 | A4:3 r:1'
    MEL_B = ('r:.5 G4:.5 Bb4:.5 Eb5:1.5 D5:.5 C5:.5 | Eb5:2 C5:1 A4:1 | D5:.5 F5:.5 A5:2.5 r:.5 | G5:1 F5:.5 D5:.5 Bb4:2 | '
             'r:.5 E5:.5 G5:.5 C6:1.5 B5:.5 A5:.5 | F#5:2 D5:1 C5:1 | Bb4:.5 C5:.5 D5:.5 F5:1 E5:.5 D5:1 | E5:1 G5:1 Bb5:1.5 r:.5')
    # second chorus: the trumpet answers with small rhythmic changes
    MEL_A_V = ('r:1 A4:.5 C5:.5 E5:1.5 D5:.5 | C5:.5 A4:1 F4:.5 A4:1 r:1 | r:1 Bb4:.5 D5:.5 F5:1.5 E5:.5 | '
               'D5:.5 Bb4:1 G4:.5 E4:1 r:1 | r:1 C5:.5 E5:.5 G5:1.5 F5:.5 | E5:.5 Eb5:.5 D5:.5 C5:.5 A4:1 F#4:1 | ')

    FILL_VIBES = {3: 'r:2 C6:.5 A5:.5 F5:1', 7: 'r:2 E5:.5 G5:.5 Bb5:1'}

    bar = 0
    for chorus in range(2):
        for sec, line in enumerate(FORM):
            ch = bars(line)
            b0 = bar * 4
            lead = 'vibes' if chorus == 0 else 'tpt'
            lv = 76 if chorus == 0 else 84
            if sec == 2:
                s.melody(lead, b0, MEL_B, vel=lv + 4)
            else:
                head = MEL_A if chorus == 0 else MEL_A_V
                end = MEL_A1_END if sec == 0 else MEL_A2_END
                s.melody(lead, b0, head + end, vel=lv)
            if chorus == 1 and sec != 2:
                # the vibes answer the trumpet at the ends of phrases
                for fb, txt in FILL_VIBES.items():
                    s.melody('vibes', b0 + fb * 4, txt, vel=60)
            # piano: Charleston comping on the A sections, longer chords on the bridge
            prev = None
            t = b0
            for sym, beats in ch:
                v = voice(Chord(sym), prev, 53, 72)
                prev = v
                if sec == 2:
                    s.chord_notes('piano', t, beats * 0.95, v, 50)
                else:
                    for at, d in ((0, 0.7), (1.5, 0.45)) if beats == 4 else ((0, 0.7),):
                        s.chord_notes('piano', t + at, d, v, 56 if at == 0 else 50)
                    if beats == 4 and (bar + (t - b0) // 4) % 2 == 1:
                        s.chord_notes('piano', t + 3.5, 0.4, v, 46)
                t += beats
            # bass: two-feel for the very first A, walking afterwards
            if chorus == 0 and sec == 0:
                t = b0
                for sym, beats in ch:
                    c = Chord(sym)
                    r = P('F1') + ((c.bass - 5) % 12)
                    if r > P('D2'):
                        r -= 12
                    s.note('bass', t, 1.9, r, 86)
                    s.note('bass', t + 2, 1.9, r + 7 if r + 7 <= P('C3') else r - 5, 78)
                    t += beats
            else:
                walking_bass(s, 'bass', ch, start_bar=bar)
            # drums: ride, hi-hat on 2 and 4, feathered kick, a fill into each section
            for k in range(8):
                bb = (bar + k) * 4
                for at, v in ((0, 58), (1, 66), (1.5, 44), (2, 58), (3, 66), (3.5, 44)):
                    s.note('drums', bb + at, 0.25, 51, v + (6 if chorus == 1 else 0))
                for at in (1, 3):
                    s.note('drums', bb + at, 0.2, 44, 52)
                for at in range(4):
                    s.note('drums', bb + at, 0.2, 36, 24)
                if k % 2 == 1:
                    s.note('drums', bb + 2.5, 0.15, 38, 26)
                if k == 7:
                    for i, at in enumerate((2, 2 + 2 / 3, 2 + 4 / 3, 3, 3 + 2 / 3)):
                        s.note('drums', bb + at, 0.15, 38, 40 + i * 6, swing=False)
            bar += 8

    s.finish(bar)

    return s


def menu():
    s = Song('menu', bpm=75, seed=3)
    s.part('piano', 0, 0, vol=104, pan=60, reverb=58)
    s.part('lh', 0, 1, vol=86, pan=56, reverb=58)
    s.part('tpt', 59, 2, vol=96, pan=72, reverb=54)
    s.part('strings', 49, 3, vol=80, pan=64, reverb=70, humanize=0.0)
    s.part('bass', 32, 4, vol=100, pan=64, reverb=30)
    s.part('drums', 40, 9, vol=70, pan=64, reverb=40)
    s.part('strmel', 48, 5, vol=90, pan=66, reverb=66)
    intro = 'Dm9 | Bbmaj7 | Gm9 | A7sus A7'
    A = 'Dm9 | Bbmaj7 | Gm7 | A7b9 | Dm9 | Bbmaj7 | Em7b5 A7 | Dm9'
    B = 'Fmaj7 | Am7 | Bbmaj7 | C7sus C7 | Fmaj7 | Dm7 | Gm7 | A7sus A7'
    mel_a = ('r:1 A4:.5 D5:.5 F5:1.5 E5:.5 | D5:2 C5:1 A4:1 | Bb4:1.5 A4:.5 G4:1 F4:1 | G4:1 F4:.5 E4:2.5 | '
             'r:1 A4:.5 D5:.5 A5:1.5 G5:.5 | F5:2 E5:1 D5:1 | G5:1 E5:1 C#5:1 Bb4:1 | D5:3 r:1')
    mel_b = ('C5:1 E5:1 G5:1.5 F5:.5 | E5:2 r:.5 C5:.5 D5:.5 E5:.5 | F5:1.5 D5:.5 Bb4:2 | C5:1 D5:1 E5:1 G5:1 | '
             'A5:2 G5:1 F5:1 | E5:1.5 D5:.5 C5:2 | Bb4:1 D5:1 F5:1 E5:1 | E5:2 C#5:2')
    # intro: piano alone, rolling
    arp_lh(s, 'lh', intro, 0, vel=56, pattern=(0, 7, 14, 16, 22, 16, 14, 7))
    for ln, b in ((intro, 0), (A, 4), (A, 12), (B, 20), (A, 28)):
        s.harmony_line(ln, b)
    # A: piano melody over broken chords and a soft bass
    s.melody('piano', 16, mel_a, vel=68)
    arp_lh(s, 'lh', A, 4, vel=46, pattern=(0, 7, 14, 16, 22, 16, 14, 7))
    two_feel(s, 'bass', A, 4, vel=70)
    # A': the muted trumpet takes it, strings enter, brushes
    s.melody('tpt', 48, mel_a, vel=78)
    comp_hold(s, 'lh', A, 12, vel=42, low=50, high=70)
    comp_hold(s, 'strings', A, 12, vel=34, low=55, high=79, kind='close')
    two_feel(s, 'bass', A, 12, vel=76)
    for k in range(8):
        bb = (12 + k) * 4
        for at in (1, 3):
            s.note('drums', bb + at, 0.3, 38, 30)
    # B: strings sing, piano answers with chords
    s.melody('strmel', 80, mel_b, vel=72)
    comp_hold(s, 'lh', B, 20, vel=44, low=50, high=70)
    two_feel(s, 'bass', B, 20, vel=78)
    for k in range(8):
        bb = (20 + k) * 4
        for at in (1, 3):
            s.note('drums', bb + at, 0.3, 38, 34)
    # A'': piano melody an octave up with strings underneath, thinning out towards the loop
    s.melody('piano', 112, mel_a, vel=66, octave=1)
    comp_hold(s, 'strings', A, 28, vel=30, low=55, high=79, kind='close')
    arp_lh(s, 'lh', A, 28, vel=44, pattern=(0, 7, 14, 16, 22, 16, 14, 7))
    two_feel(s, 'bass', A, 28, vel=68)
    s.finish(36, intro_bars=4)
    return s


def casino_night():
    s = Song('casino_night', bpm=80, swing=0.62, seed=21)
    s.part('sax', 66, 0, vol=92, pan=70, reverb=50)
    s.part('vibes', 11, 1, vol=92, pan=46, reverb=52)
    s.part('rhodes', 4, 2, vol=88, pan=56, reverb=44, chorus=30)
    s.part('bass', 32, 3, vol=112, pan=64, reverb=20, humanize=0.008)
    s.part('drums', 40, 9, vol=84, pan=64, reverb=34, humanize=0.006, vel_jitter=4)
    line = ('Cm9 | Cm9 | Fm9 | Fm9 | Cm9 | Ab7 G7b9 | Cm9 | Cm9 | '
            'Fm9 | Bb13 | Ebmaj7 | Abmaj7 | Dm7b5 | G7b9 | Cm9 Ab7 | Dm7b5 G7b9')
    mel1 = ('r:1 G4:.5 Bb4:.5 C5:1.5 Eb5:.5 | D5:2 C5:1 r:1 | r:1 Ab4:.5 C5:.5 Eb5:1.5 F5:.5 | G5:2 F5:1 r:1 | '
            'Eb5:1.5 D5:.5 C5:1 Bb4:1 | C5:1 Gb4:1 F4:1 Ab4:1 | G4:3 r:1 | r:2 Eb5:.5 D5:.5 C5:1 | '
            'Ab4:2 C5:1 Eb5:1 | D5:1.5 C5:.5 Ab4:2 | G4:1 Bb4:1 D5:1.5 Eb5:.5 | C5:3 r:1 | '
            'r:.5 F4:.5 Ab4:.5 C5:1.5 D5:.5 F5:.5 | Eb5:1 D5:.5 B4:.5 Ab4:2 | C5:2 C5:1 Gb4:1 | F4:2 B4:1 D5:1')
    mel2 = ('r:.5 G4:.5 Bb4:.5 C5:1 Eb5:.5 D5:1 | C5:1.5 Bb4:.5 C5:1 r:1 | r:.5 Ab4:.5 C5:.5 Eb5:1 F5:.5 G5:1 | '
            'F5:1.5 Eb5:.5 F5:1 r:1 | Eb5:1 D5:.5 C5:.5 Bb4:1 G4:1 | C5:1 Gb4:1 F4:.5 G4:.5 Ab4:1 | G4:3 r:1 | '
            'r:2 G5:.5 F5:.5 Eb5:1 | C5:2 Eb5:1 F5:1 | D5:1 C5:.5 Bb4:.5 Ab4:2 | Bb4:1 D5:1 F5:1.5 G5:.5 | '
            'Eb5:3 r:1 | r:.5 Ab4:.5 C5:.5 D5:1.5 F5:.5 Ab5:.5 | G5:1 F5:.5 D5:.5 B4:2 | C5:2 Eb5:1 C5:1 | Ab4:2 B4:1 D5:1')
    s.melody('sax', 0, mel1, vel=74)
    s.melody('vibes', 64, mel2, vel=74)
    for half in range(2):
        b0 = half * 16
        s.harmony_line(line, b0)
        # Rhodes: held chords with a soft push on the "and" of 4
        t = b0 * 4
        prev = None
        for sym, beats in bars(line):
            v = voice(Chord(sym), prev, 52, 72)
            prev = v
            s.chord_notes('rhodes', t, beats * 0.6, v, 50)
            if beats == 4:
                s.chord_notes('rhodes', t + 3.5, 0.45, v, 40)
            t += beats
        if half == 0:
            two_feel(s, 'bass', line, b0, vel=80)
        else:
            walking_bass(s, 'bass', bars(line), start_bar=b0, vel=80)
        for k in range(16):
            bb = (b0 + k) * 4
            for at, v in ((0, 50), (1, 56), (1.5, 38), (2, 50), (3, 56), (3.5, 38)):
                s.note('drums', bb + at, 0.25, 51, v)
            for at in (1, 3):
                s.note('drums', bb + at, 0.3, 38, 34 if half == 0 else 40)
            if k == 15:
                for i, at in enumerate((2, 2 + 2 / 3, 2 + 4 / 3, 3, 3 + 2 / 3)):
                    s.note('drums', bb + at, 0.15, 38, 30 + i * 5, swing=False)
    s.finish(32)
    return s


def highlimit():
    s = Song('highlimit', bpm=60, seed=31)
    s.part('piano', 0, 0, vol=104, pan=58, reverb=62)
    s.part('lh', 0, 1, vol=84, pan=56, reverb=62)
    s.part('harp', 46, 2, vol=78, pan=80, reverb=66)
    s.part('strings', 49, 3, vol=78, pan=60, reverb=72, humanize=0.0)
    s.part('bass', 32, 4, vol=96, pan=64, reverb=34)
    s.part('celesta', 8, 5, vol=70, pan=40, reverb=70)
    A = 'Dbmaj9 | Bbm9 | Ebm9 | Ab13 | Fm7 | Bb7b9 | Ebm9 | Ab13'
    A2 = 'Dbmaj9 | Bbm9 | Ebm9 | Ab13 | Gbmaj9 | Fm7 Bb7b9 | Ebm9 Ab13 | Dbmaj9'
    B = 'Gbmaj9 | Gbm6 | Fm7 | Bbm9 | Ebm9 | Ab13 | Dbmaj9 Bbm9 | Ebm9 Ab13'
    mel_a = ('F5:1.5 Eb5:.5 Ab4:2 | r:.5 Db5:.5 F5:.5 Ab5:.5 C6:2 | Bb5:1.5 Gb5:.5 F5:2 | Eb5:1 F5:1 C5:2 | '
             'Ab5:1.5 G5:.5 F5:1 Eb5:1 | D5:2 Cb5:1 Ab4:1 | Gb4:1 Bb4:1 Db5:1 F5:1 | Eb5:3 r:1')
    mel_a2 = ('F5:1.5 Eb5:.5 Ab4:2 | r:.5 Db5:.5 F5:.5 Ab5:.5 C6:2 | Bb5:1.5 Gb5:.5 F5:2 | Eb5:1 F5:1 C5:2 | '
              'Bb5:2 Ab5:1 F5:1 | Eb5:1 C5:1 D5:1 Ab4:1 | Gb4:1 Bb4:1 C5:1 Eb5:1 | Db5:3 r:1')
    mel_b = ('r:1 Bb4:.5 Db5:.5 F5:2 | Eb5:1.5 Db5:.5 A4:2 | Ab4:1 C5:1 Eb5:1 G5:1 | F5:2 Db5:1 C5:1 | '
             'Bb4:1.5 Db5:.5 Gb5:2 | F5:1 Eb5:1 C5:2 | Ab4:1 F5:1 Db5:1 C5:1 | Bb4:1 Gb4:1 F4:1 Eb4:1')
    s.melody('piano', 0, mel_a, vel=66)
    s.melody('piano', 32, mel_a2, vel=68)
    s.melody('piano', 64, mel_b, vel=70)
    for sec, (line, b0) in enumerate(((A, 0), (A2, 8), (B, 16))):
        s.harmony_line(line, b0)
        comp_hold(s, 'lh', line, b0, vel=40, low=48, high=66)
        arp_lh(s, 'harp', line, b0, vel=40, pattern=(0, 7, 14, 16, 19, 22, 24, 19), step=0.5)
        two_feel(s, 'bass', line, b0, vel=66)
        if sec > 0:
            comp_hold(s, 'strings', line, b0, vel=30 + sec * 4, low=55, high=80, kind='close')
    for at in (8 * 4 - 1.5, 16 * 4 - 1.5, 24 * 4 - 1.5):
        for i, p in enumerate(('Ab5', 'Db6', 'F6')):
            s.note('celesta', at + i * 0.25, 1.2, P(p), 44)
    s.finish(24)
    return s


def poker():
    s = Song('poker', bpm=100, swing=0.6, seed=41)
    s.part('bass', 32, 0, vol=114, pan=64, reverb=22, humanize=0.006)
    s.part('rhodes', 4, 1, vol=86, pan=48, reverb=44, chorus=24)
    s.part('tpt', 59, 2, vol=92, pan=76, reverb=46)
    s.part('vibes', 11, 3, vol=86, pan=40, reverb=50)
    s.part('drums', 32, 9, vol=82, pan=64, reverb=28, humanize=0.006, vel_jitter=4)
    riff = 'r:1 A2:.5 B2:.5 C3:.5 D3:.5 E3:.5 C3:.5 | D3:1.5 r:2.5'
    def section(b0, transpose, with_tpt, with_vibes):
        for k in range(0, 8, 2):
            s.melody('bass', (b0 + k) * 4, riff, vel=84, transpose=transpose)
            # the two-chord answer: E-A-D-G-B, then a whole step down
            hi = [P('E4'), P('A4'), P('D5'), P('G5'), P('B5')]
            lo = [x - 2 for x in hi]
            t = (b0 + k + 1) * 4
            s.chord_notes('rhodes', t + 1.5, 0.45, [x + transpose - 12 for x in hi], 54)
            s.chord_notes('rhodes', t + 2, 1.2, [x + transpose - 12 for x in lo], 50)
        ride_swing(s, 'drums', b0, 8, vel=54, fills=(b0 + 7,), kick=False)
        if with_tpt:
            phr = ('r:1 A4:1 C5:.5 D5:1.5 | r:2 E5:.5 D5:.5 C5:1 | A4:2 G4:1 F4:1 | E4:3 r:1 | '
                   'r:1 D5:.5 E5:.5 F5:1 G5:1 | A5:2 G5:.5 E5:.5 D5:1 | C5:1 A4:1 G4:1 E4:1 | D4:3 r:1')
            s.melody('tpt', b0 * 4, phr, vel=72, transpose=transpose)
        if with_vibes:
            phr = ('r:2 A4:.5 D5:.5 F5:1 | E5:2 r:2 | r:2 C5:.5 E5:.5 G5:1 | F5:2 r:2 | '
                   'r:1 A5:.5 G5:.5 F5:.5 E5:.5 D5:1 | C5:2 r:2 | r:2 E5:.5 D5:.5 C5:1 | A4:3 r:1')
            s.melody('vibes', b0 * 4, phr, vel=66, transpose=transpose)
    section(0, 0, False, False)
    section(8, 0, True, False)
    section(16, 1, False, True)
    section(24, 0, True, False)
    s.finish(32)
    return s


def city_day():
    s = Song('city_day', bpm=100, seed=51)
    s.part('guitar', 25, 0, vol=92, pan=40, reverb=36)
    s.part('marimba', 12, 1, vol=104, pan=70, reverb=34)
    s.part('flute', 73, 2, vol=82, pan=76, reverb=46)
    s.part('bass', 33, 3, vol=104, pan=64, reverb=16, humanize=0.006)
    s.part('glock', 9, 4, vol=66, pan=30, reverb=50)
    s.part('drums', 0, 9, vol=78, pan=64, reverb=20, humanize=0.005, vel_jitter=4)
    V = 'G | D/F# | Em7 | Cmaj7 | G | D | Cadd9 | D'
    C = 'C | D | Bm7 | Em7 | Am7 | D7 | G | G'
    mel_v = ('r:.5 D5:.5 G5:.5 B5:.5 A5:1 G5:1 | F#5:1.5 E5:.5 D5:2 | r:.5 E5:.5 G5:.5 B5:.5 A5:1 G5:1 | E5:1.5 D5:.5 B4:2 | '
             'D5:.5 E5:.5 G5:1 B5:1 A5:1 | A5:1.5 F#5:.5 D5:2 | E5:1 D5:.5 C5:.5 D5:1 E5:1 | F#5:2 A5:2')
    mel_c = ('G5:1.5 E5:.5 C5:1 E5:1 | F#5:1.5 D5:.5 A4:1 D5:1 | D5:1 F#5:1 A5:1.5 B5:.5 | G5:3 r:1 | '
             'C6:1.5 B5:.5 A5:1 G5:1 | F#5:1 E5:1 D5:1 C5:1 | B4:1 D5:1 G5:2 | r:4')
    for rep in range(2):
        b0 = rep * 16
        s.melody('marimba', b0 * 4, mel_v, vel=78)
        s.melody('marimba', (b0 + 8) * 4, mel_c, vel=82)
        if rep == 1:
            s.melody('flute', b0 * 4, mel_v, vel=60, octave=0)
            s.melody('flute', (b0 + 8) * 4, mel_c, vel=64, octave=0)
        for line, bb in ((V, b0), (C, b0 + 8)):
            s.harmony_line(line, bb)
            t = bb * 4
            for sym, beats in bars(line):
                c = Chord(sym)
                r = nearest(c.bass, P('E3'))
                if r > P('A3'):
                    r -= 12
                v = voice(c, None, P('G3'), P('E5'), 'close', 3)
                pat = [r, v[0], v[1], v[2], r + 12 if r + 12 < v[0] else v[0], v[1], v[2], v[1]]
                for i, n in enumerate(pat):
                    s.note('guitar', t + i * 0.5, 0.9, n, 58 if i % 4 == 0 else 48)
                # bass: root, a push on the "and" of 2, the fifth on 3
                br = bass_root(c, 'E1', 'D2') + 12
                s.note('bass', t, 1.4, br, 82)
                s.note('bass', t + 1.5, 0.45, br, 64)
                s.note('bass', t + 2, 1.4, br + 7 if br + 7 <= P('D3') else br - 5, 74)
                s.note('bass', t + 3.5, 0.45, br, 60)
                t += beats
        s.drums('drums', b0, 16, {36: 'x.......x.o.....', 37: '....x.......x...', 82: 'o-o-o-o-o-o-o-o-'},
                vel={'x': 70, 'o': 46, '-': 30})
        for at in ((b0 + 15) * 4 + 2,):
            for i, p in enumerate(('D6', 'G6', 'B6')):
                s.note('glock', at + i * 0.5, 0.5, P(p), 50)
    s.finish(32)
    return s


def city_night():
    s = Song('city_night', bpm=80, swing=0.6, swing16=True, seed=61)
    s.part('rhodes', 4, 0, vol=96, pan=50, reverb=46, chorus=40)
    s.part('vibes', 11, 1, vol=88, pan=74, reverb=56)
    s.part('flute', 73, 2, vol=76, pan=70, reverb=58)
    s.part('bass', 33, 3, vol=108, pan=64, reverb=14, humanize=0.006)
    s.part('drums', 8, 9, vol=76, pan=64, reverb=22, humanize=0.006, vel_jitter=3)
    A = 'Fmaj9 | Em7 A7b9 | Dm9 | Cmaj9 | Bbmaj7 | Am7 | Gm9 | C13'
    B = 'Bbmaj7 | C/Bb | Am7 | Dm9 | Gm9 | C13 | Fmaj9 | Fmaj9'
    mel = ('r:1 A4:.5 C5:.5 E5:1 G5:1 | G5:1 E5:1 C#5:1 Bb4:1 | A4:1.5 C5:.5 E5:2 | D5:1 E5:1 B4:2 | '
           'r:.5 D5:.5 F5:.5 A5:.5 G5:1 F5:1 | E5:2 C5:1 A4:1 | Bb4:1 D5:1 F5:1 A5:1 | G5:2 E5:1 r:1')
    mel_b = ('F5:2 D5:1 Bb4:1 | E5:2 G5:1 E5:1 | C5:1.5 E5:.5 G5:2 | F5:1 E5:1 D5:1 A4:1 | '
             'Bb4:2 A4:1 F4:1 | E4:1 G4:1 A4:1 Bb4:1 | A4:3 r:1 | r:4')
    form = [(A, None), (A, mel), (B, mel_b), (A, mel)]
    for i, (line, m) in enumerate(form):
        b0 = i * 8
        s.harmony_line(line, b0)
        t = b0 * 4
        prev = None
        for sym, beats in bars(line):
            v = voice(Chord(sym), prev, 53, 74)
            prev = v
            s.chord_notes('rhodes', t, min(beats, 2) * 0.9, v, 52, roll=0.03)
            if beats == 4:
                s.chord_notes('rhodes', t + 2.75, 1.0, v, 42)
            c = Chord(sym)
            br = bass_root(c, 'E1', 'D2') + 12
            s.note('bass', t, 1.2, br, 84)
            if beats == 4:
                s.note('bass', t + 1.75, 0.4, br, 60)
                s.note('bass', t + 2.5, 1.2, br + 7 if br + 7 <= P('D3') else br - 5, 72)
            t += beats
        if m:
            s.melody('vibes' if i != 2 else 'flute', b0 * 4, m, vel=70 if i != 2 else 62)
        s.drums('drums', b0, 8, {36: 'x......x..x.....', 38: '....x.......x...', 42: 'o-o-o-o-o-o-o-o-'},
                vel={'x': 64, 'o': 40, '-': 24})
    s.finish(32)
    return s


def home():
    s = Song('home', bpm=72, seed=71)
    s.part('piano', 0, 0, vol=100, pan=60, reverb=56)
    s.part('lh', 0, 1, vol=86, pan=56, reverb=56)
    s.part('pad', 89, 2, vol=56, pan=64, reverb=70, humanize=0.0)
    A = 'Cmaj7 | Am7 | Fmaj7 | G6 | Em7 | Am7 | Dm7 | G7sus G7'
    B = 'Fmaj7 | Em7 | Dm7 | Cmaj7 | Bbmaj7 | Am7 | Dm7 | G7'
    m1 = ('E5:1.5 D5:.5 C5:1 G4:1 | A4:2 C5:1 E5:1 | F5:1.5 E5:.5 C5:2 | D5:2 B4:1 r:1 | '
          'G4:1 B4:1 E5:1.5 D5:.5 | C5:2 A4:2 | F4:1 A4:1 C5:1 E5:1 | D5:2 B4:2')
    m2 = ('E5:1.5 G5:.5 E5:1 C5:1 | A4:1.5 B4:.5 C5:1 E5:1 | A5:1.5 G5:.5 F5:2 | E5:1 D5:1 B4:2 | '
          'G4:.5 A4:.5 B4:1 E5:1.5 G5:.5 | E5:2 C5:2 | F5:1 E5:1 D5:1 C5:1 | C5:2 B4:2')
    mb = ('A4:1 C5:1 E5:2 | D5:1 B4:1 G4:2 | F4:1 A4:1 C5:1.5 D5:.5 | E5:2 G5:2 | '
          'F5:1.5 D5:.5 Bb4:2 | C5:1.5 E5:.5 A5:2 | G5:1 F5:1 E5:1 D5:1 | B4:2 D5:1 F5:1')
    for (line, m, b0) in ((A, m1, 0), (A, m2, 8), (B, mb, 16)):
        s.harmony_line(line, b0)
        s.melody('piano', b0 * 4, m, vel=60)
        arp_lh(s, 'lh', line, b0, vel=44, pattern=(0, 7, 16, 7, 12, 7, 16, 7))
        if b0 >= 8:
            comp_hold(s, 'pad', line, b0, vel=30, low=55, high=76, kind='close')
    s.finish(24)
    return s


def cafe():
    s = Song('cafe', bpm=125, seed=81)
    s.part('guitar', 24, 0, vol=100, pan=46, reverb=34)
    s.part('flute', 73, 1, vol=88, pan=72, reverb=48)
    s.part('piano', 0, 2, vol=90, pan=60, reverb=44)
    s.part('bass', 32, 3, vol=108, pan=64, reverb=18, humanize=0.006)
    s.part('drums', 0, 9, vol=72, pan=64, reverb=20, humanize=0.004, vel_jitter=3)
    line = ('Dm9 | G13 | Cmaj9 | A7b9 | Dm9 | G13 | Em7 A7 | Dm7 G7 | '
            'Cmaj9 | Cm9 F13 | Bbmaj7 | Bbm6 Eb9 | Am7 | D7b9 | Dm9 | G13')
    mel = ('r:.5 A4:.5 C5:.5 E5:1.5 D5:1 | E5:2 B4:1 r:1 | r:.5 G4:.5 B4:.5 D5:1.5 C5:1 | Bb4:2 C#5:1 r:1 | '
           'r:.5 F5:.5 E5:.5 D5:1.5 A4:1 | B4:2 E5:1 D5:1 | G4:1 B4:1 C#5:1 E5:1 | F5:2 D5:1 B4:1 | '
           'C5:3 r:1 | Eb5:1.5 D5:.5 C5:1 A4:1 | D5:2 F5:1 A5:1 | G5:1.5 Db5:.5 F5:1 Db5:1 | '
           'C5:1.5 E5:.5 G5:2 | F#5:1 Eb5:1 C5:1 A4:1 | F5:2 E5:1 C5:1 | B4:2 r:2')
    s.melody('flute', 0, mel, vel=70)
    s.melody('piano', 64, mel, vel=66)
    # guitar: bossa comp, thumb on 1 and 3
    hits = (0, 3, 6, 10, 13)
    for half in range(2):
        s.harmony_line(line, half * 16)
        t = half * 64
        prev = None
        for k, (sym, beats) in enumerate(bars(line)):
            c = Chord(sym)
            v = voice(c, prev, 55, 72, 'rootless', 3)
            prev = v
            start_step = int(round((t % 8) * 2))
            for st in hits:
                pos = st * 0.5
                if start_step <= st < start_step + beats * 2:
                    s.chord_notes('guitar', (t - t % 8) + pos, 0.45, v, 52)
            r = nearest(c.bass, P('D3'))
            if r > P('A3'):
                r -= 12
            for i in range(int(beats // 2)):
                s.note('guitar', t + i * 2, 0.9, r if i % 2 == 0 else r + 7 - (12 if r + 7 > P('B3') else 0), 54)
            # bass: dotted root, fifth on the "and" of 2
            br = bass_root(c, 'E1', 'D2') + 12
            for i in range(int(beats // 2)):
                s.note('bass', t + i * 2, 1.4, br if i % 2 == 0 else br + 7 - (12 if br + 7 > P('D3') else 0), 80)
                s.note('bass', t + i * 2 + 1.5, 0.45, br + 7 - (12 if br + 7 > P('D3') else 0), 64)
            t += beats
    s.drums('drums', 0, 32, {36: 'x.......o.......', 37: 'x..x..x...x..x..'[:16], 82: '-o-o-o-o-o-o-o-o'},
            vel={'x': 58, 'o': 40, '-': 26})
    s.finish(32)
    return s


def bar():
    s = Song('bar', bpm=72, swing=0.667, seed=91)
    s.part('piano', 0, 0, vol=100, pan=56, reverb=46)
    s.part('lh', 0, 1, vol=84, pan=52, reverb=46)
    s.part('sax', 66, 2, vol=96, pan=72, reverb=48)
    s.part('bass', 32, 3, vol=112, pan=64, reverb=20, humanize=0.008)
    s.part('drums', 40, 9, vol=82, pan=64, reverb=30, humanize=0.006, vel_jitter=4)
    line = 'Bb7 | Eb7 | Bb7 | Bb7 | Eb7 | Edim7 | Bb7 | G7b9 | Cm7 | F7 | Bb7 G7 | Cm7 F7'
    m1 = ('r:.5 F4:.5 Ab4:.5 Bb4:1.5 Db5:.5 D5:.5 | F5:2 Eb5:1 Db5:1 | Bb4:1.5 G4:.5 F4:2 | r:2 Ab4:.5 Bb4:.5 Db5:.5 D5:.5 | '
          'Eb5:1.5 G5:.5 Bb5:1 G5:1 | Bb5:1 G5:1 E5:1 Db5:1 | D5:1.5 Bb4:.5 F4:2 | r:1 B4:1 Ab4:1 F4:1 | '
          'Eb4:1 G4:1 Bb4:1.5 C5:.5 | A4:2 Eb5:1 C5:1 | Bb4:1.5 D5:.5 B4:1 F4:1 | Eb4:1 G4:1 A4:1 C5:1')
    m2 = ('r:1 F4:.5 G4:.5 Bb4:1 Ab4:1 | G4:1.5 Eb4:.5 Db4:2 | r:1 D4:.5 F4:.5 Bb4:1.5 C5:.5 | Db5:.5 D5:1.5 Bb4:1 r:1 | '
          'Eb4:1 G4:1 Bb4:1 Db5:1 | E5:1.5 Db5:.5 Bb4:1 G4:1 | F4:3 r:1 | r:.5 D4:.5 F4:.5 Ab4:.5 B4:2 | '
          'C5:1.5 Bb4:.5 G4:1 Eb4:1 | F4:1 A4:1 C5:1 Eb5:1 | D5:2 B4:1 Ab4:1 | G4:1 Eb4:1 F4:1 A4:1')
    s.melody('piano', 0, m1, vel=68)
    s.melody('sax', 48, m2, vel=76)
    for ch in range(2):
        b0 = ch * 12
        s.harmony_line(line, b0)
        t = b0 * 4
        prev = None
        for sym, beats in bars(line):
            v = voice(Chord(sym), prev, 50, 68)
            prev = v
            # shuffle stabs on 2 and 4 (and their pushes)
            for at in ((1, 3) if beats == 4 else (1,)):
                s.chord_notes('lh', t + at, 0.45, v, 46 if ch == 0 else 52)
            if beats == 4 and ch == 1:
                s.chord_notes('lh', t + 3.5, 0.3, v, 40)
            t += beats
        walking_bass(s, 'bass', bars(line), start_bar=b0, vel=80)
        for k in range(12):
            bb = (b0 + k) * 4
            for at, v in ((0, 46), (1, 52), (1.5, 34), (2, 46), (3, 52), (3.5, 34)):
                s.note('drums', bb + at, 0.25, 51, v)
            for at in (1, 3):
                s.note('drums', bb + at, 0.3, 38, 40)
    s.finish(24)
    return s


def upscale():
    s = Song('upscale', bpm=72, beats_per_bar=3, seed=101)
    s.part('piano', 0, 0, vol=100, pan=60, reverb=60)
    s.part('lh', 0, 1, vol=86, pan=56, reverb=60)
    s.part('strings', 49, 2, vol=74, pan=64, reverb=72, humanize=0.0)
    A = 'G | D/F# | Em | C | G/D | D7 | G | D'
    A2 = 'G | D/F# | Em | C | Am | D7 | G | G'
    B = 'Em | B7 | Em | A7 | D | A7 | D | D7'
    mA = 'D5:1 G5:1 B5:1 | A5:1.5 G5:.5 F#5:1 | G5:1 E5:1 B4:1 | C5:1.5 D5:.5 E5:1 | D5:1 B4:1 G4:1 | A4:1 C5:1 F#5:1 | G5:1 F#5:.5 E5:.5 D5:1 | A4:3'
    mA2 = 'D5:1 G5:1 B5:1 | A5:1.5 G5:.5 F#5:1 | G5:1 B5:1 E6:1 | E6:1.5 D6:.5 C6:1 | C6:1 A5:1 E5:1 | F#5:1 A5:1 C6:1 | B5:1 A5:.5 F#5:.5 D5:1 | G5:3'
    mB = 'B4:1 E5:1 G5:1 | F#5:1.5 E5:.5 D#5:1 | E5:1 G5:1 B5:1 | A5:1.5 G5:.5 C#5:1 | D5:1 F#5:1 A5:1 | G5:1 E5:1 C#5:1 | D5:1 A4:1 F#4:1 | A4:1 C5:1 F#5:1'
    form = [(A, mA), (A2, mA2), (B, mB), (A2, mA2)]
    for i, (line, m) in enumerate(form):
        b0 = i * 8
        s.harmony_line(line, b0)
        s.melody('piano', b0 * 3, m, vel=64 + (4 if i == 2 else 0))
        t = b0 * 3
        prev = None
        for sym, beats in bars(line, 3):
            c = Chord(sym)
            r = nearest(c.bass, P('G2'))
            if r > P('C3'):
                r -= 12
            v = voice(c, prev, P('G3'), P('D5'), 'close', 3)
            prev = v
            s.note('lh', t, 0.95, r, 58)
            s.chord_notes('lh', t + 1, 0.6, v, 40)
            s.chord_notes('lh', t + 2, 0.6, v, 38)
            t += beats
        if i >= 1:
            comp_hold(s, 'strings', line, b0, vel=26 + (6 if i == 2 else 0), low=55, high=79, kind='close')
    s.finish(32)
    return s


def shop():
    s = Song('shop', bpm=100, seed=111)
    s.part('guitar', 27, 0, vol=92, pan=70, reverb=40, chorus=50)
    s.part('rhodes', 4, 1, vol=88, pan=46, reverb=40, chorus=30)
    s.part('bass', 33, 2, vol=104, pan=64, reverb=14, humanize=0.006)
    s.part('drums', 0, 9, vol=70, pan=64, reverb=18, humanize=0.004, vel_jitter=3)
    A = 'Ebmaj7 | Cm7 | Fm7 | Bb7 | Gm7 | C7 | Fm7 | Bb7'
    A2 = 'Ebmaj7 | Cm7 | Fm7 | Bb7 | Gm7 | C7 | Fm7 Bb7 | Ebmaj7'
    B = 'Abmaj7 | Bb7 | Gm7 | Cm7 | Fm7 | Bb7 | Ebmaj7 | Bb9sus'
    head = 'G4:1 Bb4:1 D5:1.5 C5:.5 | Bb4:2 G4:1 Eb4:1 | Ab4:1 C5:1 Eb5:1.5 D5:.5 | C5:2 Ab4:1 r:1 | Bb4:1 D5:1 F5:1.5 Eb5:.5 | E5:2 G4:1 Bb4:1 | '
    mA = head + 'Ab4:1.5 G4:.5 F4:1 Ab4:1 | D5:3 r:1'
    mA2 = head + 'Ab4:1 C5:1 D5:1 F5:1 | Eb5:3 r:1'
    mB = 'C5:1.5 Eb5:.5 G5:2 | F5:1.5 D5:.5 Ab4:2 | Bb4:1 D5:1 F5:2 | Eb5:2 G5:1 Bb4:1 | Ab4:2 C5:1 Eb5:1 | D5:2 F5:1 Ab5:1 | G5:3 Bb4:1 | C5:2 Eb5:2'
    for i, (line, m) in enumerate(((A, mA), (A2, mA2), (B, mB), (A2, mA2))):
        b0 = i * 8
        s.harmony_line(line, b0)
        s.melody('guitar', b0 * 4, m, vel=70)
        t = b0 * 4
        prev = None
        for sym, beats in bars(line):
            c = Chord(sym)
            v = voice(c, prev, 52, 72)
            prev = v
            if beats == 4:
                s.chord_notes('rhodes', t, 1.4, v, 48)
                s.chord_notes('rhodes', t + 1.5, 0.4, v, 40)
                s.chord_notes('rhodes', t + 2.5, 1.4, v, 44)
            else:
                s.chord_notes('rhodes', t, beats * 0.9, v, 46)
            br = bass_root(c, 'E1', 'D2') + 12
            s.note('bass', t, 0.9, br, 80)
            if beats == 4:
                s.note('bass', t + 1.5, 0.45, br + 7 - (12 if br + 7 > P('D3') else 0), 62)
                s.note('bass', t + 2, 0.9, br + 7 - (12 if br + 7 > P('D3') else 0), 72)
                s.note('bass', t + 3, 0.9, br + 12 if br + 12 <= P('D3') else br, 64)
            t += beats
        s.drums('drums', b0, 8, {36: 'x.......x.......', 37: '....x.......x...', 42: 'o.o.o.o.o.o.o.o.'},
                vel={'x': 60, 'o': 38, '-': 24})
    s.finish(32)
    return s


def skyline():
    """The casino's members' floor: a slow lounge ballad in E-flat for alto sax, Rhodes and brushes."""
    s = Song('skyline', bpm=75, swing=0.6, seed=131)
    s.part('sax', 65, 0, vol=94, pan=70, reverb=54)
    s.part('vibes', 11, 1, vol=88, pan=44, reverb=56)
    s.part('rhodes', 4, 2, vol=86, pan=56, reverb=48, chorus=24)
    s.part('bass', 32, 3, vol=110, pan=64, reverb=22, humanize=0.008)
    s.part('drums', 40, 9, vol=80, pan=64, reverb=36, humanize=0.006, vel_jitter=4)
    s.part('strings', 49, 4, vol=70, pan=60, reverb=74, humanize=0.0)
    A1 = 'Ebmaj9 | Cm9 | Fm9 | Bb13 | Gm7 | C7b9 | Fm9 | Bb13'
    A2 = 'Ebmaj9 | Cm9 | Fm9 | Bb13 | Abmaj9 | Abm6 Db9 | Gm7 C7b9 | Fm9 Bb13'
    B = 'Bbm7 | Eb9 | Abmaj9 | Abmaj9 | Am7 | D7b9 | Gm7 C7 | Fm9 Bb13'
    A3 = 'Ebmaj9 | Cm9 | Fm9 | Bb13 | Abmaj9 | Abm6 Db9 | Gm7 C7b9 | Fm7 Bb13'
    head = 'r:1 Bb4:.5 C5:.5 D5:1.5 Eb5:.5 | G5:2 F5:1 Eb5:1 | r:.5 Ab4:.5 C5:.5 Eb5:1.5 G5:1 | F5:1.5 Eb5:.5 D5:2 | '
    m_a1 = head + 'r:.5 D5:.5 F5:.5 Bb5:1.5 A5:1 | G5:1.5 E5:.5 Db5:2 | C5:1 Eb5:1 Ab5:1 G5:1 | F5:3 r:1'
    m_a2 = head + 'r:.5 C5:.5 Eb5:.5 G5:1.5 Bb5:1 | B4:1 F5:1 Eb5:1 B4:1 | Bb4:1 D5:1 E5:1 Db5:1 | C5:2 D5:1 r:1'
    m_b = ('r:1 Db5:.5 F5:.5 Ab5:2 | G5:1.5 F5:.5 Db5:2 | Eb5:1 G5:1 Bb5:1 C6:1 | Bb5:2 G5:2 | '
           'r:.5 E5:.5 G5:.5 C6:1.5 B5:1 | A5:1.5 F#5:.5 Eb5:2 | D5:1 F5:1 E5:1 G5:1 | Ab5:2 G5:1 F5:1')
    m_a3 = head + 'r:.5 C5:.5 Eb5:.5 G5:1.5 Bb5:1 | B4:1 F5:1 Eb5:1 B4:1 | Bb4:1 D5:1 E5:1 Db5:1 | Ab4:1 C5:1 D5:2'
    # second time the vibes take the tune, pushed a little later in the bar
    vhead = 'r:1.5 Bb4:.5 C5:.5 D5:1 Eb5:.5 | G5:1.5 F5:1 Eb5:1.5 | r:1 Ab4:.5 C5:.5 Eb5:1 G5:1 | F5:1.5 Eb5:.5 D5:2 | '
    v_a1 = vhead + 'r:1 D5:.5 F5:.5 Bb5:1 A5:1 | G5:1 E5:1 Db5:2 | C5:.5 Eb5:.5 Ab5:1.5 G5:1.5 | F5:3 r:1'
    v_a2 = vhead + 'r:1 C5:.5 Eb5:.5 G5:1 Bb5:1 | B4:1.5 F5:.5 Eb5:1 B4:1 | Bb4:.5 D5:.5 E5:1.5 Db5:1.5 | C5:2 D5:1 r:1'
    v_a3 = vhead + 'r:1 C5:.5 Eb5:.5 G5:1 Bb5:1 | B4:1.5 F5:.5 Eb5:1 B4:1 | Bb4:.5 D5:.5 E5:1.5 Db5:1.5 | Ab4:1 C5:1 D5:2'
    form = [A1, A2, B, A3]
    mels = [[m_a1, m_a2, m_b, m_a3], [v_a1, v_a2, m_b, v_a3]]
    for chorus in range(2):
        for sec, line in enumerate(form):
            b0 = chorus * 32 + sec * 8
            s.harmony_line(line, b0)
            lead = 'sax' if chorus == 0 else 'vibes'
            s.melody(lead, b0 * 4, mels[chorus][sec], vel=72 + (4 if sec == 2 else 0))
            # Rhodes: soft held chords, a push on the "and" of 2 in full bars
            t = b0 * 4
            prev = None
            for sym, beats in bars(line):
                v = voice(Chord(sym), prev, 51, 72)
                prev = v
                s.chord_notes('rhodes', t, beats * 0.55, v, 46)
                if beats == 4:
                    s.chord_notes('rhodes', t + 2.5, 1.2, v, 36)
                t += beats
            if chorus == 0:
                two_feel(s, 'bass', line, b0, vel=76)
            else:
                walking_bass(s, 'bass', bars(line), start_bar=b0, vel=74)
            if chorus == 1 or sec == 2:
                comp_hold(s, 'strings', line, b0, vel=24 + (6 if sec == 2 else 0), low=55, high=79, kind='close')
            for k in range(8):
                bb = (b0 + k) * 4
                for at, v in ((0, 42), (1, 48), (1.5, 32), (2, 42), (3, 48), (3.5, 32)):
                    s.note('drums', bb + at, 0.25, 51, v)
                for at in (1, 3):
                    s.note('drums', bb + at, 0.3, 38, 26 if chorus == 0 else 32)
            if sec == 3:
                # the sax answers the vibes in the last eight
                if chorus == 1:
                    s.melody('sax', (b0 + 4) * 4, 'r:2 G4:1 Bb4:1 | D5:4 | r:2 Db5:1 Bb4:1 | Ab4:4', vel=58)
    s.finish(64)
    return s


def spa():
    """The spa upstairs: slow harp and strings in D, a flute now and then."""
    s = Song('spa', bpm=60, beats_per_bar=3, seed=141)
    s.part('harp', 46, 0, vol=92, pan=50, reverb=70)
    s.part('strings', 49, 1, vol=72, pan=70, reverb=78, humanize=0.0)
    s.part('flute', 73, 2, vol=78, pan=60, reverb=66)
    s.part('celesta', 8, 3, vol=62, pan=36, reverb=74)
    s.part('bass', 32, 4, vol=84, pan=64, reverb=40)
    A = 'Dmaj9 | Gmaj7#11 | Bm9 | Gmaj9 | Dmaj9 | Em9 | Gmaj7#11 | A9sus'
    B = 'Bm9 | Gmaj9 | Em9 | A9sus | Dmaj9 | F#m7 | Gmaj7#11 | A9sus'
    m_a = 'F#5:3 | E5:1.5 D5:1.5 | C#5:3 | D5:1 E5:1 F#5:1 | A5:3 | G5:1.5 F#5:1.5 | E5:3 | r:3'
    m_b = 'D5:3 | B4:1.5 D5:1.5 | G5:3 | E5:3 | F#5:1 E5:1 D5:1 | C#5:3 | D5:1.5 E5:1.5 | E5:3'
    form = [(A, None), (A, m_a), (B, m_b), (A, None)]
    for sec, (line, mel) in enumerate(form):
        b0 = sec * 8
        s.harmony_line(line, b0)
        arp_lh(s, 'harp', line, b0, vel=44, pattern=(0, 7, 14, 16, 19, 14), step=0.5)
        comp_hold(s, 'strings', line, b0, vel=22 + (4 if sec == 2 else 0), low=50, high=74, kind='close')
        t = b0 * 3
        for sym, beats in bars(line, 3):
            c = Chord(sym)
            r = nearest(c.bass, P('D2'))
            if r > P('A2'):
                r -= 12
            s.note('bass', t, beats * 0.95, r, 50)
            t += beats
        if mel:
            s.melody('flute', b0 * 3, mel, vel=56)
    for bar in (7, 15, 23, 31):
        for i, p in enumerate(('A5', 'D6', 'F#6', 'A6')):
            s.note('celesta', bar * 3 + i * 0.5, 1.6, P(p), 34)
    s.finish(32)
    return s


TRACKS = {f.__name__: f for f in (menu, casino_day, casino_night, highlimit, poker, city_day, city_night, home, cafe, bar, upscale, shop, skyline, spa)}

ROLES = {
    'menu': {'piano': 'lead', 'lh': 'comp', 'tpt': 'lead', 'strings': 'pad', 'bass': 'bass', 'drums': 'brush', 'strmel': 'lead'},
    'casino_day': {'vibes': 'lead', 'tpt': 'lead', 'piano': 'comp', 'bass': 'bass', 'drums': 'drums'},
    'casino_night': {'sax': 'lead', 'vibes': 'lead', 'rhodes': 'comp', 'bass': 'bass', 'drums': 'brush'},
    'highlimit': {'piano': 'lead', 'lh': 'comp', 'harp': 'arp', 'strings': 'pad', 'bass': 'bass', 'celesta': 'accent'},
    'poker': {'bass': 'riff', 'rhodes': 'comp', 'tpt': 'lead', 'vibes': 'lead', 'drums': 'drums'},
    'city_day': {'guitar': 'comp', 'marimba': 'lead', 'flute': 'lead2', 'bass': 'bass', 'glock': 'accent', 'drums': 'perc'},
    'city_night': {'rhodes': 'comp', 'vibes': 'lead', 'flute': 'lead', 'bass': 'bass', 'drums': 'drums'},
    'home': {'piano': 'lead', 'lh': 'comp', 'pad': 'pad'},
    'cafe': {'guitar': 'comp', 'flute': 'lead', 'piano': 'lead', 'bass': 'bass', 'drums': 'perc'},
    'bar': {'piano': 'lead', 'lh': 'comp', 'sax': 'lead', 'bass': 'bass', 'drums': 'brush'},
    'upscale': {'piano': 'lead', 'lh': 'comp', 'strings': 'pad'},
    'shop': {'guitar': 'lead', 'rhodes': 'comp', 'bass': 'bass', 'drums': 'drums'},
    'skyline': {'sax': 'lead', 'vibes': 'lead', 'rhodes': 'comp', 'bass': 'bass', 'drums': 'brush', 'strings': 'pad'},
    'spa': {'harp': 'arp', 'strings': 'pad', 'flute': 'lead', 'celesta': 'accent', 'bass': 'bass'},
}

ROOMS = {  # rt60 (s), wet level
    'menu': (2.2, 0.45), 'casino_day': (1.4, 0.36), 'casino_night': (1.8, 0.42), 'highlimit': (2.4, 0.5),
    'poker': (1.5, 0.38), 'city_day': (1.2, 0.3), 'city_night': (1.6, 0.4), 'home': (1.6, 0.36), 'cafe': (1.2, 0.32),
    'bar': (1.4, 0.36), 'upscale': (2.2, 0.46), 'shop': (1.2, 0.3), 'skyline': (2.0, 0.44), 'spa': (2.8, 0.52),
}

if __name__ == '__main__':
    names = sys.argv[1:] or list(TRACKS)
    for n in names:
        rt, wet = ROOMS[n]
        song = autobalance(TRACKS[n](), ROLES[n])
        print(song.render(rt60=rt, wet=wet))
