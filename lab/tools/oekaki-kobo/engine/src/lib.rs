// SPDX-License-Identifier: MIT OR Apache-2.0
//! おえかき工房 の 描画エンジン。
//!
//! 絵を かく ところ（ブラシ・手ブレ補正・入り抜き・水彩の にじみ・トーン・
//! .efude と PSD の 読み書き）は Efude の エンジン
//! （https://github.com/852wa/Efude , MIT OR Apache-2.0）を そのまま 呼ぶ。
//! ここに あるのは、画面（JavaScript）との 受けわたしと、
//! 取り消し・塗りつぶし・レイヤーの 出し入れ だけ。
//!
//! 受けわたしは C の 形の 関数だけで する（wasm-bindgen は 使わない）。
//! 返す データは `out` に 入れて、JS は `out_ptr` / `out_len` で 読む。

use efude_brush::engine::{
    self, CpuCover, DabGeometry, DabStyle, DabTarget, Dynamics, StrokeRaster,
};
use efude_brush::{Brush, BrushKind, DynamicSource};
use efude_canvas::vector;
use efude_canvas::{
    BlendMode, Document, DotShape, History, Layer, LayerKind, Selection, TILE_SIZE, TilePixels,
};
use efude_core::InkPoint;
use efude_stroke::{StrokeBuilder, StrokeParams};
use std::cell::RefCell;
use std::collections::BTreeSet;

const UNDO_LIMIT: usize = 60;
const DEFAULT_BRUSHES: &[u8] = include_bytes!("../assets/default.efudebrushes");

const BLENDS: [BlendMode; 14] = [
    BlendMode::Normal,
    BlendMode::Multiply,
    BlendMode::Screen,
    BlendMode::Overlay,
    BlendMode::Darken,
    BlendMode::Lighten,
    BlendMode::ColorDodge,
    BlendMode::ColorBurn,
    BlendMode::HardLight,
    BlendMode::SoftLight,
    BlendMode::Difference,
    BlendMode::Exclusion,
    BlendMode::Add,
    BlendMode::Subtract,
];

#[derive(Clone)]
struct Snapshot {
    layers: Vec<Layer>,
    selected: usize,
}

struct Stroke {
    brush: usize,
    layer: usize,
    builder: StrokeBuilder,
    raster: StrokeRaster,
    history: History,
    /// 仮に かいた しっぽの 前の 状態（レイヤーの 画素と ラスタ）。
    provisional: Option<(TilePixels, StrokeRaster)>,
    provisional_tiles: Vec<(u32, u32)>,
    pending: Vec<InkPoint>,
    /// 一画で さわった はんい（ぬれ縁の ため）。
    min: [f32; 2],
    max: [f32; 2],
    pushed: usize,
    /// ベクターレイヤーに かいて いる とき、いま のびて いる 線の 番号。
    vector: bool,
    vindex: Option<usize>,
}

struct App {
    doc: Document,
    selected: usize,
    brushes: Vec<Brush>,
    brush: usize,
    color: [u8; 4],
    view_scale: f32,
    pressure_gamma: f32,
    stroke: Option<Stroke>,
    undo: Vec<Snapshot>,
    redo: Vec<Snapshot>,
    dirty: BTreeSet<(u32, u32)>,
    next_id: u64,
    grain_seed: u64,
    floating: Option<Floating>,
    /// ベクター消しゴムで ふれた 線を まるごと 消す。
    vector_whole: bool,
}

/// 切りとって 浮かせた 絵（動かす・大きさ・回転の あいだ）。
struct Floating {
    layer: usize,
    w: u32,
    h: u32,
    /// 乗算済みで ない RGBA（はしの ぼかしは アルファに 入れて ある）。
    rgba: Vec<u8>,
}

thread_local! {
    static APP: RefCell<Option<App>> = const { RefCell::new(None) };
    static OUT: RefCell<Vec<u8>> = const { RefCell::new(Vec::new()) };
}

fn set_out(bytes: Vec<u8>) -> usize {
    let len = bytes.len();
    OUT.with(|o| *o.borrow_mut() = bytes);
    len
}

fn set_out_str(text: &str) -> usize {
    set_out(text.as_bytes().to_vec())
}

fn with_app<R>(default: R, f: impl FnOnce(&mut App) -> R) -> R {
    APP.with(|a| match a.borrow_mut().as_mut() {
        Some(app) => f(app),
        None => default,
    })
}

fn bytes_from<'a>(ptr: *const u8, len: usize) -> &'a [u8] {
    if ptr.is_null() || len == 0 {
        return &[];
    }
    // SAFETY: JS が `alloc` で とった はんいを そのまま わたして くる。
    unsafe { std::slice::from_raw_parts(ptr, len) }
}

// ---------------------------------------------------------------- memory

#[unsafe(no_mangle)]
pub extern "C" fn alloc(len: usize) -> *mut u8 {
    let mut v = vec![0u8; len.max(1)];
    let p = v.as_mut_ptr();
    std::mem::forget(v);
    p
}

#[unsafe(no_mangle)]
pub extern "C" fn dealloc(ptr: *mut u8, len: usize) {
    if ptr.is_null() {
        return;
    }
    // SAFETY: `alloc` で とった ものを おなじ 長さで かえす。
    unsafe { drop(Vec::from_raw_parts(ptr, len.max(1), len.max(1))) }
}

#[unsafe(no_mangle)]
pub extern "C" fn out_ptr() -> *const u8 {
    OUT.with(|o| o.borrow().as_ptr())
}

#[unsafe(no_mangle)]
pub extern "C" fn out_len() -> usize {
    OUT.with(|o| o.borrow().len())
}

// ---------------------------------------------------------------- setup

fn load_default_brushes() -> Vec<Brush> {
    efude_brush::set_from_bytes(DEFAULT_BRUSHES).unwrap_or_else(|_| efude_brush::defaults())
}

fn paper_layer(id: u64, w: u32, h: u32) -> Layer {
    let mut paper = Layer::new(id, "用紙", w, h);
    paper.pixels.fill_shared([255, 255, 255, 255]);
    paper
}

fn install(doc: Document, selected: usize) {
    APP.with(|a| {
        let mut slot = a.borrow_mut();
        let (brushes, brush, color, view_scale, pressure_gamma, grain_seed) = match slot.take() {
            Some(old) => (
                old.brushes,
                old.brush,
                old.color,
                old.view_scale,
                old.pressure_gamma,
                old.grain_seed,
            ),
            None => (
                load_default_brushes(),
                0,
                [30, 28, 20, 255],
                1.0,
                1.0,
                0x9e37_79b9_7f4a_7c15,
            ),
        };
        let next_id = doc.layers.iter().map(|l| l.id).max().unwrap_or(0) + 1;
        let selected = selected.min(doc.layers.len().saturating_sub(1));
        let mut app = App {
            doc,
            selected,
            brushes,
            brush,
            color,
            view_scale,
            pressure_gamma,
            stroke: None,
            floating: None,
            vector_whole: false,
            undo: Vec::new(),
            redo: Vec::new(),
            dirty: BTreeSet::new(),
            next_id,
            grain_seed,
        };
        app.mark_all();
        *slot = Some(app);
    });
}

/// 新しい 紙。`paper` が 1 なら 白い 用紙レイヤーを しく。
#[unsafe(no_mangle)]
pub extern "C" fn doc_new(width: u32, height: u32, dpi: f32, paper: u32) -> i32 {
    if !efude_canvas::valid_document_dimensions(width, height) {
        return -1;
    }
    let mut doc = Document::new(width, height);
    doc.dpi = if dpi.is_finite() && dpi > 0.0 {
        dpi
    } else {
        350.0
    };
    doc.layers.clear();
    if paper != 0 {
        doc.layers.push(paper_layer(1, width, height));
    }
    doc.layers.push(Layer::new(2, "レイヤー 1", width, height));
    let top = doc.layers.len() - 1;
    install(doc, top);
    0
}

fn first_paintable(doc: &Document) -> usize {
    (0..doc.layers.len())
        .rev()
        .find(|&i| doc.layers[i].kind == LayerKind::Raster && !doc.layers[i].locked)
        .unwrap_or(0)
}

