# -*- coding: utf-8 -*-
"""恋愛ゲーム画面メーカー用の背景を ComfyUI (Illustrious XL) で生成する。"""
import json, os, sys, time, urllib.request, urllib.parse, random, io
from PIL import Image

HOST = "http://127.0.0.1:8188"
OUT  = r"C:\ai\haanidesign.github.io\lab\tools\koi-scene\bg"
CKPT = "Illustrious-XL-v2.0.safetensors"
W, H = 832, 1216
TW, TH = 720, 1280

NEG = ("bad quality, worst quality, worst detail, sketch, censor, jpeg artifacts, "
       "1girl, 1boy, person, people, human, character, text, watermark, signature, "
       "logo, blurry, lowres, ugly, deformed")
BASE = ("masterpiece, best quality, amazing quality, very aesthetic, absurdres, "
        "no humans, scenery, anime background art, detailed background, ")

SCENES = [
 ("classroom_day",   "japanese high school classroom, rows of wooden desks, blackboard, large windows, bright daytime sunlight, clear sky"),
 ("classroom_dusk",  "japanese high school classroom, empty desks, blackboard, warm orange sunset light through windows, long shadows, dusk"),
 ("my_room",         "cozy teenage bedroom at evening, bed, study desk with books, warm lamp light, curtains, indoors"),
 ("her_room",        "cute girls bedroom, pastel pink bedding, stuffed animals, dresser with mirror, soft daylight, indoors"),
 ("hallway",         "japanese school hallway, lockers, tall windows, tiled floor, daytime, empty corridor"),
 ("rooftop",         "school rooftop, chain link fence, blue sky, white clouds, city skyline in distance, sunny"),
 ("park",            "park path with cherry trees, wooden benches, green grass, sunny afternoon, dappled light"),
 ("night_street",    "japanese city street at night, street lights, glowing shop signs, wet asphalt reflections, bokeh"),
 ("castle_hall",     "grand castle throne hall, stone pillars, red carpet, stained glass windows, chandeliers, fantasy"),
 ("inn",             "medieval fantasy tavern inn interior, wooden tables, stone fireplace, warm candle light, barrels"),
 ("forest_path",     "fantasy forest path, tall ancient trees, sunbeams through leaves, moss, glowing particles"),
 ("magic_class",     "magic academy classroom, arched windows, floating candles, stacks of old books, wooden desks, fantasy"),
 ("night_hill",      "grassy hill at night under starry sky, milky way, distant fantasy castle silhouette, fireflies"),
]

def post(path, data):
    req = urllib.request.Request(HOST + path, json.dumps(data).encode(),
                                 {"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=60).read())

def get(path):
    return urllib.request.urlopen(HOST + path, timeout=60).read()

def workflow(prompt, seed):
    return {
      "1": {"class_type":"CheckpointLoaderSimple","inputs":{"ckpt_name":CKPT}},
      "2": {"class_type":"CLIPSetLastLayer","inputs":{"clip":["1",1],"stop_at_clip_layer":-2}},
      "3": {"class_type":"CLIPTextEncode","inputs":{"clip":["2",0],"text":BASE+prompt}},
      "4": {"class_type":"CLIPTextEncode","inputs":{"clip":["2",0],"text":NEG}},
      "5": {"class_type":"EmptyLatentImage","inputs":{"width":W,"height":H,"batch_size":1}},
      "6": {"class_type":"KSampler","inputs":{
              "model":["1",0],"positive":["3",0],"negative":["4",0],"latent_image":["5",0],
              "seed":seed,"steps":30,"cfg":5.5,"sampler_name":"euler_ancestral",
              "scheduler":"normal","denoise":1.0}},
      "7": {"class_type":"VAEDecode","inputs":{"samples":["6",0],"vae":["1",2]}},
      "8": {"class_type":"SaveImage","inputs":{"images":["7",0],"filename_prefix":"koiscene"}},
    }

def cover(im):
    s = max(TW/im.width, TH/im.height)
    im = im.resize((round(im.width*s), round(im.height*s)), Image.LANCZOS)
    x, y = (im.width-TW)//2, (im.height-TH)//2
    return im.crop((x, y, x+TW, y+TH))

os.makedirs(OUT, exist_ok=True)
only = sys.argv[1:] or None
for name, prompt in SCENES:
    if only and name not in only: continue
    dst = os.path.join(OUT, name + ".jpg")
    if os.path.exists(dst):
        print("skip", name); continue
    seed = random.randint(1, 2**31)
    pid = post("/prompt", {"prompt": workflow(prompt, seed)})["prompt_id"]
    print("queued", name, pid, flush=True)
    for _ in range(600):
        time.sleep(1)
        h = json.loads(get("/history/" + pid) or b"{}")
        if pid in h:
            outs = h[pid]["outputs"]
            imgs = outs.get("8", {}).get("images", [])
            if not imgs: print("!! no image", name); break
            q = urllib.parse.urlencode({"filename": imgs[0]["filename"],
                                        "subfolder": imgs[0].get("subfolder",""),
                                        "type": imgs[0].get("type","output")})
            raw = get("/view?" + q)
            cover(Image.open(io.BytesIO(raw)).convert("RGB")).save(dst, "JPEG", quality=86, optimize=True)
            print("saved", dst, os.path.getsize(dst)//1024, "KB", flush=True)
            break
    else:
        print("!! timeout", name)
print("done")
