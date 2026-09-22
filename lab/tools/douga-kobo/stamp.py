#!/usr/bin/env python3
"""読みこむ アドレスに ばんごうを 付けて まわる。

ばんごうが 無いと、直した あとも ブラウザが 前の ファイルを
出して しまい、新しい ものと 古い ものが 混ざって 動かなく なる。
（アニメ工房の stamp.py と 同じ しごと）

つかいかた:  python3 stamp.py 4
"""
import re, sys, glob, os

ver = sys.argv[1] if len(sys.argv) > 1 else None
if not ver:
    print('つかいかた: python3 stamp.py <ばんごう>'); sys.exit(1)

here = os.path.dirname(os.path.abspath(__file__))
os.chdir(here)
n = 0

# ① JS の 中の import / export from
pat = re.compile(r"""(from\s+|import\s*\(\s*)(['"])(\.{1,2}/[^'"?]+\.js)(\?v=[^'"]*)?\2""")
for f in glob.glob('js/**/*.js', recursive=True):
    src = open(f, encoding='utf-8').read()
    new = pat.sub(lambda m: f"{m.group(1)}{m.group(2)}{m.group(3)}?v={ver}{m.group(2)}", src)
    if new != src:
        open(f, 'w', encoding='utf-8').write(new); n += 1

# ② index.html の css / js / manifest
html = open('index.html', encoding='utf-8').read()
h2 = re.sub(r'((?:href|src)="(?:css/[^"]+?\.css|js/[^"]+?\.js|lib/[^"]+?\.js|manifest\.webmanifest))(\?v=[^"]*)?"',
            lambda m: f'{m.group(1)}?v={ver}"', html)
if h2 != html:
    open('index.html', 'w', encoding='utf-8').write(h2); n += 1

# ③ サービスワーカー
sw = open('sw.js', encoding='utf-8').read()
s2 = re.sub(r"const VER = '[^']*';", f"const VER = 'v{ver}';", sw)
if s2 != sw:
    open('sw.js', 'w', encoding='utf-8').write(s2); n += 1

print(f'v{ver} を {n} 個の ファイルに 付けました')
