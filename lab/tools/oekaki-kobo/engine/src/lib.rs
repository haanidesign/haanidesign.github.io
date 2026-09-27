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
    /// 透明度保護の ときの 塗れる ところ（レイヤーの アルファ × 選択範囲）。
    mask: Option<Vec<u8>>,
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
    /// 選択範囲（1画素 1バイト）。描く・塗る・消す・動かす・フィルターは この 中だけ。
    selection: Selection,
    /// 透明度保護（色の ある ところ だけ 塗る）レイヤーの id。
    alpha_locked: std::collections::HashSet<u64>,
    /// 対称定規: 0 なし 1 左右 2 上下 3 上下左右 4 放射
    sym_mode: u32,
    sym_n: u32,
    sym_center: [f32; 2],
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
            selection: Selection::default(),
            alpha_locked: Default::default(),
            sym_mode: 0,
            sym_n: 6,
            sym_center: [0.0, 0.0],
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
                    "alpha_lock": app.alpha_locked.contains(&l.id),
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
    let mut locked: Vec<u64> = Vec::new();
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
            if l["alpha_lock"].as_bool().unwrap_or(false) {
                locked.push(layer.id);
            }
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
            with_app((), |app| app.alpha_locked.extend(locked));
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
                    "expanded": l.expanded,
                    "alpha_lock": app.alpha_locked.contains(&l.id),
                    "sketch": l.sketch,
                    "parent": l.parent_id.and_then(|p| app.doc.layers.iter().position(|x| x.id == p)),
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
            selection: match &stroke.mask {
                Some(m) => Some(m.as_slice()),
                None => self.selection.active.then_some(self.selection.mask.as_slice()),
            },
            history: &mut stroke.history,
        };
        let sym = (self.sym_mode, self.sym_n, self.sym_center);
        let batch = engine::accelerator_can_paint(style);
        let mut stamps = Vec::with_capacity(points.len());
        for point in points {
            let mut p = *point;
            p.pressure = brush.map_pressure(p.pressure.clamp(0.0, 1.0).powf(gamma));
            let dynamics: Dynamics =
                engine::dynamics(brush, &p, stroke.raster.last_dab, view_scale);
            for q in symmetric(p, sym) {
                let g = DabGeometry::new(style, &dynamics, &q);
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
                    stamps.push((q, dynamics));
                } else {
                    // 下の 色を 拾う ブラシは 1つずつ 塗る。
                    stroke.raster.stamp(&mut target, style, &dynamics, q);
                }
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
        let alpha_mask = app.alpha_mask_for(app.selected);
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
            mask: alpha_mask,
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
                selection: match &stroke.mask {
                    Some(m) => Some(m.as_slice()),
                    None => app.selection.active.then_some(app.selection.mask.as_slice()),
                },
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
        let id = layer.id;
        app.doc.layers.insert(at.min(app.doc.layers.len()), layer);
        efude_canvas::tidy_layer_order(&mut app.doc.layers);
        app.selected = app.doc.layers.iter().position(|l| l.id == id).unwrap_or(0);
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
        let id = layer.id;
        app.doc.layers.insert(at.min(app.doc.layers.len()), layer);
        efude_canvas::tidy_layer_order(&mut app.doc.layers);
        app.selected = app.doc.layers.iter().position(|l| l.id == id).unwrap_or(0);
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
            "expanded" => layer.expanded = on,
            "alpha_lock" => {
                let id = layer.id;
                if on {
                    app.alpha_locked.insert(id);
                } else {
                    app.alpha_locked.remove(&id);
                }
            }
            "sketch" => layer.sketch = on,
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
        let mut mask = std::mem::take(&mut sel.mask);
        app.clip_to_selection(&mut mask);
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
        let mut mask = std::mem::take(&mut sel.mask);
        app.clip_to_selection(&mut mask);
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
        app.selection.clear();
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
            let mut m = sel.mask;
            app.clip_to_selection(&mut m);
            Some(m)
        } else if app.selection.active {
            Some(app.selection.mask.clone())
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

/// ベクター消しゴム。mode: 0 触れた ところ / 1 交点まで / 2 線ごと。r は 紙の 画素。
#[unsafe(no_mangle)]
pub extern "C" fn vector_erase(x: f32, y: f32, r: f32, mode: u32) -> i32 {
    with_app(0, |app| {
        let i = app.selected;
        let (w, h) = (app.doc.width, app.doc.height);
        if app.doc.layers.get(i).is_none_or(|l| l.locked || l.vector.is_none()) {
            return 0;
        }
        let l = &mut app.doc.layers[i];
        let strokes = l.vector.as_mut().unwrap();
        let dirty = match mode {
            0 => vector::erase_circle(strokes, (x, y), r, false),
            2 => vector::erase_circle(strokes, (x, y), r, true),
            _ => erase_to_intersections(strokes, x, y, r),
        };
        let Some(rect) = dirty else {
            return 0;
        };
        let rect = [rect[0] - 2, rect[1] - 2, rect[2] + 2, rect[3] + 2];
        render_vector(l, w, h, rect);
        app.mark_rect(rect[0] as f32, rect[1] as f32, rect[2] as f32, rect[3] as f32);
        1
    })
}

/// 2つの 線分の 交わる ところ（線分 a の 上の 位置 0..1）。
fn seg_cross(a0: (f32, f32), a1: (f32, f32), b0: (f32, f32), b1: (f32, f32)) -> Option<f32> {
    let d = (a1.0 - a0.0) * (b1.1 - b0.1) - (a1.1 - a0.1) * (b1.0 - b0.0);
    if d.abs() < 1e-9 {
        return None;
    }
    let t = ((b0.0 - a0.0) * (b1.1 - b0.1) - (b0.1 - a0.1) * (b1.0 - b0.0)) / d;
    let u = ((b0.0 - a0.0) * (a1.1 - a0.1) - (b0.1 - a0.1) * (a1.0 - a0.0)) / d;
    ((0.0..=1.0).contains(&t) && (0.0..=1.0).contains(&u)).then_some(t)
}

/// 触れた 線を、ほかの 線（と 自分）と 交わる ところ から ところ まで 消す。
fn erase_to_intersections(strokes: &mut Vec<vector::VectorStroke>, x: f32, y: f32, r: f32) -> Option<vector::PixelRect> {
    // いちばん 近い 線と その 位置（線分の 番号 + 0..1）
    let mut best: Option<(usize, f32, f32)> = None;
    for (si, s) in strokes.iter().enumerate() {
        let n = s.points.len();
        for k in 0..n.saturating_sub(1).max(1) {
            let a = s.points[k];
            let b = s.points[(k + 1).min(n - 1)];
            let (dx, dy) = (b.x - a.x, b.y - a.y);
            let len2 = dx * dx + dy * dy;
            let t = if len2 > 1e-9 { (((x - a.x) * dx + (y - a.y) * dy) / len2).clamp(0.0, 1.0) } else { 0.0 };
            let dist = (a.x + dx * t - x).hypot(a.y + dy * t - y) - a.width.max(b.width) * 0.5;
            if dist < r && best.is_none_or(|b| dist < b.2) {
                best = Some((si, k as f32 + t, dist));
            }
        }
    }
    let (si, pos, _) = best?;
    let s = &strokes[si];
    let n = s.points.len();
    if n < 2 {
        let bounds = s.bounds();
        strokes.remove(si);
        return bounds;
    }
    // この 線の 上の 交点を ぜんぶ あつめる
    let mut cuts: Vec<f32> = Vec::new();
    for (oi, o) in strokes.iter().enumerate() {
        for k in 0..n - 1 {
            let a0 = (s.points[k].x, s.points[k].y);
            let a1 = (s.points[k + 1].x, s.points[k + 1].y);
            for m in 0..o.points.len().saturating_sub(1) {
                if oi == si && (m as i64 - k as i64).abs() <= 1 {
                    continue;
                }
                let b0 = (o.points[m].x, o.points[m].y);
                let b1 = (o.points[m + 1].x, o.points[m + 1].y);
                if let Some(t) = seg_cross(a0, a1, b0, b1) {
                    cuts.push(k as f32 + t);
                }
            }
        }
    }
    let lo = cuts.iter().copied().filter(|&c| c < pos).fold(f32::MIN, f32::max);
    let hi = cuts.iter().copied().filter(|&c| c > pos).fold(f32::MAX, f32::min);
    let bounds = s.bounds();
    let lerp = |c: f32| {
        let k = (c.floor() as usize).min(n - 2);
        let t = c - k as f32;
        let (a, b) = (s.points[k], s.points[k + 1]);
        vector::VectorPoint { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, width: a.width + (b.width - a.width) * t }
    };
    let mut pieces: Vec<Vec<vector::VectorPoint>> = Vec::new();
    if lo > f32::MIN {
        let mut p: Vec<_> = s.points[..=(lo.floor() as usize).min(n - 1)].to_vec();
        p.push(lerp(lo));
        pieces.push(p);
    }
    if hi < f32::MAX {
        let mut p = vec![lerp(hi)];
        p.extend_from_slice(&s.points[((hi.floor() as usize) + 1).min(n)..]);
        pieces.push(p);
    }
    let (color, hardness) = (s.color, s.hardness);
    strokes.remove(si);
    for p in pieces {
        if p.len() >= 2 {
            strokes.push(vector::VectorStroke::fitted(p, color, hardness));
        }
    }
    bounds
}

// ---------------------------------------------------------------- selection

impl App {
    fn clip_to_selection(&self, mask: &mut [u8]) {
        if !self.selection.active {
            return;
        }
        for (m, s) in mask.iter_mut().zip(&self.selection.mask) {
            *m = ((*m as u32 * *s as u32 + 127) / 255) as u8;
        }
    }
    fn sel_len(&self) -> usize {
        (self.doc.width * self.doc.height) as usize
    }
    /// 新しい 選択を 今の 選択に 合わせる。mode: 0 新しく 1 足す 2 引く
    fn sel_combine(&mut self, new: Vec<u8>, mode: u32) {
        let n = self.sel_len();
        if mode == 0 || !self.selection.active {
            if mode == 2 {
                return;
            }
            self.selection.mask = new;
        } else {
            self.selection.mask.resize(n, 0);
            for (m, v) in self.selection.mask.iter_mut().zip(new) {
                *m = if mode == 1 { (*m).max(v) } else { ((*m as u32 * (255 - v as u32) + 127) / 255) as u8 };
            }
        }
        self.selection.active = self.selection.mask.iter().any(|&v| v != 0);
        if !self.selection.active {
            self.selection.mask.clear();
        }
    }
}

/// 囲って 選ぶ。mode: 0 新しく 1 足す 2 引く
#[unsafe(no_mangle)]
pub extern "C" fn sel_lasso(points_ptr: *const u8, count: u32, mode: u32) -> i32 {
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
        if pts.len() < 3 {
            return 0;
        }
        let mut sel = Selection::default();
        sel.polygon(app.doc.width, app.doc.height, &pts);
        app.sel_combine(sel.mask, mode);
        app.selection.active as i32
    })
}