#[unsafe(no_mangle)]
pub extern "C" fn doc_load_efude(ptr: *const u8, len: usize) -> i32 {
    match efude_io_mem::load(bytes_from(ptr, len)) {
        Ok(doc) => {
            let s = first_paintable(&doc);
            install(doc, s);
            0
        }
        Err(e) => {
            set_out_str(&e.to_string());
            -1
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn doc_load_psd(ptr: *const u8, len: usize) -> i32 {
    match efude_io_mem::import_psd(bytes_from(ptr, len)) {
        Ok(doc) => {
            let s = first_paintable(&doc);
            install(doc, s);
            0
        }
        Err(e) => {
            set_out_str(&e.to_string());
            -1
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn doc_save_efude() -> i32 {
    with_app(-1, |app| match efude_io_mem::save(&app.doc) {
        Ok(bytes) => set_out(bytes) as i32,
        Err(e) => {
            set_out_str(&e.to_string());
            -1
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn doc_export_psd() -> i32 {
    with_app(-1, |app| match efude_io_mem::export_psd(&app.doc) {
        Ok(bytes) => set_out(bytes) as i32,
        Err(e) => {
            set_out_str(&e.to_string());
            -1
        }
    })
}

/// 重ねた 絵を RGBA で。`transparent` が 1 なら 背景を 透明に。
#[unsafe(no_mangle)]
pub extern "C" fn doc_export_rgba(transparent: u32) -> usize {
    with_app(0, |app| {
        let px = if transparent != 0 {
            efude_canvas::composite_transparent(&app.doc)
        } else {
            efude_canvas::composite(&app.doc)
        };
        set_out(px)
    })
}

/// 手もとに しまう ための 形（速さ 優先）。
/// 中身: "OKK1" + lz4( JSON の 長さ(u32) + JSON + 各レイヤーの タイル )。
#[unsafe(no_mangle)]
pub extern "C" fn doc_save_quick() -> usize {
    with_app(0, |app| {
        let doc = &app.doc;
        let mut body = Vec::new();
        let layers: Vec<serde_json::Value> = doc
            .layers
            .iter()
            .map(|l| {
                serde_json::json!({
                    "id": l.id, "name": l.name, "visible": l.visible, "opacity": l.opacity,
                    "locked": l.locked, "clipping": l.clipping, "sketch": l.sketch,
                    "reference": l.reference, "blend": l.blend, "linear_blend": l.linear_blend,
                    "kind": l.kind, "parent_id": l.parent_id, "expanded": l.expanded,
                    "tone": l.tone,
                    "tiles": l.pixels.tile_keys(),
                })
            })
            .collect();
        let head = serde_json::json!({
            "width": doc.width, "height": doc.height, "dpi": doc.dpi,
            "metadata": doc.metadata, "selected": app.selected, "layers": layers,
        });
        let head = serde_json::to_vec(&head).unwrap_or_default();
        body.extend_from_slice(&(head.len() as u32).to_le_bytes());
        body.extend_from_slice(&head);
        for l in &doc.layers {
            for key in l.pixels.tile_keys() {
                if let Some(t) = l.pixels.tile_data(key.0, key.1) {
                    body.extend_from_slice(t);
                }
            }
        }
        let mut out = b"OKK1".to_vec();
        out.extend_from_slice(&lz4_flex_compress(&body));
        set_out(out)
    })
}

fn lz4_flex_compress(data: &[u8]) -> Vec<u8> {
    lz4_flex::compress_prepend_size(data)
}

#[unsafe(no_mangle)]
pub extern "C" fn doc_load_quick(ptr: *const u8, len: usize) -> i32 {
    let bytes = bytes_from(ptr, len);
    let result = (|| -> Option<(Document, usize)> {
        if bytes.len() < 4 || &bytes[..4] != b"OKK1" {
            return None;
        }
        let body = lz4_flex::decompress_size_prepended(&bytes[4..]).ok()?;
        let head_len = u32::from_le_bytes(body.get(..4)?.try_into().ok()?) as usize;
        let head: serde_json::Value = serde_json::from_slice(body.get(4..4 + head_len)?).ok()?;
        let width = head["width"].as_u64()? as u32;
        let height = head["height"].as_u64()? as u32;
        if !efude_canvas::valid_document_dimensions(width, height) {
            return None;
        }
        let mut doc = Document::new(width, height);
        doc.layers.clear();
        doc.dpi = head["dpi"].as_f64().unwrap_or(350.0) as f32;
        if let Ok(m) = serde_json::from_value(head["metadata"].clone()) {
            doc.metadata = m;
        }
        let tile_bytes = (TILE_SIZE * TILE_SIZE * 4) as usize;
        let mut at = 4 + head_len;
        for l in head["layers"].as_array()? {
            let mut layer = Layer::new(l["id"].as_u64()?, l["name"].as_str()?, width, height);
            layer.visible = l["visible"].as_bool().unwrap_or(true);
            layer.opacity = l["opacity"].as_f64().unwrap_or(1.0) as f32;
            layer.locked = l["locked"].as_bool().unwrap_or(false);
            layer.clipping = l["clipping"].as_bool().unwrap_or(false);
            layer.sketch = l["sketch"].as_bool().unwrap_or(false);
            layer.reference = l["reference"].as_bool().unwrap_or(false);
            layer.blend = serde_json::from_value(l["blend"].clone()).unwrap_or(BlendMode::Normal);
            layer.linear_blend = l["linear_blend"].as_bool().unwrap_or(false);
            layer.kind = serde_json::from_value(l["kind"].clone()).unwrap_or(LayerKind::Raster);
            layer.parent_id = l["parent_id"].as_u64();
            layer.expanded = l["expanded"].as_bool().unwrap_or(true);
            layer.tone = serde_json::from_value(l["tone"].clone()).unwrap_or(None);
            for key in l["tiles"].as_array()? {
                let tx = key[0].as_u64()? as u32;
                let ty = key[1].as_u64()? as u32;
                let data = body.get(at..at + tile_bytes)?;
                at += tile_bytes;
                let tile = layer.pixels.tile_mut(tx, ty);
                tile.copy_from_slice(data);
            }
            doc.layers.push(layer);
        }
        if doc.layers.is_empty() {
            return None;
        }
        let selected = head["selected"].as_u64().unwrap_or(0) as usize;
        Some((doc, selected))
    })();
    match result {
        Some((doc, selected)) => {
            install(doc, selected);
            0
        }
        None => -1,
    }
}

/// 紙と レイヤーの ようす（JSON）。
#[unsafe(no_mangle)]
pub extern "C" fn doc_info() -> usize {
    with_app(0, |app| {
        let layers: Vec<serde_json::Value> = app
            .doc
            .layers
            .iter()
            .map(|l| {
                let depth = {
                    let mut d = 0;
                    let mut p = l.parent_id;
                    while let Some(id) = p {
                        d += 1;
                        if d > 64 {
                            break;
                        }
                        p = app
                            .doc
                            .layers
                            .iter()
                            .find(|x| x.id == id)
                            .and_then(|x| x.parent_id);
                    }
                    d
                };
                serde_json::json!({
                    "id": l.id, "name": l.name, "visible": l.visible, "opacity": l.opacity,
                    "locked": l.locked, "clipping": l.clipping,
                    "blend": BLENDS.iter().position(|b| *b == l.blend).unwrap_or(0),
                    "folder": l.kind == LayerKind::Folder,
                    "vector": l.vector.is_some(),
                    "depth": depth,
                    "tone": l.tone.map(|t| serde_json::json!({
                        "lpi": t.lines_per_inch, "angle": t.angle_degrees,
                        "shape": DotShape::ALL.iter().position(|s| *s == t.shape).unwrap_or(0),
                    })),
                })
            })
            .collect();
        let info = serde_json::json!({
            "width": app.doc.width, "height": app.doc.height, "dpi": app.doc.dpi,
            "selected": app.selected, "layers": layers,
            "undo": app.undo.len(), "redo": app.redo.len(),
        });
        set_out_str(&info.to_string())
    })
}

// ---------------------------------------------------------------- dirty tiles

/// 画面の 描きなおしの ます目（画素）。Efude の タイル（256）を 4×4 に わける。
const CELL: u32 = 64;
const CELLS_PER_TILE: u32 = TILE_SIZE / CELL;

impl App {
    fn cells_x(&self) -> u32 {
        self.doc.width.div_ceil(CELL)
    }
    fn cells_y(&self) -> u32 {
        self.doc.height.div_ceil(CELL)
    }
    fn mark_all(&mut self) {
        for cy in 0..self.cells_y() {
            for cx in 0..self.cells_x() {
                self.dirty.insert((cx, cy));
            }
        }
    }
    fn mark_rect(&mut self, x0: f32, y0: f32, x1: f32, y1: f32) {
        let (w, h) = (self.doc.width as f32, self.doc.height as f32);
        if x1 < 0.0 || y1 < 0.0 || x0 >= w || y0 >= h || x1 < x0 || y1 < y0 {
            return;
        }
        let cx0 = (x0.max(0.0) as u32) / CELL;
        let cy0 = (y0.max(0.0) as u32) / CELL;
        let cx1 = (x1.min(w - 1.0).max(0.0) as u32) / CELL;
        let cy1 = (y1.min(h - 1.0).max(0.0) as u32) / CELL;
        for cy in cy0..=cy1 {
            for cx in cx0..=cx1 {
                self.dirty.insert((cx, cy));
            }
        }
    }
    fn mark_tile(&mut self, key: (u32, u32)) {
        let (mx, my) = (self.cells_x(), self.cells_y());
        for cy in key.1 * CELLS_PER_TILE..((key.1 + 1) * CELLS_PER_TILE).min(my) {
            for cx in key.0 * CELLS_PER_TILE..((key.0 + 1) * CELLS_PER_TILE).min(mx) {
                self.dirty.insert((cx, cy));
            }
        }
    }
    fn mark_layer(&mut self, layer: &Layer) {
        for key in layer.pixels.tile_keys() {
            self.mark_tile(key);
        }
    }
    /// 取り消しの 前後で 見た目が かわる ところを しるす。
    fn mark_diff(&mut self, before: &[Layer]) {
        let now: Vec<Layer> = self.doc.layers.clone();
        let same_order =
            now.len() == before.len() && now.iter().zip(before).all(|(a, b)| a.id == b.id);
        if !same_order {
            for l in now.iter().chain(before) {
                self.mark_layer(l);
            }
            return;
        }
        for (a, b) in now.iter().zip(before) {
            if a.property_state() != b.property_state() {
                self.mark_layer(a);
                self.mark_layer(b);
            } else {
                for key in a.pixels.tiles_changed_since(&b.pixels) {
                    self.mark_tile(key);
                }
            }
        }
    }
    fn checkpoint(&mut self) {
        self.undo.push(Snapshot {
            layers: self.doc.layers.clone(),
            selected: self.selected,
        });
        if self.undo.len() > UNDO_LIMIT {
            self.undo.remove(0);
        }
        self.redo.clear();
    }
    fn fresh_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }
}

/// かわった ます目を 最大 `max` こ 描いて わたす。
/// 中身: こ数(u32) と、1こごとに x,y,w,h(画素, u32×4) + RGBA。
#[unsafe(no_mangle)]
pub extern "C" fn render_dirty(max: u32) -> usize {
    with_app(0, |app| {
        let mut out = Vec::new();
        out.extend_from_slice(&0u32.to_le_bytes());
        let mut count = 0u32;
        while count < max {
            let Some(key) = app.dirty.pop_first() else {
                break;
            };
            let (x, y) = (key.0 * CELL, key.1 * CELL);
            let Some((w, h, px)) = composite_region(&app.doc, x, y, CELL, CELL) else {
                continue;
            };
            for v in [x, y, w, h] {
                out.extend_from_slice(&v.to_le_bytes());
            }
            out.extend_from_slice(&px);
            count += 1;
        }
        out[..4].copy_from_slice(&count.to_le_bytes());
        set_out(out)
    })
}

/// のこりの ます目の 数。
#[unsafe(no_mangle)]
pub extern "C" fn dirty_count() -> u32 {
    with_app(0, |app| app.dirty.len() as u32)
}

/// 紙の 一部（1つの タイルの 中に おさまる はんい）を、透明を のこした まま 重ねる。
/// トーンは 紙の 上の 位置で 網を きめてから 重ねる。
fn composite_region(
    doc: &Document,
    x0: u32,
    y0: u32,
    cw: u32,
    ch: u32,
) -> Option<(u32, u32, Vec<u8>)> {
    if x0 >= doc.width || y0 >= doc.height {
        return None;
    }
    let w = cw.min(doc.width - x0);
    let h = ch.min(doc.height - y0);
    let (tx, ty) = (x0 / TILE_SIZE, y0 / TILE_SIZE);
    let (lx0, ly0) = (x0 % TILE_SIZE, y0 % TILE_SIZE);
    let copy = |src: &TilePixels, dst: &mut TilePixels| -> bool {
        let Some(data) = src.tile_data(tx, ty) else {
            return false;
        };
        let tile = dst.tile_mut(0, 0);
        for row in 0..h {
            let s = (((ly0 + row) * TILE_SIZE + lx0) * 4) as usize;
            let d = ((row * TILE_SIZE) * 4) as usize;
            tile[d..d + (w * 4) as usize].copy_from_slice(&data[s..s + (w * 4) as usize]);
        }
        true
    };
    let mut sub = Document {
        width: w,
        height: h,
        dpi: doc.dpi,
        layers: Vec::with_capacity(doc.layers.len()),
        metadata: Default::default(),
    };
    for src in &doc.layers {
        let mut layer = Layer::new(src.id, String::new(), w, h);
        layer.visible = src.visible;
        layer.opacity = src.opacity;
        layer.clipping = src.clipping;
        layer.blend = src.blend;
        layer.linear_blend = src.linear_blend;
        layer.kind = src.kind;
        layer.parent_id = src.parent_id;
        if src.kind == LayerKind::Raster && src.visible {
            copy(&src.pixels, &mut layer.pixels);
            if let Some(settings) = &src.tone {
                if layer.pixels.has_allocated_tiles() {
                    for yy in 0..h {
                        for xx in 0..w {
                            let px = layer.pixels.pixel(xx, yy);
                            if px[3] != 0 {
                                let t = efude_canvas::tone::tone_pixel(
                                    settings,
                                    doc.dpi,
                                    x0 + xx,
                                    y0 + yy,
                                    px,
                                );
                                layer.pixels.set_pixel(xx, yy, t);
                            }
                        }
                    }
                }
            }
        }
        if let Some(mask) = &src.mask {
            let mut m = TilePixels::new(w, h);
            copy(mask, &mut m);
            layer.mask = Some(m);
        }
        sub.layers.push(layer);
    }
    Some((w, h, efude_canvas::composite_transparent(&sub)))
}

// ---------------------------------------------------------------- brushes

#[unsafe(no_mangle)]
pub extern "C" fn brush_list() -> usize {
    with_app(0, |app| {
        let list: Vec<serde_json::Value> = app
            .brushes
            .iter()
            .map(|b| {
                serde_json::json!({
                    "name": b.name,
                    "kind": format!("{:?}", b.kind).to_lowercase(),
                })
            })
            .collect();
        set_out_str(&serde_json::json!({"brushes": list, "selected": app.brush}).to_string())
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn brush_select(index: u32) {
    with_app((), |app| {
        if (index as usize) < app.brushes.len() {
            app.brush = index as usize;
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn brush_get(index: u32) -> usize {
    with_app(0, |app| {
        let Some(b) = app.brushes.get(index as usize) else {
            return 0;
        };
        let v = serde_json::json!({
            "name": b.name,
            "kind": format!("{:?}", b.kind).to_lowercase(),
            "size": b.size, "opacity": b.opacity, "stabilization": b.stabilization,
            "hardness": b.hardness, "spacing": b.spacing,
            "taper_start": b.taper_start, "taper_end": b.taper_end,
            "taper_in_pixels": b.taper_in_pixels,
            "size_min": b.size_min, "opacity_min": b.opacity_min,
            "size_pressure": b.size_source == DynamicSource::Pressure,
            "opacity_pressure": b.opacity_source == DynamicSource::Pressure,
            "pressure_curve": b.pressure_curve,
            "antialias": b.antialias, "grain": b.grain,
            "blend": b.mix.blend, "dilution": b.mix.dilution, "persistence": b.mix.persistence,
            "pull": b.pull_distance, "scatter": b.scatter,
        });
        set_out_str(&v.to_string())
    })
}

/// ブラシの 値を 1つ かえる。`key` は UTF-8 の 名前。
#[unsafe(no_mangle)]
pub extern "C" fn brush_set(index: u32, key_ptr: *const u8, key_len: usize, value: f32) {
    let key = String::from_utf8_lossy(bytes_from(key_ptr, key_len)).into_owned();
    with_app((), |app| {
        let Some(b) = app.brushes.get_mut(index as usize) else {
            return;
        };
        if !value.is_finite() {
            return;
        }
        match key.as_str() {
            "size" => b.size = value.clamp(0.5, 2000.0),
            "opacity" => b.opacity = value.clamp(0.0, 1.0),
            "stabilization" => b.stabilization = value.clamp(0.0, 15.0).round() as usize,
            "hardness" => b.hardness = value.clamp(0.0, 1.0),
            "spacing" => b.spacing = value.clamp(0.005, 2.0),
            "taper_start" => {
                b.taper_start = value.clamp(0.0, if b.taper_in_pixels { 512.0 } else { 0.5 })
            }
            "taper_end" => {
                b.taper_end = value.clamp(0.0, if b.taper_in_pixels { 512.0 } else { 0.5 })
            }
            "size_min" => b.size_min = value.clamp(0.0, 1.0),
            "opacity_min" => b.opacity_min = value.clamp(0.0, 1.0),
            "size_pressure" => {
                b.size_source = if value > 0.5 {
                    DynamicSource::Pressure
                } else {
                    DynamicSource::None
                }
            }
            "opacity_pressure" => {
                b.opacity_source = if value > 0.5 {
                    DynamicSource::Pressure
                } else {
                    DynamicSource::None
                }
            }
            "pressure_curve" => b.pressure_curve = value.clamp(0.2, 3.0),
            "antialias" => b.antialias = value.clamp(0.0, 3.0).round() as u8,
            "grain" => b.grain = value.clamp(0.0, 1.0),
            "blend" => b.mix.blend = value.clamp(0.0, 1.0),
            "dilution" => b.mix.dilution = value.clamp(0.0, 1.0),
            "persistence" => b.mix.persistence = value.clamp(0.0, 1.0),
            "pull" => b.pull_distance = value.clamp(0.0, 256.0),
            "scatter" => b.scatter = value.clamp(0.0, 2.0),
            _ => {}
        }
    })
}

/// Efude の ブラシセット（.efudebrushes）を 読む。`replace` が 1 なら 入れかえ、0 なら 足す。
#[unsafe(no_mangle)]
pub extern "C" fn brushes_load_set(ptr: *const u8, len: usize, replace: u32) -> i32 {
    match efude_brush::set_from_bytes(bytes_from(ptr, len)) {
        Ok(set) => with_app(-1, |app| {
            if replace != 0 {
                app.brushes = set;
                app.brush = 0;
            } else {
                app.brushes.extend(set);
            }
            app.brushes.len() as i32
        }),
        Err(e) => {
            set_out_str(&e.to_string());
            -1
        }
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn brushes_save_set() -> i32 {
    with_app(-1, |app| match efude_brush::set_bytes(&app.brushes) {
        Ok(bytes) => set_out(bytes) as i32,
        Err(e) => {
            set_out_str(&e.to_string());
            -1
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn brushes_reset() {
    with_app((), |app| {
        app.brushes = load_default_brushes();
        app.brush = 0;
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn brush_remove(index: u32) {
    with_app((), |app| {
        let i = index as usize;
        if i < app.brushes.len() && app.brushes.len() > 1 {
            app.brushes.remove(i);
            if app.brush >= app.brushes.len() {
                app.brush = app.brushes.len() - 1;
            }
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn brush_duplicate(index: u32) {
    with_app((), |app| {
        let i = index as usize;
        if let Some(b) = app.brushes.get(i).cloned() {
            let mut b = b;
            b.name = format!("{} のコピー", b.name);
            app.brushes.insert(i + 1, b);
            app.brush = i + 1;
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn brush_rename(index: u32, ptr: *const u8, len: usize) {
    let name = String::from_utf8_lossy(bytes_from(ptr, len)).into_owned();
    with_app((), |app| {
        if let Some(b) = app.brushes.get_mut(index as usize) {
            if !name.trim().is_empty() {
                b.name = name.trim().chars().take(40).collect();
            }
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn brush_move(from: u32, to: u32) {
    with_app((), |app| {
        let (f, t) = (from as usize, to as usize);
        if f < app.brushes.len() && t < app.brushes.len() && f != t {
            let b = app.brushes.remove(f);
            app.brushes.insert(t, b);
            app.brush = t;
        }
    })
}

/// ブラシの 見本（白地に 1本の 線）を RGBA で。
#[unsafe(no_mangle)]
pub extern "C" fn brush_preview(index: u32, width: u32, height: u32, r: u8, g: u8, b: u8) -> usize {
    with_app(0, |app| {
        let Some(brush) = app.brushes.get(index as usize) else {
            return 0;
        };
        let (width, height) = (width.clamp(16, 1024), height.clamp(16, 512));
        let mut doc = Document::new(width, height);
        // 水彩・ぼかし・指先は 下に 色が ないと 見えないので 帯を しく。
        let needs_ground =
            matches!(brush.kind, BrushKind::Blur | BrushKind::Smudge) || brush.mix.blend > 0.5;
        if needs_ground {
            for x in 0..width {
                let c = if (x * 3 / width) % 2 == 0 {
                    [225, 221, 96, 255]
                } else {
                    [242, 160, 184, 255]
                };
                for y in height / 4..height * 3 / 4 {
                    doc.layers[0].pixels.set_pixel(x, y, c);
                }
            }
        }
        let size = (brush.size).clamp(2.0, height as f32 * 0.45);
        let style = DabStyle {
            brush,
            kind: brush.kind,
            eraser: matches!(brush.kind, BrushKind::Eraser),
            color: [r, g, b, 255],
            size,
        };
        let mut history = History::default();
        let mut raster = StrokeRaster::new(
            [r as f32 / 255.0, g as f32 / 255.0, b as f32 / 255.0],
            brush.mix.charge,
            glam::Vec2::new(8.0, 8.0),
        );
        if style.eraser {
            doc.layers[0].pixels.fill_shared([30, 28, 20, 255]);
        }
        let params = StrokeParams {
            spacing: (size * brush.spacing.clamp(0.005, 2.0)).max(0.25),
            taper_start_fraction: if brush.taper_in_pixels {
                0.0
            } else {
                brush.taper_start
            },
            taper_end_fraction: if brush.taper_in_pixels {
                0.0
            } else {
                brush.taper_end
            },
            taper_start_px: if brush.taper_in_pixels {
                brush.taper_start
            } else {
                0.0
            },
            taper_end_px: if brush.taper_in_pixels {
                brush.taper_end
            } else {
                0.0
            },
            taper_min: brush.taper_min,
            ..StrokeParams::default()
        };
        let mut builder = StrokeBuilder::new(params);
        let mut dabs = Vec::new();
        let margin = size * 0.6 + 4.0;
        let n = 120;
        for i in 0..=n {
            let t = i as f32 / n as f32;
            let x = margin + (width as f32 - margin * 2.0) * t;
            let y = height as f32 * 0.5
                - (t * std::f32::consts::TAU).sin() * (height as f32 * 0.5 - margin).max(0.0) * 0.6;
            let pressure = (t * std::f32::consts::PI).sin().max(0.0).powf(0.7);
            dabs.extend(
                builder
                    .push(InkPoint::new(x, y, pressure, (i * 6) as u64))
                    .committed,
            );
        }
        dabs.extend(builder.finish());
        for mut p in dabs {
            p.pressure = brush.map_pressure(p.pressure);
            let dynamics = engine::dynamics(brush, &p, raster.last_dab, 1.0);
            let mut target = DabTarget {
                doc: &mut doc,
                layer: 0,
                selection: None,
                history: &mut history,
            };
            raster.stamp(&mut target, style, &dynamics, p);
            raster.finish_dab(style, p);
        }
        let mut target = DabTarget {
            doc: &mut doc,
            layer: 0,
            selection: None,
            history: &mut history,
        };
        raster.finish_stroke(&mut target, brush);
        set_out(doc.layers[0].pixels.to_dense())
    })
}

// ---------------------------------------------------------------- color & view

#[unsafe(no_mangle)]
pub extern "C" fn set_color(r: u8, g: u8, b: u8, a: u8) {
    with_app((), |app| app.color = [r, g, b, a])
}

#[unsafe(no_mangle)]
pub extern "C" fn set_view_scale(scale: f32) {
    with_app((), |app| {
        if scale.is_finite() && scale > 0.0 {
            app.view_scale = scale;
        }
    })
}

/// 筆圧の かかり（1 が そのまま、1 より 小さいと 軽い 力で 太く）。
#[unsafe(no_mangle)]
pub extern "C" fn set_pressure_gamma(gamma: f32) {
    with_app((), |app| {
        if gamma.is_finite() {
            app.pressure_gamma = gamma.clamp(0.2, 4.0);
        }
    })
}

/// 見えている 絵の 色（スポイト）。0xRRGGBBAA。
#[unsafe(no_mangle)]
pub extern "C" fn pick_color(x: f32, y: f32, layer_only: u32) -> u32 {
    with_app(0, |app| {
        if x < 0.0 || y < 0.0 || x >= app.doc.width as f32 || y >= app.doc.height as f32 {
            return 0;
        }
        let px = if layer_only != 0 {
            app.doc.layers[app.selected]
                .pixels
                .pixel(x as u32, y as u32)
        } else {
            efude_canvas::sample_composite_pixel(&app.doc, x as u32, y as u32)
        };
        u32::from_be_bytes(px)
    })
}

// ---------------------------------------------------------------- strokes

impl App {
    fn stroke_params(&self, brush: &Brush) -> StrokeParams {
        let size = brush.size;
        let (tsp, tep, tsf, tef) = if !brush.settle {
            let start = if brush.taper_in_pixels {
                brush.taper_start
            } else {
                brush.taper_start * size * 12.0
            };
            (start, 0.0, 0.0, 0.0)
        } else if brush.taper_in_pixels {
            (brush.taper_start, brush.taper_end, 0.0, 0.0)
        } else {
            // 全体に 対する 割合の 入り抜きは、線を かきおえる まで 形が きまらず、
            // タブレットでは かくほど 重くなる。ブラシの 太さから 長さを きめて 画素で あつかう。
            let reach = (size * 20.0).clamp(24.0, 600.0);
            (brush.taper_start * reach, brush.taper_end * reach, 0.0, 0.0)
        };
        StrokeParams {
            stabilization_ms: StrokeParams::stabilization_from_level(brush.stabilization),
            pull_distance: brush.pull_distance,
            speed_adaptation: brush.speed_stabilization,
            fast_speed: engine::FAST_SCREEN_SPEED / self.view_scale.max(1e-3),
            spacing: stroke_spacing(brush),
            taper_start_px: tsp,
            taper_end_px: tep,
            taper_start_fraction: tsf,
            taper_end_fraction: tef,
            taper_min: brush.taper_min,
        }
    }

    fn paintable(&self, layer: usize) -> bool {
        self.doc
            .layers
            .get(layer)
            .is_some_and(|l| l.kind == LayerKind::Raster && !l.locked && l.vector.is_none())
    }

    fn drawable(&self, layer: usize) -> bool {
        self.doc
            .layers
            .get(layer)
            .is_some_and(|l| l.kind == LayerKind::Raster && !l.locked)
    }

    /// 点を 実際に 紙へ おく（Efude の dab_many と 同じ 流れ）。
    fn paint_dabs(&mut self, points: &[InkPoint]) {
        if self.stroke.as_ref().is_some_and(|s| s.vector) {
            self.vector_dabs(points);
            return;
        }
        let Some(stroke) = self.stroke.as_mut() else {
            return;
        };
        let brush = &self.brushes[stroke.brush];
        let style = DabStyle {
            brush,
            kind: brush.kind,
            eraser: matches!(brush.kind, BrushKind::Eraser),
            color: self.color,
            size: brush.size,
        };
        let gamma = self.pressure_gamma;
        let view_scale = self.view_scale;
        let mut rects = Vec::with_capacity(points.len());
        let mut target = DabTarget {
            doc: &mut self.doc,
            layer: stroke.layer,
            selection: None,
            history: &mut stroke.history,
        };
        let batch = engine::accelerator_can_paint(style);
        let mut stamps = Vec::with_capacity(points.len());
        for point in points {
            let mut p = *point;
            p.pressure = brush.map_pressure(p.pressure.clamp(0.0, 1.0).powf(gamma));
            let dynamics: Dynamics =
                engine::dynamics(brush, &p, stroke.raster.last_dab, view_scale);
            let g = DabGeometry::new(style, &dynamics, &p);
            let r = g.max_radius + 3.0;
            rects.push([
                g.center.x - r,
                g.center.y - r,
                g.center.x + r,
                g.center.y + r,
            ]);
            stroke.min = [
                stroke.min[0].min(g.center.x - r),
                stroke.min[1].min(g.center.y - r),
            ];
            stroke.max = [
                stroke.max[0].max(g.center.x + r),
                stroke.max[1].max(g.center.y + r),
            ];
            if batch {
                stamps.push((p, dynamics));
            } else {
                // 下の 色を 拾う ブラシは 1つずつ 塗る。
                stroke.raster.stamp(&mut target, style, &dynamics, p);
            }
            stroke.raster.finish_dab(style, p);
        }
        if batch {
            stroke.raster.stamp_many_with_fallback(
                &mut target,
                style,
                &stamps,
                None,
                0.0,
                Some(&CpuCover),
            );
        }
        for [x0, y0, x1, y1] in rects {
            self.mark_rect(x0, y0, x1, y1);
        }
    }

    /// ベクターレイヤー: 点を 線に たす（消しゴムなら 線を けずる）。
    fn vector_dabs(&mut self, points: &[InkPoint]) {
        let Some(stroke) = self.stroke.as_mut() else {
            return;
        };
        let brush = &self.brushes[stroke.brush];
        let eraser = matches!(brush.kind, BrushKind::Eraser);
        let style = DabStyle {
            brush,
            kind: brush.kind,
            eraser,
            color: self.color,
            size: brush.size,
        };
        let (w, h) = (self.doc.width, self.doc.height);
        let layer = &mut self.doc.layers[stroke.layer];
        let strokes = layer.vector.get_or_insert_with(Vec::new);
        let mut dirty: Option<vector::PixelRect> = None;
        for point in points {
            let mut p = *point;
            p.pressure = brush.map_pressure(p.pressure.clamp(0.0, 1.0).powf(self.pressure_gamma));
            let dynamics = engine::dynamics(brush, &p, stroke.raster.last_dab, self.view_scale);
            let g = DabGeometry::new(style, &dynamics, &p);
            stroke.raster.last_dab = Some(p);
            if eraser {
                let d = vector::erase_circle(strokes, (g.center.x, g.center.y), g.radius, self.vector_whole);
                dirty = vector::union_rect(dirty, d);
                stroke.vindex = None;
                continue;
            }
            let vp = vector::VectorPoint { x: g.center.x, y: g.center.y, width: (g.radius * 2.0).max(0.5) };
            let i = match stroke.vindex {
                Some(i) if i < strokes.len() => i,
                _ => {
                    let c = self.color;
                    let alpha = (c[3] as f32 * brush.opacity.clamp(0.0, 1.0)).round() as u8;
                    strokes.push(vector::VectorStroke {
                        points: Vec::new(),
                        color: [c[0], c[1], c[2], alpha],
                        hardness: brush.hardness,
                        anchors: Vec::new(),
                    });
                    stroke.vindex = Some(strokes.len() - 1);
                    strokes.len() - 1
                }
            };
            let prev = strokes[i].points.last().copied().unwrap_or(vp);
            strokes[i].points.push(vp);
            let r = vp.width.max(prev.width) * 0.5 + 3.0;
            let rect = [
                (vp.x.min(prev.x) - r).floor() as i32,
                (vp.y.min(prev.y) - r).floor() as i32,
                (vp.x.max(prev.x) + r).ceil() as i32,
                (vp.y.max(prev.y) + r).ceil() as i32,
            ];
            dirty = vector::union_rect(dirty, Some(rect));
        }
        if let Some(rect) = dirty {
            render_vector(layer, w, h, rect);
            self.mark_rect(rect[0] as f32, rect[1] as f32, rect[2] as f32, rect[3] as f32);
        }
    }

    /// ベクターの 線を かきおえた: 曲線に ととのえて かきなおす。
    fn vector_finish(&mut self, layer: usize, index: Option<usize>) {
        let (w, h) = (self.doc.width, self.doc.height);
        let l = &mut self.doc.layers[layer];
        let Some(strokes) = l.vector.as_mut() else {
            return;
        };
        let Some(i) = index.filter(|&i| i < strokes.len()) else {
            return;
        };
        let old = strokes[i].bounds();
        let s = &strokes[i];
        let fitted = vector::VectorStroke::fitted(s.points.clone(), s.color, s.hardness);
        let new = fitted.bounds();
        strokes[i] = fitted;
        if let Some(rect) = vector::union_rect(old, new) {
            let rect = [rect[0] - 2, rect[1] - 2, rect[2] + 2, rect[3] + 2];
            render_vector(l, w, h, rect);
            self.mark_rect(rect[0] as f32, rect[1] as f32, rect[2] as f32, rect[3] as f32);
        }
    }

    fn restore_provisional(&mut self) {
        let Some(stroke) = self.stroke.as_mut() else {
            return;
        };
        if let Some((pixels, raster)) = stroke.provisional.take() {
            let layer = stroke.layer;
            self.doc.layers[layer].pixels = pixels;
            stroke.raster = raster;
            let cells = std::mem::take(&mut stroke.provisional_tiles);
            self.dirty.extend(cells);
        }
    }
}

fn stroke_spacing(brush: &Brush) -> f32 {
    let source_min = if brush.size_source == DynamicSource::None {
        1.0
    } else {
        brush.size_min.clamp(0.0, 1.0)
    };
    let speed_min = 1.0 - 0.75 * brush.speed_size.abs().clamp(0.0, 1.0);
    let tilt_min = 1.0 - brush.tilt_size.abs().clamp(0.0, 1.0);
    (brush.size * brush.spacing.clamp(0.005, 2.0) * source_min * speed_min * tilt_min).max(0.25)
}

/// 一画の はじまり。かけない レイヤーなら 0 を かえす。
#[unsafe(no_mangle)]
pub extern "C" fn stroke_begin(x: f32, y: f32) -> i32 {
    with_app(0, |app| {
        if app.stroke.is_some() || !app.drawable(app.selected) {
            return 0;
        }
        app.checkpoint();
        let brush = &app.brushes[app.brush];
        let params = app.stroke_params(brush);
        let c = app.color;
        let mut raster = StrokeRaster::new(
            [
                c[0] as f32 / 255.0,
                c[1] as f32 / 255.0,
                c[2] as f32 / 255.0,
            ],
            brush.mix.charge,
            glam::Vec2::new(x, y),
        );
        raster.grain_rotation = if brush.grain_fixed && brush.grain_random_rotation {
            let mut s = app.grain_seed;
            s ^= s >> 12;
            s ^= s << 25;
            s ^= s >> 27;
            app.grain_seed = s;
            let unit = (s.wrapping_mul(0x2545_f491_4f6c_dd1d) >> 40) as f32 / (1u64 << 24) as f32;
            (unit * std::f32::consts::TAU).max(1e-3)
        } else {
            0.0
        };
        let mut history = History::default();
        history.begin();
        app.stroke = Some(Stroke {
            brush: app.brush,
            layer: app.selected,
            builder: StrokeBuilder::new(params),
            raster,
            history,
            provisional: None,
            provisional_tiles: Vec::new(),
            pending: Vec::new(),
            min: [f32::MAX; 2],
            max: [f32::MIN; 2],
            pushed: 0,
            vector: app.doc.layers[app.selected].vector.is_some(),
            vindex: None,
        });
        1
    })
}

/// ペンの 1点。time は ミリ秒。tilt は -1..1。
#[unsafe(no_mangle)]
pub extern "C" fn stroke_push(
    x: f32,
    y: f32,
    pressure: f32,
    tilt_x: f32,
    tilt_y: f32,
    twist: f32,
    time_ms: f64,
) {
    with_app((), |app| {
        let Some(stroke) = app.stroke.as_mut() else {
            return;
        };
        let mut p = InkPoint::new(x, y, pressure, time_ms.max(0.0) as u64);
        p.tilt = glam::Vec2::new(tilt_x, tilt_y);
        p.rotation = twist;
        stroke.pushed += 1;
        let update = stroke.builder.push(p);
        stroke.pending = update.provisional;
        if !update.committed.is_empty() {
            app.restore_provisional();
            app.paint_dabs(&update.committed);
        }
    })
}

/// 1コマに 1回。まだ きまらない しっぽを 仮に かく。
#[unsafe(no_mangle)]
pub extern "C" fn stroke_flush() {
    with_app((), |app| {
        app.restore_provisional();
        let Some(stroke) = app.stroke.as_mut() else {
            return;
        };
        let pending = std::mem::take(&mut stroke.pending);
        if pending.is_empty() || stroke.vector {
            return;
        }
        let layer = stroke.layer;
        stroke.provisional = Some((app.doc.layers[layer].pixels.clone(), stroke.raster.clone()));
        let before: BTreeSet<(u32, u32)> = std::mem::take(&mut app.dirty);
        app.paint_dabs(&pending);
        let touched: Vec<(u32, u32)> = app.dirty.iter().copied().collect();
        app.dirty.extend(before);
        if let Some(stroke) = app.stroke.as_mut() {
            stroke.provisional_tiles = touched;
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn stroke_end() {
    with_app((), |app| {
        app.restore_provisional();
        let Some(mut stroke) = app.stroke.take() else {
            return;
        };
        let tail = stroke.builder.finish();
        let layer = stroke.layer;
        let brush_index = stroke.brush;
        app.stroke = Some(stroke);
        app.paint_dabs(&tail);
        let mut stroke = app.stroke.take().unwrap();
        if stroke.vector {
            app.vector_finish(layer, stroke.vindex);
            if stroke.pushed == 0 {
                app.undo.pop();
            }
            return;
        }
        let brush = &app.brushes[brush_index];
        if brush.settle
            && !matches!(
                brush.kind,
                BrushKind::Eraser | BrushKind::Blur | BrushKind::Smudge
            )
        {
            let mut target = DabTarget {
                doc: &mut app.doc,
                layer,
                selection: None,
                history: &mut stroke.history,
            };
            stroke.raster.finish_stroke(&mut target, brush);
            let halo = brush.wet_edge_width + 4.0;
            if stroke.min[0] <= stroke.max[0] {
                let (a, b) = (stroke.min, stroke.max);
                app.mark_rect(a[0] - halo, a[1] - halo, b[0] + halo, b[1] + halo);
            }
        }
        app.doc.layers[layer].pixels.prune_empty_tiles();
        if stroke.pushed == 0 {
            // 何も かかなかったので 取り消しの 印も もどす。
            app.undo.pop();
        }
    })
}

/// 一画を なかったことに する（二本指に かわった とき など）。
#[unsafe(no_mangle)]
pub extern "C" fn stroke_cancel() {
    with_app((), |app| {
        let Some(_) = app.stroke.take() else {
            return;
        };
        if let Some(snap) = app.undo.pop() {
            let before = std::mem::replace(&mut app.doc.layers, snap.layers);
            app.selected = snap.selected;
            app.mark_diff(&before);
        }
    })
}

/// かいている 途中の 手ブレ補正の 位置（ガイド用）。なければ -1。
#[unsafe(no_mangle)]
pub extern "C" fn stroke_active() -> i32 {
    with_app(0, |app| app.stroke.is_some() as i32)
}

// ---------------------------------------------------------------- undo

#[unsafe(no_mangle)]
pub extern "C" fn checkpoint() {
    with_app((), |app| app.checkpoint())
}

#[unsafe(no_mangle)]
pub extern "C" fn history_clear() {
    with_app((), |app| {
        app.undo.clear();
        app.redo.clear();
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn undo() -> i32 {
    with_app(0, |app| {
        if app.stroke.is_some() || app.floating.is_some() {
            return 0;
        }
        let Some(snap) = app.undo.pop() else {
            return 0;
        };
        let current = Snapshot {
            layers: app.doc.layers.clone(),
            selected: app.selected,
        };
        app.redo.push(current);
        let before = std::mem::replace(&mut app.doc.layers, snap.layers);
        app.selected = snap.selected.min(app.doc.layers.len() - 1);
        app.mark_diff(&before);
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn redo() -> i32 {
    with_app(0, |app| {
        if app.stroke.is_some() || app.floating.is_some() {
            return 0;
        }
        let Some(snap) = app.redo.pop() else {
            return 0;
        };
        let current = Snapshot {
            layers: app.doc.layers.clone(),
            selected: app.selected,
        };
        app.undo.push(current);
        let before = std::mem::replace(&mut app.doc.layers, snap.layers);
        app.selected = snap.selected.min(app.doc.layers.len() - 1);
        app.mark_diff(&before);
        1
    })
}

// ---------------------------------------------------------------- layers

fn blank_layer(app: &mut App, name: &str) -> Layer {
    let id = app.fresh_id();
    Layer::new(id, name, app.doc.width, app.doc.height)
}

fn next_layer_name(app: &App) -> String {
    let mut n = app.doc.layers.len() + 1;
    loop {
        let name = format!("レイヤー {n}");
        if !app.doc.layers.iter().any(|l| l.name == name) {
            return name;
        }
        n += 1;
    }
}

#[unsafe(no_mangle)]
pub extern "C" fn layer_add() {
    with_app((), |app| {
        app.checkpoint();
        let name = next_layer_name(app);
        let mut layer = blank_layer(app, &name);
        let at = app.selected + 1;
        layer.parent_id = app.doc.layers.get(app.selected).and_then(|l| {
            if l.kind == LayerKind::Folder {
                Some(l.id)
            } else {
                l.parent_id
            }
        });
        app.doc.layers.insert(at.min(app.doc.layers.len()), layer);
        app.selected = at.min(app.doc.layers.len() - 1);
    })
}

/// ベクターレイヤーを 足す（線を あとから けずれる）。
#[unsafe(no_mangle)]
pub extern "C" fn layer_add_vector() {
    with_app((), |app| {
        app.checkpoint();
        let mut n = 1;
        let name = loop {
            let name = format!("ベクター {n}");
            if !app.doc.layers.iter().any(|l| l.name == name) {
                break name;
            }
            n += 1;
        };
        let mut layer = blank_layer(app, &name);
        layer.vector = Some(Vec::new());
        let at = app.selected + 1;
        layer.parent_id = app.doc.layers.get(app.selected).and_then(|l| {
            if l.kind == LayerKind::Folder { Some(l.id) } else { l.parent_id }
        });
        app.doc.layers.insert(at.min(app.doc.layers.len()), layer);
        app.selected = at.min(app.doc.layers.len() - 1);
    })
}

/// ベクター消しゴムで 線を まるごと 消すか（1）、ふれた ところだけか（0）。
#[unsafe(no_mangle)]
pub extern "C" fn set_vector_whole(on: u32) {
    with_app((), |app| app.vector_whole = on != 0)
}

/// レイヤー全体を ラスターに する（ベクターの 線を 絵に かためる）。
#[unsafe(no_mangle)]
pub extern "C" fn layer_rasterize(index: u32) {
    with_app((), |app| {
        let i = index as usize;
        if app.doc.layers.get(i).is_some_and(|l| l.vector.is_some()) {
            app.checkpoint();
            app.doc.layers[i].vector = None;
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn layer_select(index: u32) {
    with_app((), |app| {
        if (index as usize) < app.doc.layers.len() {
            app.selected = index as usize;
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn layer_delete(index: u32) {
    with_app((), |app| {
        let i = index as usize;
        let raster_count = app
            .doc
            .layers
            .iter()
            .filter(|l| l.kind == LayerKind::Raster)
            .count();
        if i >= app.doc.layers.len()
            || (app.doc.layers[i].kind == LayerKind::Raster && raster_count <= 1)
        {
            return;
        }
        app.checkpoint();
        let ids = efude_canvas::subtree_ids(&app.doc.layers, app.doc.layers[i].id);
        let removed: Vec<Layer> = app
            .doc
            .layers
            .iter()
            .filter(|l| ids.contains(&l.id))
            .cloned()
            .collect();
        app.doc.layers.retain(|l| !ids.contains(&l.id));
        if app.doc.layers.is_empty() {
            let l = blank_layer(app, "レイヤー 1");
            app.doc.layers.push(l);
        }
        for l in &removed {
            app.mark_layer(l);
        }
        app.selected = i.saturating_sub(1).min(app.doc.layers.len() - 1);
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn layer_duplicate(index: u32) {
    with_app((), |app| {
        let i = index as usize;
        let Some(src) = app.doc.layers.get(i).cloned() else {
            return;
        };
        if src.kind != LayerKind::Raster {
            return;
        }
        app.checkpoint();
        let mut copy = src;
        copy.id = app.fresh_id();
        copy.name = format!("{} のコピー", copy.name);
        app.mark_layer(&copy);
        app.doc.layers.insert(i + 1, copy);
        app.selected = i + 1;
    })
}

/// となりと 入れかえる（dir: +1 で 上、-1 で 下）。同じ フォルダの 中だけ。
#[unsafe(no_mangle)]
pub extern "C" fn layer_move(index: u32, dir: i32) -> i32 {
    with_app(0, |app| {
        let i = index as usize;
        let j = i as i64 + dir as i64;
        if j < 0 || j as usize >= app.doc.layers.len() || i >= app.doc.layers.len() {
            return 0;
        }
        let j = j as usize;
        let (a, b) = (&app.doc.layers[i], &app.doc.layers[j]);
        if a.parent_id != b.parent_id || a.kind != LayerKind::Raster || b.kind != LayerKind::Raster
        {
            return 0;
        }
        app.checkpoint();
        app.doc.layers.swap(i, j);
        let (a, b) = (app.doc.layers[i].clone(), app.doc.layers[j].clone());
        app.mark_layer(&a);
        app.mark_layer(&b);
        app.selected = j;
        1
    })
}

/// 下の レイヤーと ひとつに する。
#[unsafe(no_mangle)]
pub extern "C" fn layer_merge_down(index: u32) -> i32 {
    with_app(0, |app| {
        let i = index as usize;
        if i == 0 || i >= app.doc.layers.len() {
            return 0;
        }
        let (upper, lower) = (app.doc.layers[i].clone(), app.doc.layers[i - 1].clone());
        if upper.kind != LayerKind::Raster
            || lower.kind != LayerKind::Raster
            || upper.parent_id != lower.parent_id
        {
            return 0;
        }
        app.checkpoint();
        let (w, h) = (app.doc.width, app.doc.height);
        let mut base = lower.clone();
        base.opacity = 1.0;
        base.visible = true;
        base.blend = BlendMode::Normal;
        base.clipping = false;
        base.parent_id = None;
        base.tone = None;
        let mut top = upper.clone();
        top.parent_id = None;
        top.visible = upper.visible;
        let tmp = Document {
            width: w,
            height: h,
            dpi: app.doc.dpi,
            layers: vec![base, top],
            metadata: Default::default(),
        };
        let dense = efude_canvas::composite_transparent(&tmp);
        let mut merged = TilePixels::from_dense(w, h, &dense);
        merged.prune_empty_tiles();
        let upper_copy = app.doc.layers[i].clone();
        app.doc.layers[i - 1].pixels = merged;
        app.doc.layers[i - 1].vector = None;
        app.doc.layers.remove(i);
        app.mark_layer(&upper_copy);
        let lower_copy = app.doc.layers[i - 1].clone();
        app.mark_layer(&lower_copy);
        app.selected = i - 1;
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn layer_clear(index: u32) {
    with_app((), |app| {
        let i = index as usize;
        if !app.drawable(i) {
            return;
        }
        app.checkpoint();
        let copy = app.doc.layers[i].clone();
        app.mark_layer(&copy);
        if let Some(v) = &mut app.doc.layers[i].vector {
            v.clear();
        }
        app.doc.layers[i].pixels.clear_tiles();
    })
}

/// レイヤーの 値を かえる。取り消しの 印は JS が `checkpoint` で つける。
/// key: visible / opacity / locked / clipping / blend / tone / tone_lpi / tone_angle / tone_shape
#[unsafe(no_mangle)]
pub extern "C" fn layer_set(index: u32, key_ptr: *const u8, key_len: usize, value: f32) {
    let key = String::from_utf8_lossy(bytes_from(key_ptr, key_len)).into_owned();
    with_app((), |app| {
        let i = index as usize;
        let Some(layer) = app.doc.layers.get_mut(i) else {
            return;
        };
        let on = value > 0.5;
        match key.as_str() {
            "visible" => layer.visible = on,
            "opacity" => layer.opacity = value.clamp(0.0, 1.0),
            "locked" => layer.locked = on,
            "clipping" => layer.clipping = on,
            "blend" => layer.blend = BLENDS[(value.max(0.0) as usize).min(BLENDS.len() - 1)],
            "tone" => {
                layer.tone = if on {
                    Some(layer.tone.unwrap_or_default())
                } else {
                    None
                };
            }
            "tone_lpi" => {
                if let Some(t) = &mut layer.tone {
                    t.lines_per_inch = value.clamp(5.0, 300.0);
                }
            }
            "tone_angle" => {
                if let Some(t) = &mut layer.tone {
                    t.angle_degrees = value.clamp(-180.0, 180.0);
                }
            }
            "tone_shape" => {
                if let Some(t) = &mut layer.tone {
                    t.shape = DotShape::ALL[(value.max(0.0) as usize).min(DotShape::ALL.len() - 1)];
                }
            }
            _ => return,
        }
        let copy = app.doc.layers[i].clone();
        app.mark_layer(&copy);
        // フォルダは 中みも 見た目が かわる。
        if copy.kind == LayerKind::Folder {
            let ids = efude_canvas::subtree_ids(&app.doc.layers, copy.id);
            let kids: Vec<Layer> = app
                .doc
                .layers
                .iter()
                .filter(|l| ids.contains(&l.id))
                .cloned()
                .collect();
            for l in &kids {
                app.mark_layer(l);
            }
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn layer_rename(index: u32, ptr: *const u8, len: usize) {
    let name = String::from_utf8_lossy(bytes_from(ptr, len)).into_owned();
    with_app((), |app| {
        let i = index as usize;
        if i < app.doc.layers.len() && !name.trim().is_empty() {
            app.checkpoint();
            app.doc.layers[i].name = name.trim().chars().take(60).collect();
        }
    })
}

/// レイヤーの 小さな 絵（RGBA, tw×th）。
#[unsafe(no_mangle)]
pub extern "C" fn layer_thumb(index: u32, tw: u32, th: u32) -> usize {
    with_app(0, |app| {
        let Some(layer) = app.doc.layers.get(index as usize) else {
            return 0;
        };
        let (tw, th) = (tw.clamp(1, 256), th.clamp(1, 256));
        let (w, h) = (app.doc.width, app.doc.height);
        let mut out = vec![0u8; (tw * th * 4) as usize];
        if layer.kind == LayerKind::Folder {
            return set_out(out);
        }
        for y in 0..th {
            for x in 0..tw {
                // 4点 とって いちばん 濃いのを つかう（細い 線が きえない ように）。
                let mut best = [0u8; 4];
                for (ox, oy) in [(0.25, 0.25), (0.75, 0.25), (0.25, 0.75), (0.75, 0.75)] {
                    let sx = (((x as f32 + ox) / tw as f32) * w as f32) as u32;
                    let sy = (((y as f32 + oy) / th as f32) * h as f32) as u32;
                    let px = layer.pixels.pixel(sx.min(w - 1), sy.min(h - 1));
                    if px[3] > best[3] {
                        best = px;
                    }
                }
                let i = ((y * tw + x) * 4) as usize;
                out[i..i + 4].copy_from_slice(&best);
            }
        }
        set_out(out)
    })
}

/// 画像を 新しい レイヤーとして 入れる（JS で RGBA に ほどいて わたす）。
#[unsafe(no_mangle)]
pub extern "C" fn layer_from_rgba(
    ptr: *const u8,
    width: u32,
    height: u32,
    ox: i32,
    oy: i32,
    name_ptr: *const u8,
    name_len: usize,
) {
    let data = bytes_from(ptr, (width * height * 4) as usize).to_vec();
    let name = String::from_utf8_lossy(bytes_from(name_ptr, name_len)).into_owned();
    with_app((), |app| {
        app.checkpoint();
        let mut layer = blank_layer(app, if name.is_empty() { "画像" } else { &name });
        let (dw, dh) = (app.doc.width as i32, app.doc.height as i32);
        for y in 0..height as i32 {
            let dy = oy + y;
            if dy < 0 || dy >= dh {
                continue;
            }
            for x in 0..width as i32 {
                let dx = ox + x;
                if dx < 0 || dx >= dw {
                    continue;
                }
                let i = ((y as u32 * width + x as u32) * 4) as usize;
                if data[i + 3] != 0 {
                    layer.pixels.set_pixel(
                        dx as u32,
                        dy as u32,
                        [data[i], data[i + 1], data[i + 2], data[i + 3]],
                    );
                }
            }
        }
        app.mark_layer(&layer);
        let at = (app.selected + 1).min(app.doc.layers.len());
        app.doc.layers.insert(at, layer);
        app.selected = at;
    })
}

// ---------------------------------------------------------------- fill

impl App {
    /// `mask`（1画素 1バイト）の ところを 今の 色で ぬる／けす。`bbox` は mask の ある はんい。
    fn apply_mask(&mut self, mask: &[u8], bbox: [u32; 4], erase: bool) {
        let w = self.doc.width;
        let layer = self.selected;
        let [r, g, b, a] = self.color;
        let [x0, y0, x1, y1] = bbox;
        if x0 > x1 || y0 > y1 {
            return;
        }
        let pixels = &mut self.doc.layers[layer].pixels;
        for ty in y0 / TILE_SIZE..=y1 / TILE_SIZE {
            for tx in x0 / TILE_SIZE..=x1 / TILE_SIZE {
                let (ox, oy) = (tx * TILE_SIZE, ty * TILE_SIZE);
                let (lx0, ly0) = (x0.max(ox) - ox, y0.max(oy) - oy);
                let (lx1, ly1) = (
                    x1.min(ox + TILE_SIZE - 1) - ox,
                    y1.min(oy + TILE_SIZE - 1) - oy,
                );
                let any = (ly0..=ly1).any(|ly| {
                    let row = ((oy + ly) * w + ox) as usize;
                    mask[row + lx0 as usize..=row + lx1 as usize]
                        .iter()
                        .any(|&m| m != 0)
                });
                if !any || (erase && pixels.tile_data(tx, ty).is_none()) {
                    continue;
                }
                let tile = pixels.tile_mut(tx, ty);
                for ly in ly0..=ly1 {
                    let row = ((oy + ly) * w + ox) as usize;
                    for lx in lx0..=lx1 {
                        let m = mask[row + lx as usize];
                        if m == 0 {
                            continue;
                        }
                        let i = ((ly * TILE_SIZE + lx) * 4) as usize;
                        let px = &mut tile[i..i + 4];
                        let k = m as f32 / 255.0;
                        if erase {
                            let na = (px[3] as f32 * (1.0 - k)).round() as u8;
                            if na == 0 {
                                px.copy_from_slice(&[0, 0, 0, 0]);
                            } else {
                                px[3] = na;
                            }
                            continue;
                        }
                        let sa = a as f32 / 255.0 * k;
                        let da = px[3] as f32 / 255.0;
                        let oa = sa + da * (1.0 - sa);
                        if oa <= 0.0 {
                            continue;
                        }
                        let mix = |s: u8, d: u8| {
                            ((s as f32 * sa + d as f32 * da * (1.0 - sa)) / oa).round() as u8
                        };
                        let out = [
                            mix(r, px[0]),
                            mix(g, px[1]),
                            mix(b, px[2]),
                            (oa * 255.0).round() as u8,
                        ];
                        px.copy_from_slice(&out);
                    }
                }
            }
        }
        pixels.prune_empty_tiles();
        self.mark_rect(x0 as f32, y0 as f32, x1 as f32, y1 as f32);
    }

    /// 塗りつぶしで 見る 絵。見えている ラスターを 単純に 重ねる（速さ 優先）。
    fn fill_reference(&self, all: bool) -> Vec<u8> {
        let (w, h) = (self.doc.width, self.doc.height);
        let mut out = vec![0u8; (w * h * 4) as usize];
        let layers: Vec<&Layer> = if all {
            self.doc
                .layers
                .iter()
                .filter(|l| l.kind == LayerKind::Raster && self.visible_in_tree(l))
                .collect()
        } else {
            vec![&self.doc.layers[self.selected]]
        };
        for l in layers {
            let op = if all { l.opacity.clamp(0.0, 1.0) } else { 1.0 };
            for ((tx, ty), data) in l.pixels.tiles() {
                let (ox, oy) = (tx * TILE_SIZE, ty * TILE_SIZE);
                if ox >= w || oy >= h {
                    continue;
                }
                for ly in 0..TILE_SIZE.min(h - oy) {
                    for lx in 0..TILE_SIZE.min(w - ox) {
                        let s = ((ly * TILE_SIZE + lx) * 4) as usize;
                        let d = (((oy + ly) * w + ox + lx) * 4) as usize;
                        if data[s + 3] == 255 && op >= 1.0 {
                            out[d..d + 4].copy_from_slice(&data[s..s + 4]);
                            continue;
                        }
                        let sa = data[s + 3] as f32 / 255.0 * op;
                        if sa <= 0.0 {
                            continue;
                        }
                        let da = out[d + 3] as f32 / 255.0;
                        let oa = sa + da * (1.0 - sa);
                        for c in 0..3 {
                            out[d + c] = ((data[s + c] as f32 * sa
                                + out[d + c] as f32 * da * (1.0 - sa))
                                / oa)
                                .round() as u8;
                        }
                        out[d + 3] = (oa * 255.0).round() as u8;
                    }
                }
            }
        }
        out
    }

    fn visible_in_tree(&self, layer: &Layer) -> bool {
        let mut visible = layer.visible;
        let mut parent = layer.parent_id;
        let mut depth = 0;
        while let Some(id) = parent {
            depth += 1;
            if depth > 64 {
                break;
            }
            match self.doc.layers.iter().find(|l| l.id == id) {
                Some(g) => {
                    visible &= g.visible;
                    parent = g.parent_id;
                }
                None => break,
            }
        }
        visible
    }
}

/// 同じ 色の つながった ところ（行ごとに すすむ 塗りつぶし）。
fn flood(pixels: &[u8], w: u32, h: u32, x: u32, y: u32, tolerance: u32) -> Vec<u8> {
    let (w, h) = (w as usize, h as usize);
    let mut mask = vec![0u8; w * h];
    let start = (y as usize * w + x as usize) * 4;
    let target = [
        pixels[start],
        pixels[start + 1],
        pixels[start + 2],
        pixels[start + 3],
    ];
    let threshold = tolerance * tolerance * 4;
    let same = |i: usize| -> bool {
        let p = &pixels[i * 4..i * 4 + 4];
        let mut d = 0u32;
        for c in 0..4 {
            let v = p[c] as i32 - target[c] as i32;
            d += (v * v) as u32;
        }
        d <= threshold
    };
    let mut stack = vec![(x as usize, y as usize)];
    while let Some((sx, sy)) = stack.pop() {
        let row = sy * w;
        if mask[row + sx] != 0 || !same(row + sx) {
            continue;
        }
        let mut l = sx;
        while l > 0 && mask[row + l - 1] == 0 && same(row + l - 1) {
            l -= 1;
        }
        let mut r = sx;
        while r + 1 < w && mask[row + r + 1] == 0 && same(row + r + 1) {
            r += 1;
        }
        mask[row + l..=row + r].fill(255);
        for ny in [sy.wrapping_sub(1), sy + 1] {
            if ny >= h {
                continue;
            }
            let nrow = ny * w;
            let mut inside = false;
            for nx in l..=r {
                let ok = mask[nrow + nx] == 0 && same(nrow + nx);
                if ok && !inside {
                    stack.push((nx, ny));
                }
                inside = ok;
            }
        }
    }
    mask
}

fn mask_bbox(mask: &[u8], w: u32, h: u32) -> [u32; 4] {
    let (mut x0, mut y0, mut x1, mut y1) = (u32::MAX, u32::MAX, 0, 0);
    for y in 0..h {
        let row = &mask[(y * w) as usize..((y + 1) * w) as usize];
        if let Some(first) = row.iter().position(|&m| m != 0) {
            let last = row.iter().rposition(|&m| m != 0).unwrap();
            x0 = x0.min(first as u32);
            x1 = x1.max(last as u32);
            y0 = y0.min(y);
            y1 = y1.max(y);
        }
    }
    [x0, y0, x1, y1]
}

/// 塗りつぶし。`all` が 1 なら 見えている 絵ぜんぶを 見て 境を きめる。
/// `grow` は 塗る はんいを 広げる 画素数（線の 下に もぐらせる）。
#[unsafe(no_mangle)]
pub extern "C" fn fill_at(x: f32, y: f32, tolerance: u32, all: u32, grow: u32) -> i32 {
    with_app(0, |app| {
        let (w, h) = (app.doc.width, app.doc.height);
        if x < 0.0 || y < 0.0 || x >= w as f32 || y >= h as f32 || !app.paintable(app.selected) {
            return 0;
        }
        let pixels = app.fill_reference(all != 0);
        let mut sel = Selection {
            mask: flood(&pixels, w, h, x as u32, y as u32, tolerance.min(255)),
            active: true,
        };
        drop(pixels);
        if grow > 0 {
            sel.expand(w, h, grow.min(16));
        }
        app.checkpoint();
        let mask = std::mem::take(&mut sel.mask);
        let bbox = mask_bbox(&mask, w, h);
        app.apply_mask(&mask, bbox, false);
        1
    })
}

/// 囲って 塗る／けす。点は f32 の x,y の ならび。
#[unsafe(no_mangle)]
pub extern "C" fn lasso(points_ptr: *const u8, count: u32, erase: u32) -> i32 {
    let raw = bytes_from(points_ptr, count as usize * 8);
    let pts: Vec<(i32, i32)> = raw
        .chunks_exact(8)
        .map(|c| {
            let x = f32::from_le_bytes(c[0..4].try_into().unwrap());
            let y = f32::from_le_bytes(c[4..8].try_into().unwrap());
            (x.round() as i32, y.round() as i32)
        })
        .collect();
    with_app(0, |app| {
        if pts.len() < 3 || !app.paintable(app.selected) {
            return 0;
        }
        let (w, h) = (app.doc.width, app.doc.height);
        let mut sel = Selection::default();
        sel.polygon(w, h, &pts);
        if !sel.active {
            return 0;
        }
        app.checkpoint();
        let mask = std::mem::take(&mut sel.mask);
        let bbox = mask_bbox(&mask, w, h);
        app.apply_mask(&mask, bbox, erase != 0);
        1
    })
}

/// 紙の 向きを かえる（90度 回す・左右 反転）。mode: 0=右回り 1=左回り 2=左右 3=上下
#[unsafe(no_mangle)]
pub extern "C" fn doc_transform(mode: u32) -> i32 {
    with_app(0, |app| {
        if app.stroke.is_some() {
            return 0;
        }
        let (w, h) = (app.doc.width, app.doc.height);
        let (nw, nh) = if mode <= 1 { (h, w) } else { (w, h) };
        app.checkpoint();
        for layer in &mut app.doc.layers {
            if layer.kind != LayerKind::Raster {
                continue;
            }
            let src = &layer.pixels;
            let mut dst = TilePixels::new(nw, nh);
            for (key, _) in src.tiles() {
                let (ox, oy) = (key.0 * TILE_SIZE, key.1 * TILE_SIZE);
                for ly in 0..TILE_SIZE.min(h.saturating_sub(oy)) {
                    for lx in 0..TILE_SIZE.min(w.saturating_sub(ox)) {
                        let (x, y) = (ox + lx, oy + ly);
                        let px = src.pixel(x, y);
                        if px[3] == 0 {
                            continue;
                        }
                        let (nx, ny) = match mode {
                            0 => (h - 1 - y, x),
                            1 => (y, w - 1 - x),
                            2 => (w - 1 - x, y),
                            _ => (x, h - 1 - y),
                        };
                        dst.set_pixel(nx, ny, px);
                    }
                }
            }
            layer.pixels = dst;
            layer.mask = None;
        }
        app.doc.width = nw;
        app.doc.height = nh;
        if mode <= 1 {
            // 大きさが かわるので 取り消しは できなくする。
            app.undo.clear();
            app.redo.clear();
        }
        app.dirty.clear();
        app.mark_all();
        1
    })
}

// ---------------------------------------------------------------- move / transform

/// 囲った ところ（点が 3つ 未満なら レイヤー全体）を 切りとって 浮かせる。
/// かえり: 1 なら 浮いた。`out` に JSON {x,y,w,h}。絵は `float_rgba` で。
#[unsafe(no_mangle)]
pub extern "C" fn float_begin(points_ptr: *const u8, count: u32) -> i32 {
    let raw = bytes_from(points_ptr, count as usize * 8);
    let pts: Vec<(i32, i32)> = raw
        .chunks_exact(8)
        .map(|c| {
            let x = f32::from_le_bytes(c[0..4].try_into().unwrap());
            let y = f32::from_le_bytes(c[4..8].try_into().unwrap());
            (x.round() as i32, y.round() as i32)
        })
        .collect();
    with_app(0, |app| {
        if app.floating.is_some() || app.stroke.is_some() || !app.paintable(app.selected) {
            return 0;
        }
        let (w, h) = (app.doc.width, app.doc.height);
        let layer = app.selected;
        let mask: Option<Vec<u8>> = if pts.len() >= 3 {
            let mut sel = Selection::default();
            sel.polygon(w, h, &pts);
            Some(sel.mask)
        } else {
            None
        };
        // 絵の ある はんい
        let (mut x0, mut y0, mut x1, mut y1) = (u32::MAX, u32::MAX, 0u32, 0u32);
        for (tx, ty) in app.doc.layers[layer].pixels.tile_keys() {
            let data = app.doc.layers[layer].pixels.tile_data(tx, ty).unwrap();
            for ly in 0..TILE_SIZE {
                let y = ty * TILE_SIZE + ly;
                if y >= h {
                    break;
                }
                for lx in 0..TILE_SIZE {
                    let x = tx * TILE_SIZE + lx;
                    if x >= w {
                        break;
                    }
                    if data[((ly * TILE_SIZE + lx) * 4 + 3) as usize] == 0 {
                        continue;
                    }
                    if let Some(m) = &mask {
                        if m[(y * w + x) as usize] == 0 {
                            continue;
                        }
                    }
                    x0 = x0.min(x);
                    y0 = y0.min(y);
                    x1 = x1.max(x);
                    y1 = y1.max(y);
                }
            }
        }
        if x0 > x1 {
            return 0;
        }
        app.checkpoint();
        let (fw, fh) = (x1 - x0 + 1, y1 - y0 + 1);
        let mut rgba = vec![0u8; (fw * fh * 4) as usize];
        for y in y0..=y1 {
            for x in x0..=x1 {
                let k = mask.as_ref().map_or(255, |m| m[(y * w + x) as usize]);
                if k == 0 {
                    continue;
                }
                let px = app.doc.layers[layer].pixels.pixel(x, y);
                if px[3] == 0 {
                    continue;
                }
                let i = (((y - y0) * fw + (x - x0)) * 4) as usize;
                let taken = (px[3] as u32 * k as u32 + 127) / 255;
                rgba[i..i + 3].copy_from_slice(&px[..3]);
                rgba[i + 3] = taken as u8;
                let left = px[3] - taken as u8;
                app.doc.layers[layer].pixels.set_pixel(
                    x,
                    y,
                    if left == 0 {
                        [0, 0, 0, 0]
                    } else {
                        [px[0], px[1], px[2], left]
                    },
                );
            }
        }
        app.doc.layers[layer].pixels.prune_empty_tiles();
        app.mark_rect(x0 as f32, y0 as f32, x1 as f32, y1 as f32);
        app.floating = Some(Floating {
            layer,
            w: fw,
            h: fh,
            rgba,
        });
        set_out_str(&serde_json::json!({"x": x0, "y": y0, "w": fw, "h": fh}).to_string());
        1
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn float_rgba() -> usize {
    with_app(0, |app| match &app.floating {
        Some(f) => set_out(f.rgba.clone()),
        None => 0,
    })
}

/// 浮いた 絵を 置く。行列は 浮いた 絵の 中の 点 (u,v) → 紙の 点:
/// X = a*u + c*v + e,  Y = b*u + d*v + f
#[unsafe(no_mangle)]
pub extern "C" fn float_commit(a: f32, b: f32, c: f32, d: f32, e: f32, f: f32) -> i32 {
    with_app(0, |app| {
        let Some(fl) = app.floating.take() else {
            return 0;
        };
        let det = a * d - b * c;
        if !det.is_finite() || det.abs() < 1e-6 {
            return 0;
        }
        let (ia, ib, ic, id) = (d / det, -b / det, -c / det, a / det);
        let (w, h) = (app.doc.width as f32, app.doc.height as f32);
        let corners = [
            (0.0, 0.0),
            (fl.w as f32, 0.0),
            (0.0, fl.h as f32),
            (fl.w as f32, fl.h as f32),
        ];
        let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
        for (u, v) in corners {
            let (x, y) = (a * u + c * v + e, b * u + d * v + f);
            x0 = x0.min(x);
            y0 = y0.min(y);
            x1 = x1.max(x);
            y1 = y1.max(y);
        }
        let x0 = x0.floor().max(0.0) as u32;
        let y0 = y0.floor().max(0.0) as u32;
        let x1 = (x1.ceil().min(w) as u32).min(app.doc.width);
        let y1 = (y1.ceil().min(h) as u32).min(app.doc.height);
        let fw = fl.w as i32;
        let fh = fl.h as i32;
        // 乗算済みで とりだす（はしの 色が にごらない ように）
        let sample = |u: i32, v: i32| -> [f32; 4] {
            if u < 0 || v < 0 || u >= fw || v >= fh {
                return [0.0; 4];
            }
            let i = ((v * fw + u) * 4) as usize;
            let al = fl.rgba[i + 3] as f32 / 255.0;
            [
                fl.rgba[i] as f32 * al,
                fl.rgba[i + 1] as f32 * al,
                fl.rgba[i + 2] as f32 * al,
                al,
            ]
        };
        let layer = fl.layer.min(app.doc.layers.len() - 1);
        for y in y0..y1 {
            for x in x0..x1 {
                let (px, py) = (x as f32 + 0.5 - e, y as f32 + 0.5 - f);
                let u = ia * px + ic * py - 0.5;
                let v = ib * px + id * py - 0.5;
                if u < -1.0 || v < -1.0 || u > fl.w as f32 || v > fl.h as f32 {
                    continue;
                }
                let (u0, v0) = (u.floor(), v.floor());
                let (fu, fv) = (u - u0, v - v0);
                let (u0, v0) = (u0 as i32, v0 as i32);
                let s00 = sample(u0, v0);
                let s10 = sample(u0 + 1, v0);
                let s01 = sample(u0, v0 + 1);
                let s11 = sample(u0 + 1, v0 + 1);
                let mut src = [0.0f32; 4];
                for k in 0..4 {
                    src[k] = s00[k] * (1.0 - fu) * (1.0 - fv)
                        + s10[k] * fu * (1.0 - fv)
                        + s01[k] * (1.0 - fu) * fv
                        + s11[k] * fu * fv;
                }
                let sa = src[3];
                if sa <= 0.001 {
                    continue;
                }
                let dst = app.doc.layers[layer].pixels.pixel(x, y);
                let da = dst[3] as f32 / 255.0;
                let oa = sa + da * (1.0 - sa);
                let mut out = [0u8; 4];
                for k in 0..3 {
                    out[k] = ((src[k] + dst[k] as f32 * da * (1.0 - sa)) / oa)
                        .round()
                        .clamp(0.0, 255.0) as u8;
                }
                out[3] = (oa * 255.0).round() as u8;
                app.doc.layers[layer].pixels.set_pixel(x, y, out);
            }
        }
        app.doc.layers[layer].pixels.prune_empty_tiles();
        if x1 > x0 && y1 > y0 {
            app.mark_rect(x0 as f32, y0 as f32, x1 as f32, y1 as f32);
        }
        1
    })
}

/// 浮かせるのを やめて もとに もどす。
#[unsafe(no_mangle)]
pub extern "C" fn float_cancel() {
    with_app((), |app| {
        if app.floating.take().is_none() {
            return;
        }
        if let Some(snap) = app.undo.pop() {
            let before = std::mem::replace(&mut app.doc.layers, snap.layers);
            app.selected = snap.selected;
            app.mark_diff(&before);
        }
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn float_active() -> i32 {
    with_app(0, |app| app.floating.is_some() as i32)
}

/// ベクターの 線を はんい だけ かきなおす。
/// Efude の render_region は 線の なくなった タイルを 消さない ことが あるので、先に 消しておく。
fn render_vector(layer: &mut Layer, w: u32, h: u32, rect: vector::PixelRect) {
    let x0 = rect[0].max(0) as u32;
    let y0 = rect[1].max(0) as u32;
    let x1 = (rect[2].max(0) as u32).min(w);
    let y1 = (rect[3].max(0) as u32).min(h);
    if x1 > x0 && y1 > y0 {
        for ty in y0 / TILE_SIZE..=(y1 - 1) / TILE_SIZE {
            for tx in x0 / TILE_SIZE..=(x1 - 1) / TILE_SIZE {
                if layer.pixels.tile_data(tx, ty).is_none() {
                    continue;
                }
                let (ox, oy) = (tx * TILE_SIZE, ty * TILE_SIZE);
                let (lx0, lx1) = (x0.max(ox) - ox, x1.min(ox + TILE_SIZE) - ox);
                let (ly0, ly1) = (y0.max(oy) - oy, y1.min(oy + TILE_SIZE) - oy);
                let tile = layer.pixels.tile_mut(tx, ty);
                for ly in ly0..ly1 {
                    let a = ((ly * TILE_SIZE + lx0) * 4) as usize;
                    let b = ((ly * TILE_SIZE + lx1) * 4) as usize;
                    tile[a..b].fill(0);
                }
            }
        }
    }
    vector::render_region(layer, w, h, rect, None);
    layer.pixels.prune_empty_tiles();
}

/// ベクターの 線幅を かえる。(x,y) から 半径 r の 中の 点の 太さを factor 倍（r が 0 以下なら レイヤー全体）。
#[unsafe(no_mangle)]
pub extern "C" fn vector_width(x: f32, y: f32, r: f32, factor: f32) -> i32 {
    with_app(0, |app| {
        let i = app.selected;
        let (w, h) = (app.doc.width, app.doc.height);
        if app.doc.layers.get(i).is_none_or(|l| l.locked || l.vector.is_none()) || !factor.is_finite() {
            return 0;
        }
        let l = &mut app.doc.layers[i];
        let strokes = l.vector.as_mut().unwrap();
        let mut dirty: Option<vector::PixelRect> = None;
        for st in strokes.iter_mut() {
            let hit = r <= 0.0
                || st.points.iter().any(|p| (p.x - x).hypot(p.y - y) < r + p.width * 0.5);
            if !hit {
                continue;
            }
            let before = st.bounds();
            let near = |px: f32, py: f32| r <= 0.0 || (px - x).hypot(py - y) < r;
            for p in st.points.iter_mut() {
                if near(p.x, p.y) {
                    p.width = (p.width * factor).clamp(0.3, 600.0);
                }
            }
            for a in st.anchors.iter_mut() {
                if near(a.x, a.y) {
                    a.width = (a.width * factor).clamp(0.3, 600.0);
                }
            }
            dirty = vector::union_rect(dirty, vector::union_rect(before, st.bounds()));
        }
        let Some(rect) = dirty else {
            return 0;
        };
        let rect = [rect[0] - 2, rect[1] - 2, rect[2] + 2, rect[3] + 2];
        render_vector(l, w, h, rect);
        app.mark_rect(rect[0] as f32, rect[1] as f32, rect[2] as f32, rect[3] as f32);
        1
    })
}
