"""Synthesise every CueMaster sound as an original WAV.

python3 tools/build_sounds.py
Writes mobile/assets/audio/<name>.wav (44.1 kHz, mono, 16-bit). Table sounds are modal: a hard
ball is a click plus a few damped resonances, a cushion is a soft thump, a pocket is a drop and a
rattle. Interface sounds are bells and chimes built from inharmonic partials, so they sit
politely over the table rather than beeping at the player.
"""
import os, wave
import numpy as np

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "mobile/assets/audio")
RATE = 44100
rng = np.random.default_rng(11)


def t(seconds):
    return np.arange(int(RATE * seconds)) / RATE


def modes(freqs, decays_ms, amps, seconds, phase_jitter=True):
    x = t(seconds)
    out = np.zeros_like(x)
    for f, d, a in zip(freqs, decays_ms, amps):
        ph = rng.uniform(0, 2 * np.pi) if phase_jitter else 0
        out += a * np.exp(-x / (d / 1000)) * np.sin(2 * np.pi * f * x + ph)
    return out


def noise(seconds, decay_ms, colour=0.0):
    x = t(seconds)
    n = rng.standard_normal(len(x))
    if colour:  # a one-pole low-pass: 0 is white, near 1 is a dull rumble
        y = np.zeros_like(n)
        for i in range(1, len(n)):
            y[i] = colour * y[i - 1] + (1 - colour) * n[i]
        n = y / (np.abs(y).max() or 1)
    return n * np.exp(-x / (decay_ms / 1000))


def bell(freq, seconds, decay=0.35, partials=((1, 1), (2.0, 0.45), (2.76, 0.3), (5.4, 0.12))):
    x = t(seconds)
    out = np.zeros_like(x)
    for ratio, a in partials:
        out += a * np.exp(-x / (decay / ratio ** 0.5)) * np.sin(2 * np.pi * freq * ratio * x)
    attack = np.minimum(1, x / 0.004)
    return out * attack


def place(total, pieces):
    """Mix (offset seconds, signal) pieces into one buffer `total` seconds long."""
    out = np.zeros(int(RATE * total))
    for at, sig in pieces:
        i = int(at * RATE)
        n = min(len(sig), len(out) - i)
        out[i:i + n] += sig[:n]
    return out