/// 色で 選ぶ（自動選択）。all: 見えている 絵を 見る
#[unsafe(no_mangle)]
pub extern "C" fn sel_wand(x: f32, y: f32, tolerance: u32, all: u32, mode: u32) -> i32 {
    with_app(0, |app| {
        let (w, h) = (app.doc.width, app.doc.height);
        if x < 0.0 || y < 0.0 || x >= w as f32 || y >= h as f32 {
            return 0;
        }
        let pixels = app.fill_reference(all != 0);
        let mask = flood(&pixels, w, h, x as u32, y as u32, tolerance.min(255));
        app.sel_combine(mask, mode);
        app.selection.active as i32
    })
}

/// 0 すべて選択 1 選択解除 2 反転 3 広げる(n) 4 せばめる(n) 5 ぼかす(n) 6 今の レイヤーの 絵の ある ところ
#[unsafe(no_mangle)]
pub extern "C" fn sel_op(op: u32, n: u32) -> i32 {
    with_app(0, |app| {
        let (w, h) = (app.doc.width, app.doc.height);
        let len = app.sel_len();
        match op {
            0 => {
                app.selection.mask = vec![255; len];
                app.selection.active = true;
            }
            1 => app.selection.clear(),
            2 => {
                app.selection.invert(w, h);
                app.selection.active = app.selection.mask.iter().any(|&v| v != 0);
            }
            3 => app.selection.expand(w, h, n.clamp(1, 64)),
            4 => app.selection.shrink(w, h, n.clamp(1, 64)),
            5 => app.selection.feather(w, h, n.clamp(1, 64)),
            6 => {
                let l = &app.doc.layers[app.selected];
                let mut m = vec![0u8; len];
                for ((tx, ty), data) in l.pixels.tiles() {
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
                            m[(y * w + x) as usize] = data[((ly * TILE_SIZE + lx) * 4 + 3) as usize];
                        }
                    }
                }
                app.sel_combine(m, 0);
            }
            _ => return 0,
        }
        app.selection.active as i32
    })
}

