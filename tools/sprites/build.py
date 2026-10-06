#!/usr/bin/env python3
"""Builds hooks/sprite.ts (and the preview images in docs/) for blade-of-commits.

Malenia is described as polygons in normalized coordinates (0..1, x right, y down),
rasterized at each size the mod draws, shaded per material and outlined. The small
terminal variant is drawn by hand below, since 20 × 24 pixels is too few for the shapes.

    python3 tools/sprites/build.py

No dependencies beyond the Python standard library.
"""

import math
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]

PALETTE = {
    'W': '#e9cf86', 'w': '#9c7a34',  # wings
    'Y': '#c9a24a', 'y': '#7a5c22', 'L': '#efd58a',  # gold
    'k': '#1c1612',  # visor slit
    'S': '#a3302f', 's': '#6a1a1e',  # scarf
    'F': '#b8935f', 'f': '#7d5f3c',  # fur collar
    'C': '#6e1f2e', 'c': '#41121c', 'G': '#b5893a',  # cape
    'D': '#857262', 'd': '#5b4b3f',  # dress
    'M': '#a4a8ad', 'm': '#666a70',  # chainmail
    'o': '#140e0e',  # outline
    'K': '#e3b99c', 'j': '#b3826a', 'p': '#b5645a',  # skin, shadow, lips
    'R': '#c8352a', 'r': '#7e1d1a', 'O': '#f0603f',  # hair
}

# Shapes, back to front: (points, color, shading, layer). Layer h sways, w flaps, b is still.
SHAPES = []


def shape(points, color, shade=None, layer='b'):
    SHAPES.append((points, color, shade, layer))


# long red hair behind the body
shape([(0.43, 0.09), (0.57, 0.09), (0.61, 0.18), (0.63, 0.30), (0.62, 0.42), (0.57, 0.46),
       (0.43, 0.46), (0.38, 0.42), (0.37, 0.30), (0.39, 0.18)], 'R', 'hair', 'h')
# cape behind, blowing to the right
shape([(0.55, 0.17), (0.65, 0.19), (0.75, 0.38), (0.86, 0.60), (0.90, 0.70), (0.76, 0.68),
       (0.64, 0.56), (0.58, 0.36)], 'C', 'cape', 'h')
shape([(0.42, 0.18), (0.36, 0.22), (0.37, 0.32), (0.42, 0.26)], 'C', 'cape', 'h')
# dress: bodice, pleated skirt, chainmail panel, belt
shape([(0.43, 0.21), (0.57, 0.21), (0.585, 0.34), (0.565, 0.40), (0.435, 0.40), (0.415, 0.34)], 'D', 'pleat')
shape([(0.435, 0.39), (0.565, 0.39), (0.60, 0.68), (0.635, 0.95), (0.365, 0.95), (0.40, 0.68)], 'D', 'pleat')
shape([(0.475, 0.40), (0.525, 0.40), (0.545, 0.93), (0.455, 0.93)], 'M', 'mail')
shape([(0.43, 0.385), (0.57, 0.385), (0.575, 0.41), (0.425, 0.41)], 'm')
# sandals
shape([(0.42, 0.93), (0.48, 0.93), (0.485, 0.985), (0.415, 0.985)], 'Y')
shape([(0.52, 0.93), (0.58, 0.93), (0.585, 0.985), (0.515, 0.985)], 'Y')
# left arm (right side of the picture): sleeve, gauntlet, open hand
shape([(0.555, 0.22), (0.60, 0.23), (0.64, 0.34), (0.605, 0.355)], 'D', 'pleat')
shape([(0.605, 0.34), (0.64, 0.335), (0.68, 0.45), (0.65, 0.465)], 'Y', 'metal')
shape([(0.645, 0.45), (0.685, 0.445), (0.69, 0.49), (0.655, 0.50)], 'Y')
# prosthetic arm (left side of the picture), the katana hand at the bottom
shape([(0.385, 0.19), (0.45, 0.19), (0.445, 0.25), (0.38, 0.255)], 'L')
shape([(0.40, 0.24), (0.44, 0.24), (0.405, 0.34), (0.37, 0.46), (0.325, 0.455), (0.36, 0.33)], 'Y', 'metal')
shape([(0.32, 0.44), (0.37, 0.44), (0.365, 0.49), (0.32, 0.49)], 'L')
# red scarf, fur collar
shape([(0.40, 0.19), (0.60, 0.19), (0.635, 0.225), (0.585, 0.255), (0.415, 0.255), (0.37, 0.225)], 'S', 'scarf')
shape([(0.44, 0.195), (0.56, 0.195), (0.605, 0.215), (0.555, 0.225), (0.445, 0.225), (0.395, 0.205)], 'F', 'fur')
# two small, steep wings on the helmet
shape([(0.475, 0.07), (0.455, 0.02), (0.43, -0.035), (0.415, -0.06), (0.42, -0.01), (0.435, 0.04), (0.45, 0.09)], 'W', 'wing', 'w')
shape([(0.525, 0.07), (0.545, 0.02), (0.57, -0.035), (0.585, -0.06), (0.58, -0.01), (0.565, 0.04), (0.55, 0.09)], 'W', 'wing', 'w')
# face: chin and mouth below the helmet, neck
shape([(0.455, 0.11), (0.545, 0.11), (0.55, 0.15), (0.525, 0.185), (0.475, 0.185), (0.45, 0.15)], 'K', 'skin')
shape([(0.48, 0.18), (0.52, 0.18), (0.52, 0.20), (0.48, 0.20)], 'j')
# strands of hair beside the face, over the shoulders
shape([(0.42, 0.10), (0.455, 0.11), (0.45, 0.16), (0.44, 0.22), (0.42, 0.30), (0.40, 0.36), (0.385, 0.32),
       (0.395, 0.22), (0.405, 0.15)], 'R', 'hair', 'h')
