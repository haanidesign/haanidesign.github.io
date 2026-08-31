# -*- coding: utf-8 -*-
"""恋愛ゲーム画面メーカー用の背景を ComfyUI で生成する。
絵柄はアニメ背景でくっきり（太めの線＋セル塗り、にじませない）。
使い方:  python _gen_bg.py            … 足りないぶんだけ作る
         python _gen_bg.py park inn   … 名前を指定して作りなおす（上書き）
"""
import json, os, sys, time, urllib.request, urllib.parse, random, io
from PIL import Image

HOST = "http://127.0.0.1:8188"
OUT  = os.path.join(os.path.dirname(os.path.abspath(__file__)), "bg")
CKPT = "flanimeIllustriousXL_v20.safetensors"   # 線が太くフラットに出るほう
W, H = 832, 1216
TW, TH = 720, 1280
STEPS, CFG = 30, 7.0

STYLE = ("masterpiece, best quality, very aesthetic, absurdres, no humans, scenery, "
         "anime visual novel background, bold black outlines, thick lineart, clean linework, "
         "flat cel shading, vivid saturated colors, crisp sharp edges, "
         "eye level view, open floor in the foreground, ")

NEG = ("blurry, soft focus, depth of field, bokeh, hazy, painterly, oil painting, "
       "watercolor, sketch, rough lines, thin lines, pale, desaturated, muted colors, "
       "sepia, monochrome, gradient wash, glow, lens flare, photorealistic, realistic, 3d, "
       "bad quality, worst quality, jpeg artifacts, 1girl, 1boy, person, people, human, "
       "text, watermark, signature, logo, border, frame, "
       "cat, dog, animal, creature, mascot, silhouette of a figure, "
       "oversaturated, neon colors, posterized, color banding, garish, duotone")
NEG_IN = ", building exterior, from outside, facade, street"   # 室内のときだけ足す

# (ファイル名, 室内か, 説明, そのシーンだけの除外)
SCENES = [
 ("classroom_day",  1, "indoors, classroom interior, inside a japanese high school classroom, tidy rows of wooden desks and chairs, green blackboard, large windows with curtains, daytime, wide aisle in the foreground", ""),
 ("classroom_dusk", 1, "indoors, classroom interior, empty tidy desks, green blackboard, windows glowing orange at sunset, long shadows on the floor, evening", ""),
 ("my_room",        1, "indoors, cozy teenage bedroom interior, a single bed against the wall covered by one smooth flat bedspread, wooden study desk with a chair, bookshelf, window with curtains, warm room light, evening, tidy and simple", ", blackboard, classroom, desks in rows, messy, crumpled blanket, folded blanket, two blankets, two beds, bunk bed"),
 ("her_room",       1, "indoors, cute girls bedroom interior, neatly made bed with pastel pink bedding, one cream colored teddy bear, dresser with mirror, round rug, daylight from window, tidy, soft pastel colors", ", blackboard, classroom, messy, two beds, black doll, dark stuffed animal, creepy"),
 ("hallway",        1, "indoors, japanese school hallway interior, long corridor, tall windows on the left with warm afternoon sunlight, beige lockers on the right, cream walls, wooden trim, white ceiling with fluorescent lights, light wooden floor, bright and friendly, daytime", ", desks, blackboard, blue walls, orange floor, two tone, black ceiling, dark, creepy, horror, ominous, liminal space, hospital, deserted, cold light"),
 ("rooftop",        0, "school rooftop, chain link fence along the edge, blue sky with simple white clouds, city buildings far away below, daytime, wide empty concrete floor", ", indoors, ceiling, water tank, tank, bottle, canister, spray can, large object in the center"),
 ("park",           0, "park path, cherry blossom trees, one wooden bench, green lawn, blue sky, daytime", ", indoors, ceiling"),
  ("castle_hall",    1, "indoors, grand medieval european castle great hall, bright and elegant, stone arches and columns, red and gold heraldic banners, long red carpet, tall windows with warm daylight, iron chandeliers, polished stone floor, noble and majestic", ", gothic horror, dark, gloomy, creepy, ominous, demonic, purple tint, cathedral rose window, ruins"),
 ("inn",            1, "indoors, fantasy tavern interior, highly detailed linework, wooden plank walls and ceiling beams, a long wooden table with several chairs in the middle, shelves lined with bottles and mugs, a stone fireplace on the left, hanging lanterns, a window with daylight, wooden barrels, warm cozy light, lots of detail", ", modern, school desks, empty room, plain walls, dark, gloomy, purple tint, burning walls, cave, dungeon, minimal, bare"),
 ("forest_path",    0, "fantasy forest, no animals, tall straight trees on both sides, thick green foliage, mossy rocks, ferns, a quiet empty clearing of soft grass in the middle, sunlight from above, natural green and brown colors", ", indoors, ceiling, pink trees, animal, cat, dog, deer, fox, bear, bird, wildlife, fur, tail, paws, creature, mascot, dirt trail, road"),
 ("magic_class",    1, "indoors, magic academy classroom, wide shot of the whole room, many rows of wooden student desks with chairs, a large blackboard at the front with chalk magic circles, tall arched windows with bright daylight, bookshelves along the wall, floating candles, warm and inviting, fantasy school, calm daylight", ", modern, fluorescent light, dark, gloomy, empty hall, church, altar, close up, red glow, ominous, horror, purple tint, animal, creature"),
 ]