#[unsafe(no_mangle)]
pub extern "C" fn sel_active() -> i32 {
    with_app(0, |app| app.selection.active as i32)
}

/// 選択範囲を 小さく した 絵（1画素 1バイト）。`out` に w,h(u32) + 中み。
#[unsafe(no_mangle)]
pub extern "C" fn sel_preview(max: u32) -> usize {
    with_app(0, |app| {
        if !app.selection.active {
            return 0;
        }
        let (w, h) = (app.doc.width, app.doc.height);
        let k = (max.max(16) as f32 / w.max(h) as f32).min(1.0);
        let (pw, ph) = (((w as f32 * k).ceil() as u32).max(1), ((h as f32 * k).ceil() as u32).max(1));
        let mut out = Vec::with_capacity((8 + pw * ph) as usize);
        out.extend_from_slice(&pw.to_le_bytes());
        out.extend_from_slice(&ph.to_le_bytes());
        for y in 0..ph {
            for x in 0..pw {
                let sx = ((x as f32 + 0.5) / k) as u32;
                let sy = ((y as f32 + 0.5) / k) as u32;
                out.push(app.selection.mask[(sy.min(h - 1) * w + sx.min(w - 1)) as usize]);
            }
        }
        set_out(out)
    })
}

/// 選択範囲で: 0 中を 消す 1 外を 消す 2 中を 今の 色で 塗る
#[unsafe(no_mangle)]
pub extern "C" fn sel_apply(op: u32) -> i32 {
    with_app(0, |app| {
        if !app.selection.active || !app.paintable(app.selected) {
            return 0;
        }
        let (w, h) = (app.doc.width, app.doc.height);
        let mask: Vec<u8> = if op == 1 { app.selection.mask.iter().map(|v| 255 - v).collect() } else { app.selection.mask.clone() };
        app.checkpoint();
        let bbox = mask_bbox(&mask, w, h);
        app.apply_mask(&mask, bbox, op != 2);
        1
    })
}

