# -*- coding: utf-8 -*-
"""ホーム画面に おく アイコンを つくる。

絵の 道具は つかわずに、点を 1つずつ ぬって PNG に する。
形は かんたん（角まるの 四角・三角・ひしがた）なので これで 足りる。
ふちが ぎざぎざに ならないよう、3ばいの 大きさで ぬってから ちぢめる。

つかい方
  python make_icons.py
"""
import io
import os
import struct
import zlib

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

INK   = (0x1E, 0x1C, 0x14, 255)
MAIN  = (0xE1, 0xDD, 0x60, 255)
PINK  = (0xF2, 0xA0, 0xB8, 255)
CLEAR = (0, 0, 0, 0)

SS = 3                      # 3ばいで ぬって ちぢめる


def rounded_rect(x, y, w, h, r):
    """角まるの 四角の 中か どうかを 返す 関数"""
    def inside(px, py):
        if px < x or py < y or px > x + w or py > y + h:
            return False
        # 角の まるみ
        for cx, cy in ((x + r, y + r), (x + w - r, y + r),
                       (x + r, y + h - r), (x + w - r, y + h - r)):
            if ((px < x + r) == (cx == x + r)) and ((py < y + r) == (cy == y + r)):
                if (px < x + r or px > x + w - r) and (py < y + r or py > y + h - r):
                    return (px - cx) ** 2 + (py - cy) ** 2 <= r * r
        return True
    return inside


def in_poly(pts):
    def inside(px, py):
        n = len(pts)
        c = False
        j = n - 1
        for i in range(n):
            xi, yi = pts[i]
            xj, yj = pts[j]
            if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
                c = not c
            j = i
        return c
    return inside


def draw(size, maskable):
    S = size * SS
    px = [[CLEAR] * S for _ in range(S)]

    base = S / 512.0
    pad = (96 if maskable else 40) * base
    x, y = pad, pad
    w = h = S - pad * 2
    r = w * 0.22
    lw = 22 * base                     # わくの ふとさ

    outer = rounded_rect(x, y, w, h, r)
    inner = rounded_rect(x + lw, y + lw, w - lw * 2, h - lw * 2, max(1, r - lw))

    # ▶
    cx, cy = x + w * 0.46, y + h * 0.5
    t = w * 0.24
    tri = in_poly([(cx - t * 0.55, cy - t), (cx + t * 0.9, cy), (cx - t * 0.55, cy + t)])

    # ピンクの ひしがた
    dx, dy = x + w * 0.80, y + h * 0.78
    s = w * 0.115
    dia = in_poly([(dx, dy - s), (dx + s, dy), (dx, dy + s), (dx - s, dy)])
    dia_in = in_poly([(dx, dy - s * 0.7), (dx + s * 0.7, dy),
                      (dx, dy + s * 0.7), (dx - s * 0.7, dy)])

    for j in range(S):
        row = px[j]
        for i in range(S):
            a, b = i + 0.5, j + 0.5
            if maskable:
                row[i] = MAIN                     # 切られても よいように 全面
            if outer(a, b):
                row[i] = MAIN if inner(a, b) else INK
            if tri(a, b):
                row[i] = INK
            if dia(a, b):
                row[i] = PINK if dia_in(a, b) else INK
    return shrink(px, S, size)


def shrink(px, S, size):
    """3x3 を 1つに まとめる（ぎざぎざ よけ）"""
    out = []
    for j in range(size):
        row = bytearray()
        for i in range(size):
            r = g = b = a = 0
            for jj in range(SS):
                for ii in range(SS):
                    c = px[j * SS + jj][i * SS + ii]
                    # すけている ぶんは 色を かけ算して から たす
                    r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3]
            n = SS * SS
            if a:
                row += bytes((r // a, g // a, b // a, a // n))
            else:
                row += b'\x00\x00\x00\x00'
        out.append(bytes(row))
    return out


def write_png(path, rows, size):
    raw = b''.join(b'\x00' + r for r in rows)

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)

    png = b'\x89PNG\r\n\x1a\n'
    png += chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
    png += chunk(b'IDAT', zlib.compress(raw, 9))
    png += chunk(b'IEND', b'')
    with open(path, 'wb') as f:
        f.write(png)
    return len(png)


for size, mask, name in ((192, False, 'icons/icon-192.png'),
                         (512, False, 'icons/icon-512.png'),
                         (512, True,  'icons/icon-mask.png')):
    n = write_png(name, draw(size, mask), size)
    print(name, size, 'x', size, str(n) + ' バイト')