def write(name, sig, peak=0.9):
    sig = sig / (np.abs(sig).max() or 1) * peak
    fade = min(len(sig), int(RATE * 0.004))
    sig[-fade:] *= np.linspace(1, 0, fade)
    data = (np.clip(sig, -1, 1) * 32767).astype("<i2")
    with wave.open(os.path.join(OUT, name + ".wav"), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(data.tobytes())
    print("wrote", name, f"{len(sig) / RATE:.2f}s")


os.makedirs(OUT, exist_ok=True)

# ---- the table -------------------------------------------------------------------------------
# Two phenolic balls: a hard click with bright, very short ringing.
write("ball", modes([3480, 4870, 6810, 9150], [9, 6, 4, 2.5], [1, 0.6, 0.38, 0.22], 0.07)
      + 0.5 * noise(0.07, 0.5), 0.85)
# Leather tip on the cue ball: a duller "tock" with a woody body.
write("cue", modes([1150, 2310, 3720], [14, 9, 5], [1, 0.5, 0.25], 0.09)
      + 0.9 * modes([185], [22], [1], 0.09) + 0.35 * noise(0.09, 1.2), 0.85)
# Rubber cushion: a padded thump.
write("rail", modes([142, 305], [34, 18], [1, 0.45], 0.13) + 0.5 * noise(0.13, 28, colour=0.92), 0.8)
# Pocket: the drop, two rattles against the jaws, then the roll down the return.
write("pocket", place(0.42, [
    (0.0, modes([96, 210], [60, 30], [1, 0.4], 0.3)),
    (0.022, 0.35 * modes([2400, 3150], [6, 4], [1, 0.6], 0.03)),
    (0.058, 0.22 * modes([2650, 3500], [5, 3], [1, 0.5], 0.03)),
    (0.08, 0.32 * noise(0.34, 110, colour=0.97)),
]), 0.8)
# The shot clock's last seconds: a dry wooden tick.
write("countdown", modes([1600, 3300], [12, 6], [1, 0.4], 0.06) + 0.2 * noise(0.06, 0.8), 0.7)

# ---- the club --------------------------------------------------------------------------------
write("tap", modes([1850, 3700], [5, 3], [1, 0.35], 0.03) + 0.15 * noise(0.03, 0.6), 0.5)
write("tick", modes([3100, 5200], [4, 2], [1, 0.4], 0.02), 0.5)
# Coins: a quick cascade of small metallic clinks.
write("coins", place(0.5, [
    (i * 0.045 + rng.uniform(0, 0.012), (0.9 - i * 0.08) * modes(
        rng.uniform(3000, 4200, 3) * [1, 1.37, 1.91], [40, 26, 18], [1, 0.6, 0.35], 0.16))
    for i in range(8)
]), 0.75)
# A reward landing: two bright bells and a little sparkle on top.
write("reward", place(0.9, [
    (0.0, bell(1318.5, 0.9, 0.32)),
    (0.09, 0.85 * bell(1975.5, 0.8, 0.3)),
    (0.05, 0.12 * noise(0.5, 120) * np.sin(2 * np.pi * 31 * t(0.5)) ** 2),
]), 0.75)
# Brass-like voice for the fanfares: falling harmonics, a quick swell, a little vibrato.
def brass(freq, seconds, attack=0.025, release=0.3, harmonics=9):
    x = t(seconds)
    phase = 2 * np.pi * freq * (x + 0.0012 * np.sin(2 * np.pi * 5.5 * x))
    out = sum((1 / n ** 1.15) * np.sin(n * phase) for n in range(1, harmonics + 1))
    env = np.minimum(1, x / attack) * np.clip((seconds - x) / release, 0, 1)
    return out * env * (0.75 + 0.25 * np.exp(-x / 0.12))


def crash(seconds, decay=0.7):
    n = noise(seconds, decay * 1000)
    return np.diff(n, prepend=0)  # high-passed: the shimmer, not the rumble


def kick(seconds=0.35):
    x = t(seconds)
    sweep = np.sin(2 * np.pi * np.cumsum(55 + 75 * np.exp(-x / 0.03)) / RATE)
    return sweep * np.exp(-x / 0.12)


def snare(seconds=0.12, decay_ms=38):
    return 0.8 * noise(seconds, decay_ms) + 0.5 * modes([190, 330], [30, 18], [1, 0.5], seconds)


# Victory: a brass fanfare (G-C, then a held C-major chord) over a crash and the old bells.
write("win", place(1.9, [
    (0.0, 0.7 * brass(392.0, 0.16, release=0.05)),
    (0.17, 0.75 * brass(523.3, 0.16, release=0.05)),
    (0.34, sum(brass(f, 1.35, release=0.6) for f in (523.3, 659.3, 784.0))),
    (0.34, 0.55 * crash(1.4)),
    (0.34, 0.9 * kick()),
    (0.36, 0.5 * bell(1046.5, 1.2, 0.5)),
    (0.48, 0.35 * bell(1568.0, 1.0, 0.45)),
]), 0.85)
# Defeat: three falling brass notes and a soft drum, clear without rubbing it in.
write("lose", place(1.35, [
    (0.0, 0.8 * brass(392.0, 0.24, release=0.08)),
    (0.26, 0.8 * brass(311.1, 0.24, release=0.08)),
    (0.52, brass(261.6, 0.8, release=0.5)),
    (0.52, 0.6 * kick(0.4)),
]), 0.7)
# The drum roll before a result: a snare roll that tightens and swells, then one hit.
roll = []
at, gap = 0.0, 0.075
while at < 1.2:
    roll.append((at, (0.3 + 0.7 * at / 1.2) * snare(0.1, 30)))
    at += gap
    gap = max(0.032, gap * 0.96)
write("drumroll", place(1.55, roll + [(1.22, kick(0.33)), (1.22, 0.9 * snare(0.3, 90))]), 0.8)
# A crate bursting open: an upward whoosh into a sparkle.
x = t(0.45)
sweep = np.sin(2 * np.pi * np.cumsum(300 + 2800 * (x / 0.45) ** 2) / RATE)
write("whoosh", place(0.9, [
    (0.0, 0.5 * sweep * noise(0.45, 400) * np.minimum(1, x / 0.3)),
    (0.38, bell(1567.98, 0.5, 0.25)),
    (0.44, 0.7 * bell(2349.3, 0.45, 0.22)),
]), 0.7)
# An opponent found: a rising two-note chime.
write("match", place(0.7, [(0.0, bell(880.0, 0.5, 0.3)), (0.12, bell(1318.5, 0.55, 0.35))]), 0.7)
# Searching for an opponent: a soft sonar ping, repeated by the search screen.
write("search", place(0.9, [(0.0, bell(1046.5, 0.9, 0.42, ((1, 1), (2.0, 0.18)))), (0.0, 0.25 * bell(523.3, 0.6, 0.3, ((1, 1),)))]), 0.4)
# Your turn: a quick rising pair, brighter than a tap.
write("turn", place(0.45, [(0.0, bell(784.0, 0.3, 0.18)), (0.08, 1.1 * bell(1174.7, 0.36, 0.22))]), 0.6)
# Level up: a quick ascending run to a held bell.
write("levelup", place(1.2, [
    (i * 0.07, (0.7 + i * 0.1) * bell(f, 0.7, 0.3))
    for i, f in enumerate([783.99, 987.77, 1174.66, 1567.98])
]), 0.75)
write("error", place(0.3, [(0.0, bell(220.0, 0.25, 0.1, ((1, 1), (2.0, 0.4)))), (0.09, bell(207.6, 0.2, 0.08, ((1, 1),)))]), 0.5)