// ---------------------------------------------------------------- filters

/// フィルター。kind: 0 ぼかし(a=半径) 1 シャープ(a=強さ) 2 色相・彩度(a=色相 度, b=彩度 倍)
/// 3 明るさ・コントラスト(a, b は -1..1) 4 自動レベル補正 5 色の 反転 6 モノクロ
#[unsafe(no_mangle)]
pub extern "C" fn filter_apply(kind: u32, a: f32, b: f32) -> i32 {
    with_app(0, |app| {
        let i = app.selected;
        if !app.paintable(i) {
            return 0;
        }
        let (w, h) = (app.doc.width, app.doc.height);
        app.checkpoint();
        let before = app.doc.layers[i].pixels.clone();
        let layer = &mut app.doc.layers[i];
        match kind {
            0 => fast_blur(layer, w, h, a.clamp(1.0, 64.0)),
            1 => fast_sharpen(layer, w, h, a.clamp(0.0, 4.0)),
            2 => efude_canvas::hue_saturation(layer, a, b.clamp(0.0, 4.0)),
            3 => efude_canvas::color_adjust(layer, a.clamp(-1.0, 1.0), b.clamp(-1.0, 1.0), 1.0, 1.0),
            4 => efude_canvas::auto_levels(layer),
            5 | 6 => {
                for key in layer.pixels.tile_keys() {
                    let t = layer.pixels.tile_mut(key.0, key.1);
                    for px in t.chunks_exact_mut(4) {
                        if px[3] == 0 {
                            continue;
                        }
                        if kind == 5 {
                            for c in &mut px[..3] {
                                *c = 255 - *c;
                            }
                        } else {
                            let l = (0.299 * px[0] as f32 + 0.587 * px[1] as f32 + 0.114 * px[2] as f32).round() as u8;
                            px[..3].fill(l);
                        }
                    }
                }
            }
            _ => {}
        }
        // 選択範囲が あれば その 中だけ
        if app.selection.active {
            let sel = &app.selection.mask;
            let after = std::mem::replace(&mut app.doc.layers[i].pixels, before.clone());
            let mut keys: Vec<(u32, u32)> = after.tile_keys();
            keys.extend(before.tile_keys());
            keys.sort_unstable();
            keys.dedup();
            let px = &mut app.doc.layers[i].pixels;
            for (tx, ty) in keys {
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
                        let k = sel[(y * w + x) as usize] as f32 / 255.0;
                        if k <= 0.0 {
                            continue;
                        }
                        let (p0, p1) = (before.pixel(x, y), after.pixel(x, y));
                        let mix: [u8; 4] = std::array::from_fn(|c| (p0[c] as f32 + (p1[c] as f32 - p0[c] as f32) * k).round() as u8);
                        if mix != p0 {
                            px.set_pixel(x, y, mix);
                        }
                    }
                }
            }
        }
        app.doc.layers[i].pixels.prune_empty_tiles();
        let copy = app.doc.layers[i].clone();
        app.mark_layer(&copy);
        let beforel = Layer { pixels: before, ..copy };
        app.mark_layer(&beforel);
        1
    })
}