def post(p, d):
    r = urllib.request.Request(HOST+p, json.dumps(d).encode(), {"Content-Type":"application/json"})
    return json.loads(urllib.request.urlopen(r, timeout=60).read())
def get(p): return urllib.request.urlopen(HOST+p, timeout=120).read()

def wf(pos, neg, seed):
    return {
      "1":{"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":CKPT}},
      "2":{"class_type":"CLIPSetLastLayer","inputs":{"clip":["1",1],"stop_at_clip_layer":-2}},
      "3":{"class_type":"CLIPTextEncode","inputs":{"clip":["2",0],"text":pos}},
      "4":{"class_type":"CLIPTextEncode","inputs":{"clip":["2",0],"text":neg}},
      "5":{"class_type":"EmptyLatentImage","inputs":{"width":W,"height":H,"batch_size":1}},
      "6":{"class_type":"KSampler","inputs":{"model":["1",0],"positive":["3",0],"negative":["4",0],
           "latent_image":["5",0],"seed":seed,"steps":STEPS,"cfg":CFG,
           "sampler_name":"euler_ancestral","scheduler":"normal","denoise":1.0}},
      "7":{"class_type":"VAEDecode","inputs":{"samples":["6",0],"vae":["1",2]}},
      "8":{"class_type":"SaveImage","inputs":{"images":["7",0],"filename_prefix":"koiscene"}},
    }

def trim_bars(im):
    """上下左右にできた黒帯を切り落とす。"""
    g = im.convert("L"); w, h = g.size; px = g.load()
    def dark_row(y): return sum(px[x, y] for x in range(0, w, 8)) / len(range(0, w, 8)) < 40
    def dark_col(x): return sum(px[x, y] for y in range(0, h, 8)) / len(range(0, h, 8)) < 40
    t = 0
    while t < h // 8 and dark_row(t): t += 1
    b = h - 1
    while b > h - h // 8 and dark_row(b): b -= 1
    l = 0
    while l < w // 8 and dark_col(l): l += 1
    r = w - 1
    while r > w - w // 8 and dark_col(r): r -= 1
    return im.crop((l, t, r + 1, b + 1)) if (t or l or b != h - 1 or r != w - 1) else im

def cover(im):
    im = trim_bars(im)
    s = max(TW/im.width, TH/im.height)
    im = im.resize((round(im.width*s), round(im.height*s)), Image.LANCZOS)
    x, y = (im.width-TW)//2, (im.height-TH)//2
    return im.crop((x, y, x+TW, y+TH))

os.makedirs(OUT, exist_ok=True)
only = sys.argv[1:] or None
for name, indoor, subject, xneg in SCENES:
    if only and name not in only: continue
    dst = os.path.join(OUT, name + ".jpg")
    if not only and os.path.exists(dst):
        print("skip", name); continue
    pid = post("/prompt", {"prompt": wf(STYLE+subject, NEG + (NEG_IN if indoor else "") + xneg,
                                        random.randint(1, 2**31))})["prompt_id"]
    print("queued", name, flush=True)
    for _ in range(900):
        time.sleep(1)
        h = json.loads(get("/history/"+pid) or b"{}")
        if pid in h:
            imgs = h[pid]["outputs"].get("8", {}).get("images", [])
            if not imgs: print("!! no image", name); break
            q = urllib.parse.urlencode({"filename": imgs[0]["filename"],
                 "subfolder": imgs[0].get("subfolder",""), "type": imgs[0].get("type","output")})
            cover(Image.open(io.BytesIO(get("/view?"+q))).convert("RGB"))\
                .save(dst, "JPEG", quality=86, optimize=True)
            print("saved", name, os.path.getsize(dst)//1024, "KB", flush=True)
            break
    else:
        print("!! timeout", name)
print("done")
