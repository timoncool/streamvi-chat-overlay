"""Собирает assets/icon.ico (256x256 PNG) из той же отрисовки, что и icon.png."""
import os
import struct
import zlib

SS = 2
SIZE = 256
W = SIZE * SS


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    dx, dy = x - cx, y - cy
    return dx * dx + dy * dy <= r * r


def inside_triangle(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1, d2, d3 = sign((px, py), a, b), sign((px, py), b, c), sign((px, py), c, a)
    neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (neg and pos)


def render():
    scale = SIZE / 64.0
    px = [[(0.0, 0.0, 0.0, 0.0) for _ in range(W)] for _ in range(W)]
    for y in range(W):
        for x in range(W):
            u = (x / SS) / scale
            v = (y / SS) / scale
            if inside_round_rect(u, v, 3, 3, 61, 61, 14):
                t = max(0.0, min(1.0, (v - 3) / 58))
                px[y][x] = (155 - 31 * t, 92 - 34 * t, 246 - 9 * t, 255.0)
    for y in range(W):
        for x in range(W):
            u = (x / SS) / scale
            v = (y / SS) / scale
            if inside_round_rect(u, v, 15, 17, 49, 41, 9) or inside_triangle(u, v, (21, 37), (21, 48), (32, 37)):
                px[y][x] = (255.0, 255.0, 255.0, 255.0)
            elif any((u - cx) ** 2 + (v - 29) ** 2 <= 2.6 ** 2 for cx in (23, 32, 41)):
                px[y][x] = (124.0, 58.0, 237.0, 255.0)
    out = bytearray()
    for by in range(SIZE):
        out.append(0)
        for bx in range(SIZE):
            r = g = b = a = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    pr, pg, pb, pa = px[by * SS + sy][bx * SS + sx]
                    r += pr; g += pg; b += pb; a += pa
            n = SS * SS
            out += bytes((int(r / n), int(g / n), int(b / n), int(a / n)))
    return bytes(out)


def png_bytes(width, height, raw):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    return b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b'')


def main():
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    png = png_bytes(SIZE, SIZE, render())
    header = struct.pack('<HHH', 0, 1, 1)
    entry = struct.pack('<BBBBHHII', 0, 0, 0, 0, 1, 32, len(png), 6 + 16)
    path = os.path.join(here, 'assets', 'icon.ico')
    with open(path, 'wb') as f:
        f.write(header + entry + png)
    print('written', path, len(png))


if __name__ == '__main__':
    main()