/// ぼかし（箱ぼかし 3回 ≒ ガウス）。絵の ある はんい だけ、乗算済みで 計算する。
fn fast_blur(layer: &mut Layer, w: u32, h: u32, radius: f32) {
    let keys = layer.pixels.tile_keys();
    if keys.is_empty() {
        return;
    }
    let r = (radius * 0.6).round().max(1.0) as i64;
    let pad = (r * 3 + 2) as u32;
    let x0 = (keys.iter().map(|k| k.0).min().unwrap() * TILE_SIZE).saturating_sub(pad);
    let y0 = (keys.iter().map(|k| k.1).min().unwrap() * TILE_SIZE).saturating_sub(pad);
    let x1 = ((keys.iter().map(|k| k.0).max().unwrap() + 1) * TILE_SIZE + pad).min(w);
    let y1 = ((keys.iter().map(|k| k.1).max().unwrap() + 1) * TILE_SIZE + pad).min(h);
    let (bw, bh) = ((x1 - x0) as usize, (y1 - y0) as usize);
    let mut buf = vec![0f32; bw * bh * 4];
    for ((tx, ty), data) in layer.pixels.tiles() {
        for ly in 0..TILE_SIZE {
            let y = ty * TILE_SIZE + ly;
            if y < y0 || y >= y1 {
                continue;
            }
            for lx in 0..TILE_SIZE {
                let x = tx * TILE_SIZE + lx;
                if x < x0 || x >= x1 {
                    continue;
                }
                let s = ((ly * TILE_SIZE + lx) * 4) as usize;
                let al = data[s + 3] as f32 / 255.0;
                if al == 0.0 {
                    continue;
                }
                let d = (((y - y0) as usize) * bw + (x - x0) as usize) * 4;
                buf[d] = data[s] as f32 * al;
                buf[d + 1] = data[s + 1] as f32 * al;
                buf[d + 2] = data[s + 2] as f32 * al;
                buf[d + 3] = al;
            }
        }
    }
    let mut tmp = vec![0f32; buf.len()];
    let n = (2 * r + 1) as f32;
    for _ in 0..3 {
        // よこ
        for y in 0..bh {
            let row = y * bw * 4;
            let mut acc = [0f32; 4];
            for x in -r..=r {
                let xi = x.clamp(0, bw as i64 - 1) as usize;
                for c in 0..4 {
                    acc[c] += buf[row + xi * 4 + c];
                }
            }
            for x in 0..bw as i64 {
                for c in 0..4 {
                    tmp[row + x as usize * 4 + c] = acc[c] / n;
                }
                let add = (x + r + 1).clamp(0, bw as i64 - 1) as usize;
                let sub = (x - r).clamp(0, bw as i64 - 1) as usize;
                for c in 0..4 {
                    acc[c] += buf[row + add * 4 + c] - buf[row + sub * 4 + c];
                }
            }
        }
        // たて
        for x in 0..bw {
            let mut acc = [0f32; 4];
            for y in -r..=r {
                let yi = y.clamp(0, bh as i64 - 1) as usize;
                for c in 0..4 {
                    acc[c] += tmp[(yi * bw + x) * 4 + c];
                }
            }
            for y in 0..bh as i64 {
                for c in 0..4 {
                    buf[(y as usize * bw + x) * 4 + c] = acc[c] / n;
                }
                let add = (y + r + 1).clamp(0, bh as i64 - 1) as usize;
                let sub = (y - r).clamp(0, bh as i64 - 1) as usize;
                for c in 0..4 {
                    acc[c] += tmp[(add * bw + x) * 4 + c] - tmp[(sub * bw + x) * 4 + c];
                }
            }
        }
    }
    for y in 0..bh {
        for x in 0..bw {
            let d = (y * bw + x) * 4;
            let al = buf[d + 3];
            let (px, py) = (x0 + x as u32, y0 + y as u32);
            if al < 0.5 / 255.0 {
                if layer.pixels.tile_data(px / TILE_SIZE, py / TILE_SIZE).is_some() {
                    layer.pixels.set_pixel(px, py, [0, 0, 0, 0]);
                }
                continue;
            }
            let v = |c: usize| (buf[d + c] / al).round().clamp(0.0, 255.0) as u8;
            layer.pixels.set_pixel(px, py, [v(0), v(1), v(2), (al * 255.0).round().clamp(0.0, 255.0) as u8]);
        }
    }
}