shape([(0.58, 0.10), (0.545, 0.11), (0.55, 0.16), (0.56, 0.22), (0.58, 0.30), (0.60, 0.36), (0.615, 0.32),
       (0.605, 0.22), (0.595, 0.15)], 'R', 'hair', 'h')
# helmet: the upper half of the head only
shape([(0.465, 0.055), (0.535, 0.055), (0.57, 0.075), (0.585, 0.105), (0.575, 0.13), (0.425, 0.13),
       (0.415, 0.105), (0.43, 0.075)], 'Y', 'helm')

WIDEN = 1.4  # the shapes are drawn slim; widen them so the figure reads at low resolution
TOP = 0.09  # room above the wing tips


def to_shape_space(x, y, w, h):
    return 0.5 + ((x + 0.5) / w - 0.5) / WIDEN, ((y + 0.5) / h - TOP) / (1 - TOP)


# the katana hand, as a fraction of the figure's width and height
HAND = (0.5 + (0.345 - 0.5) * WIDEN, TOP + 0.47 * (1 - TOP))


def inside(px, py, poly):
    hit = False
    for i in range(len(poly)):
        x1, y1 = poly[i]
        x2, y2 = poly[(i + 1) % len(poly)]
        if (y1 > py) != (y2 > py) and px < (x2 - x1) * (py - y1) / (y2 - y1) + x1:
            hit = not hit
    return hit


def shade(kind, color, u, v, x, y, h):
    if kind == 'cape':
        return 'c' if math.sin(u * 45 + v * 12) > 0.55 else 'C'
    if kind == 'pleat':
        return 'd' if x % 2 == 0 and v > 0.42 else 'D'
    if kind == 'mail':
        return 'm' if (y % 2 == 0 and x % 2 == 0) or (y % 2 == 1 and x % 2 == 1 and (x + y) % 4 == 0) else 'M'
    if kind == 'metal':
        return 'L' if (x + y) % 5 == 0 else ('y' if u > 0.6 or u < 0.35 else 'Y')
    if kind == 'helm':
        return 'L' if u < 0.49 and v < 0.11 else ('y' if u > 0.545 else 'Y')
    if kind == 'skin':
        if abs(v - 0.158) < 0.55 / h and abs(u - 0.5) < 0.016:
            return 'p'
        return 'j' if v > 0.178 or abs(u - 0.5) > 0.042 else 'K'
    if kind == 'hair':
        s = math.sin((u - 0.5) * 70 + v * 10 + math.sin(v * 14) * 1.5)
        return 'O' if s > 0.8 else ('r' if s < -0.45 else 'R')
    if kind == 'scarf':
        return 's' if v > 0.22 else 'S'
    if kind == 'fur':
        return 'f' if (x + 2 * y) % 4 == 0 else 'F'
    if kind == 'wing':
        return 'w' if u < 0.43 or u > 0.57 else 'W'
    return color


def outline(grid, layers):
    """Adds a dark outline around the figure; an outline pixel moves with the layer it borders."""
    h, w = len(grid), len(grid[0])
    out = [row[:] for row in grid]
    for y in range(h):
        for x in range(w):
            if grid[y][x] is not None:
                continue
            near = [(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))
                    if 0 <= y + dy < h and 0 <= x + dx < w and grid[y + dy][x + dx]]
            if near:
                out[y][x] = 'o'
                kinds = [layers[b][a] for a, b in near]
                layers[y][x] = 'h' if 'h' in kinds else 'w' if 'w' in kinds else 'b'
    return [''.join(c or '.' for c in row) for row in out], [''.join(row) for row in layers]


