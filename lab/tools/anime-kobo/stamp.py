# -*- coding: utf-8 -*-
"""読みこむ ファイルぜんぶに 版のばんごうを つける。

なぜ いるか
  ブラウザは 一度 読んだ ファイルを しばらく 使いまわす。
  中身を 直しても 名前が 同じだと、いつまでも 古いままに なる
  （スマホで とくに ながく のこる）。
  ?v=51 のように 番号を つけると、番号が 変わった ときだけ
  「べつの ファイル」として 取りに 行ってくれる。

つかい方
  python stamp.py          … index.html の 版ばんごうに そろえる
  python stamp.py 52       … 版ばんごうも 52 に 上げてから そろえる
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)

VER_RE = re.compile(r'(id="ver"[^>]*>)v(\d+)(<)')


def read(path):
    return io.open(path, encoding='utf-8').read()


def write(path, text):
    io.open(path, 'w', encoding='utf-8', newline='').write(text)


def js_files():
    out = []
    for root, _dirs, files in os.walk('js'):
        for f in files:
            if f.endswith('.js'):
                out.append(os.path.join(root, f).replace('\\', '/'))
    return out


def main():
    html = read('index.html')
    m = VER_RE.search(html)
    if not m:
        raise SystemExit('index.html に 版ばんごうが 見つかりません')

    ver = sys.argv[1] if len(sys.argv) > 1 else m.group(2)
    ver = str(int(ver))
    html = VER_RE.sub(lambda x: x.group(1) + 'v' + ver + x.group(3), html)

    tag = '?v=' + ver

    # index.html の css と さいしょの js
    def stamp_attr(text, attr):
        # href="css/x.css" / src="js/main.js"（?v= が ついていても つけ直す）
        pat = re.compile(attr + r'="([^"]+?\.(?:css|js))(?:\?v=\d+)?"')
        return pat.sub(lambda x: attr + '="' + x.group(1) + tag + '"', text)

    html = stamp_attr(html, 'href')
    html = stamp_attr(html, 'src')
    write('index.html', html)

    # js どうしの よびだし（import ... from './x.js'）
    imp = re.compile(r"(from\s+|import\s*\(\s*)(['\"])(\.{1,2}/[^'\"]+?\.js)(?:\?v=\d+)?\2")
    n = 0
    for f in js_files():
        t = read(f)
        t2 = imp.sub(lambda x: x.group(1) + x.group(2) + x.group(3) + tag + x.group(2), t)
        if t2 != t:
            write(f, t2)
            n += 1

    print('v' + ver + ' に そろえました（js ' + str(n) + ' 件）')


if __name__ == '__main__':
    main()