/// シャープ（ぼかした 絵との 差を 足す）。
fn fast_sharpen(layer: &mut Layer, w: u32, h: u32, amount: f32) {
    let mut soft = layer.clone();
    fast_blur(&mut soft, w, h, 2.0);
    for key in layer.pixels.tile_keys() {
        let Some(b) = soft.pixels.tile_data(key.0, key.1).map(|d| d.to_vec()) else {
            continue;
        };
        let t = layer.pixels.tile_mut(key.0, key.1);
        for (px, bl) in t.chunks_exact_mut(4).zip(b.chunks_exact(4)) {
            if px[3] == 0 {
                continue;
            }
            for c in 0..3 {
                let v = px[c] as f32 + amount * (px[c] as f32 - bl[c] as f32);
                px[c] = v.round().clamp(0.0, 255.0) as u8;
            }
        }
    }
}

/// フォルダーを 足す（今の レイヤーの 上）。
#[unsafe(no_mangle)]
pub extern "C" fn layer_add_folder() {
    with_app((), |app| {
        app.checkpoint();
        let mut n = 1;
        let name = loop {
            let name = format!("フォルダー {n}");
            if !app.doc.layers.iter().any(|l| l.name == name) {
                break name;
            }
            n += 1;
        };
        let mut layer = blank_layer(app, &name);
        layer.kind = LayerKind::Folder;
        layer.parent_id = app.doc.layers.get(app.selected).and_then(|l| l.parent_id);
        let id = layer.id;
        let at = (app.selected + 1).min(app.doc.layers.len());
        app.doc.layers.insert(at, layer);
        efude_canvas::tidy_layer_order(&mut app.doc.layers);
        app.selected = app.doc.layers.iter().position(|l| l.id == id).unwrap_or(0);
    })
}