def rasterize(w, h):
    grid = [[None] * w for _ in range(h)]
    layers = [['.'] * w for _ in range(h)]
    for points, color, kind, layer in SHAPES:
        for y in range(h):
            for x in range(w):
                u, v = to_shape_space(x, y, w, h)
                if inside(u, v, points):
                    grid[y][x] = shade(kind, color, u, v, x, y, h)
                    layers[y][x] = layer
    # the helmet's eye slit and middle ridge
    for y in range(h):
        for x in range(w):
            u, v = to_shape_space(x, y, w, h)
            if grid[y][x] in ('Y', 'L', 'y') and layers[y][x] == 'b':
                if abs(v - 0.10) < 0.6 / h and 0.455 < u < 0.545 and abs(u - 0.5) > 0.012:
                    grid[y][x] = 'k'
                if abs(u - 0.5) < 0.6 / w and 0.06 < v < 0.095:
                    grid[y][x] = 'y'
    return outline(grid, layers)


# The small terminal variant, drawn by hand (the outline is added automatically).
SMALL_FILL = [
    "....................",
    "......W......W......",
    "......WW....WW......",
    ".......WwYYwW.......",
    ".......YLLYYy.......",
    "......RykkkkyR......",
    "......RjKKKKjR......",
    ".....rRRKppKRRr.....",
    "....rRSFFFFFFSRC....",
    "....RRSssssssSRCC...",
    "...rRLYDDDDDDdRCCc..",
    "...rRYyDDDDDDdRCCc..",
    "....RYyDDDDDDdRCCcc.",
    "....OYdyyLLyydYCCcc.",
    "....L.dDDMmDDd.LCCcC",
    "......dDDmMDDd..CCcC",
    "......dDDMmDDd..cCCc",
    ".....dDDDmMDDDd..Ccc",
    ".....dDDDMmDDDd...cc",
    ".....dDDDmMDDDd.....",
    ".....dDDDMmDDDd.....",
    "....dDDDDmMDDDDd....",
    "....dDDDDMmDDDDd....",
    ".....YYY....YYY.....",
]
SMALL_HAND = (4, 14)


def hand_drawn(fill):
    grid = [[None if c == '.' else c for c in row] for row in fill]
    layers = [[('h' if c in 'RrOCc' else 'w' if c in 'Ww' else 'b') if c else '.' for c in row] for row in grid]
    return outline(grid, layers)


def ts_array(name, rows):
    return f"export const {name} = [\n" + ''.join(f"  '{r}',\n" for r in rows) + "]\n"


def hex_rgb(color):
    color = color.lstrip('#')
    return tuple(int(color[i:i + 2], 16) for i in (0, 2, 4))


def write_png(path, grid, scale, background=(32, 32, 32)):
    h, w = len(grid), len(grid[0])
    raw = b''
    for y in range(h * scale):
        raw += b'\x00'
        for x in range(w * scale):
            c = grid[y // scale][x // scale]
            raw += bytes(hex_rgb(PALETTE[c]) if c != '.' else background)

    def chunk(kind, data):
        return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff)

    header = struct.pack('>IIBBBBB', w * scale, h * scale, 8, 2, 0, 0, 0)
    path.write_bytes(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', header) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b''))


def main():
    big, big_layer = rasterize(40, 48)
    medium, medium_layer = rasterize(30, 36)
    small, small_layer = hand_drawn(SMALL_FILL)
    palette = ''.join(f"  {k}: '{v}',\n" for k, v in PALETTE.items())
    source = f"""// Generated by tools/sprites/build.py - edit the shapes there, not this file.
// Malenia: winged helmet over the upper face, chin and long red hair below, scarf with
// fur collar, crimson cape, pleated dress with a chainmail panel, golden prosthetic arm.
// Each character is a PALETTE color, '.' is empty. *_LAYER: h = hair and cape (they sway),
// w = wings (they flap), b = everything else.

export const PALETTE: Record<string, string> = {{
{palette}}}

// The hand holding the katana (left side of the picture), as a fraction of the figure's size
export const HAND = {{ x: {HAND[0]:.3f}, y: {HAND[1]:.3f} }}

// Desktop (40 × 48)
{ts_array('BIG', big)}
{ts_array('BIG_LAYER', big_layer)}
// Terminal, small variant (20 × 24), drawn by hand
{ts_array('SMALL', small)}
// The katana hand in SMALL, in pixels
export const SMALL_HAND = {{ x: {SMALL_HAND[0]}, y: {SMALL_HAND[1]} }}

{ts_array('SMALL_LAYER', small_layer)}
// Terminal, large variant (30 × 36)
{ts_array('MEDIUM', medium)}
{ts_array('MEDIUM_LAYER', medium_layer)}"""
    (ROOT / 'hooks' / 'sprite.ts').write_text(source)
    docs = ROOT / 'docs'
    docs.mkdir(exist_ok=True)
    write_png(docs / 'malenia-desktop.png', big, 8)
    write_png(docs / 'malenia-terminal-large.png', medium, 8)
    write_png(docs / 'malenia-terminal-small.png', small, 8)
    print('wrote hooks/sprite.ts and docs/malenia-*.png')


if __name__ == '__main__':
    main()
