"""Генерирует assets/icon.png (64x64) без внешних зависимостей."""
import os
import struct
import zlib

SS = 4
SIZE = 64
W = SIZE * SS


def inside_round_rect(x, y, x0, y0, x1, y1, r):
    if x < x0 or x > x1 or y < y0 or y > y1:
        return False
    cx = min(max(x, x0 + r), x1 - r)
    cy = min(max(y, y0 + r), y1 - r)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= r * r


def inside_triangle(px, py, a, b, c):
    def sign(p1, p2, p3):
        return (p1[0] - p3[0]) * (p2[1] - p3[1]) - (p2[0] - p3[0]) * (p1[1] - p3[1])
    d1 = sign((px, py), a, b)
    d2 = sign((px, py), b, c)
    d3 = sign((px, py), c, a)
    neg = (d1 < 0) or (d2 < 0) or (d3 < 0)
    pos = (d1 > 0) or (d2 > 0) or (d3 > 0)
    return not (neg and pos)


def render():
    # RGBA float buffer with supersampling
    px = [[(0.0, 0.0, 0.0, 0.0) for _ in range(W)] for _ in range(W)]

    for y in range(W):
        for x in range(W):
            u = x / SS
            v = y / SS
            if inside_round_rect(u, v, 3, 3, 61, 61, 14):
                t = max(0.0, min(1.0, (v - 3) / 58))
                r = 155 - 31 * t
                g = 92 - 34 * t
                b = 246 - 9 * t
                px[y][x] = (r, g, b, 255.0)

    # speech bubble body
    for y in range(W):
        for x in range(W):
            u = x / SS
            v = y / SS
            if inside_round_rect(u, v, 15, 17, 49, 41, 9):
                px[y][x] = (255.0, 255.0, 255.0, 255.0)
    # bubble tail
    for y in range(W):
        for x in range(W):
            u = x / SS
            v = y / SS
            if inside_triangle(u, v, (21, 37), (21, 48), (32, 37)):
                px[y][x] = (255.0, 255.0, 255.0, 255.0)
    # three dots
    for cy in (29,):
        for cx in (23, 32, 41):
            for y in range(W):
                for x in range(W):
                    u = x / SS
                    v = y / SS
                    if (u - cx) ** 2 + (v - cy) ** 2 <= 2.6 ** 2:
                        px[y][x] = (124.0, 58.0, 237.0, 255.0)

    out = bytearray()
    for by in range(SIZE):
        out.append(0)
        for bx in range(SIZE):
            r = g = b = a = 0.0
            for sy in range(SS):
                for sx in range(SS):
                    pr, pg, pb, pa = px[by * SS + sy][bx * SS + sx]
                    r += pr
                    g += pg
                    b += pb
                    a += pa
            n = SS * SS
            out += bytes((int(r / n), int(g / n), int(b / n), int(a / n)))
    return bytes(out)


def write_png(path, width, height, rgba):
    raw = rgba
    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0)
    png = (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr)
           + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


if __name__ == '__main__':
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    os.makedirs(os.path.join(here, 'assets'), exist_ok=True)
    write_png(os.path.join(here, 'assets', 'icon.png'), SIZE, SIZE, render())
    print('written', os.path.join(here, 'assets', 'icon.png'))