/// レイヤーを 動かす。place: 0 target の 上 / 1 下 / 2 フォルダーの 中
#[unsafe(no_mangle)]
pub extern "C" fn layer_place(index: u32, target: u32, place: u32) -> i32 {
    with_app(0, |app| {
        let (i, t) = (index as usize, target as usize);
        if i >= app.doc.layers.len() || t >= app.doc.layers.len() || i == t {
            return 0;
        }
        let (id, tid) = (app.doc.layers[i].id, app.doc.layers[t].id);
        let placement = match place {
            0 => efude_canvas::LayerPlacement::Above,
            1 => efude_canvas::LayerPlacement::Below,
            _ => efude_canvas::LayerPlacement::Into,
        };
        let before = app.doc.layers.clone();
        let snapshot = Snapshot { layers: before.clone(), selected: app.selected };
        let mut h = History::default();
        if !h.place_layer(&mut app.doc.layers, id, tid, placement) {
            return 0;
        }
        app.undo.push(snapshot);
        if app.undo.len() > UNDO_LIMIT {
            app.undo.remove(0);
        }
        app.redo.clear();
        app.selected = app.doc.layers.iter().position(|l| l.id == id).unwrap_or(0);
        app.mark_diff(&before);
        1
    })
}

impl App {
    /// 透明度保護の レイヤーなら、色の ある ところ（× 選択範囲）を かえす。
    fn alpha_mask_for(&self, index: usize) -> Option<Vec<u8>> {
        let l = self.doc.layers.get(index)?;
        if !self.alpha_locked.contains(&l.id) || l.vector.is_some() {
            return None;
        }
        let (w, h) = (self.doc.width, self.doc.height);
        let mut m = vec![0u8; (w * h) as usize];
        for ((tx, ty), data) in l.pixels.tiles() {
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
                    m[(y * w + x) as usize] = data[((ly * TILE_SIZE + lx) * 4 + 3) as usize];
                }
            }
        }
        self.clip_to_selection(&mut m);
        Some(m)
    }
}

/// 対称定規で ふえる 点（はじめの 1つは もとの 点）。
fn symmetric(p: InkPoint, (mode, n, c): (u32, u32, [f32; 2])) -> Vec<InkPoint> {
    let mut out = vec![p];
    let (x, y) = (p.position.x, p.position.y);
    let at = |nx: f32, ny: f32| {
        let mut q = p;
        q.position = glam::Vec2::new(nx, ny);
        q
    };
    match mode {
        1 => out.push(at(2.0 * c[0] - x, y)),
        2 => out.push(at(x, 2.0 * c[1] - y)),
        3 => {
            out.push(at(2.0 * c[0] - x, y));
            out.push(at(x, 2.0 * c[1] - y));
            out.push(at(2.0 * c[0] - x, 2.0 * c[1] - y));
        }
        4 | 5 => {
            let n = n.clamp(2, 32);
            let (dx, dy) = (x - c[0], y - c[1]);
            for k in 1..n {
                let a = std::f32::consts::TAU * k as f32 / n as f32;
                let (s, co) = a.sin_cos();
                out.push(at(c[0] + dx * co - dy * s, c[1] + dx * s + dy * co));
            }
            if mode == 5 {
                // 万華鏡: さらに 鏡に うつす
                let m: Vec<InkPoint> = out.iter().map(|q| {
                    let (qx, qy) = (q.position.x - c[0], q.position.y - c[1]);
                    at(c[0] - qx, c[1] + qy)
                }).collect();
                out.extend(m);
            }
        }
        _ => {}
    }
    out
}

/// 対称定規を きめる。mode: 0 なし 1 左右 2 上下 3 上下左右 4 放射 5 万華鏡
#[unsafe(no_mangle)]
pub extern "C" fn set_symmetry(mode: u32, n: u32, cx: f32, cy: f32) {
    with_app((), |app| {
        app.sym_mode = mode.min(5);
        app.sym_n = n.clamp(2, 32);
        app.sym_center = [cx, cy];
    })
}
