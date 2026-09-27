/* 描画エンジン（engine.wasm）との つなぎ。
   engine.wasm は Efude の エンジンを WebAssembly に した もの。つくりかたは engine/build.sh。 */

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function loadEngine(url) {
  let inst;
  try {
    const res = await fetch(url);
    if (WebAssembly.instantiateStreaming && (res.headers.get('content-type') || '').includes('wasm')) {
      inst = (await WebAssembly.instantiateStreaming(res, {})).instance;
    } else {
      inst = (await WebAssembly.instantiate(await res.arrayBuffer(), {})).instance;
    }
  } catch (err) {
    throw new Error('エンジンを 読みこめませんでした: ' + err.message);
  }
  return new Engine(inst.exports);
}

class Engine {
  constructor(x) { this.x = x; }

  get mem() { return this.x.memory.buffer; }
  out() { return new Uint8Array(this.mem, this.x.out_ptr(), this.x.out_len()); }
  outCopy() { return this.out().slice(); }
  outText() { return dec.decode(this.out()); }
  outJson() { return JSON.parse(this.outText()); }

  /* バイト列を wasm の 中に うつして fn(ptr, len) を よぶ */
  withBytes(bytes, fn) {
    const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const ptr = this.x.alloc(u8.length);
    new Uint8Array(this.mem, ptr, u8.length).set(u8);
    try { return fn(ptr, u8.length); } finally { this.x.dealloc(ptr, u8.length); }
  }
  withText(text, fn) { return this.withBytes(enc.encode(text), fn); }

  /* ---- 紙 ---- */
  newDoc(w, h, dpi, paper) { return this.x.doc_new(w, h, dpi, paper ? 1 : 0) === 0; }
  info() { this.x.doc_info(); return this.outJson(); }
  loadEfude(bytes) { const r = this.withBytes(bytes, (p, n) => this.x.doc_load_efude(p, n)); if (r !== 0) throw new Error(this.outText()); }
  loadPsd(bytes) { const r = this.withBytes(bytes, (p, n) => this.x.doc_load_psd(p, n)); if (r !== 0) throw new Error(this.outText()); }
  loadQuick(bytes) { return this.withBytes(bytes, (p, n) => this.x.doc_load_quick(p, n)) === 0; }
  saveQuick() { this.x.doc_save_quick(); return this.outCopy(); }
  saveEfude() { const n = this.x.doc_save_efude(); if (n < 0) throw new Error(this.outText()); return this.outCopy(); }
  exportPsd() { const n = this.x.doc_export_psd(); if (n < 0) throw new Error(this.outText()); return this.outCopy(); }
  exportRgba(transparent) { this.x.doc_export_rgba(transparent ? 1 : 0); return this.outCopy(); }
  transform(mode) { return this.x.doc_transform(mode) === 1; }

  /* ---- 画面 ---- */
  renderDirty(max) { this.x.render_dirty(max); return this.out(); }
  dirtyCount() { return this.x.dirty_count(); }

  /* ---- ブラシ ---- */
  brushList() { this.x.brush_list(); return this.outJson(); }
  brushSelect(i) { this.x.brush_select(i); }
  brushGet(i) { this.x.brush_get(i); return this.outJson(); }
  brushSet(i, key, v) { this.withText(key, (p, n) => this.x.brush_set(i, p, n, v)); }
  brushPreview(i, w, h, rgb) { const n = this.x.brush_preview(i, w, h, rgb[0], rgb[1], rgb[2]); return n ? this.outCopy() : null; }
  brushesLoadSet(bytes, replace) { const r = this.withBytes(bytes, (p, n) => this.x.brushes_load_set(p, n, replace ? 1 : 0)); if (r < 0) throw new Error(this.outText()); return r; }
  brushesSaveSet() { const n = this.x.brushes_save_set(); if (n < 0) throw new Error(this.outText()); return this.outCopy(); }
  brushesReset() { this.x.brushes_reset(); }
  brushRemove(i) { this.x.brush_remove(i); }
  brushDuplicate(i) { this.x.brush_duplicate(i); }
  brushRename(i, name) { this.withText(name, (p, n) => this.x.brush_rename(i, p, n)); }
  brushMove(from, to) { this.x.brush_move(from, to); }

  setColor(r, g, b, a) { this.x.set_color(r, g, b, a); }
  setViewScale(s) { this.x.set_view_scale(s); }
  setPressureGamma(g) { this.x.set_pressure_gamma(g); }
  pick(x, y, layerOnly) { const v = this.x.pick_color(x, y, layerOnly ? 1 : 0) >>> 0; return [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]; }

  /* ---- 線 ---- */
  strokeBegin(x, y) { return this.x.stroke_begin(x, y) === 1; }
  strokePush(x, y, p, tx, ty, tw, t) { this.x.stroke_push(x, y, p, tx, ty, tw, t); }
  strokeFlush() { this.x.stroke_flush(); }
  strokeEnd() { this.x.stroke_end(); }
  strokeCancel() { this.x.stroke_cancel(); }
  stroking() { return this.x.stroke_active() === 1; }

  undo() { return this.x.undo() === 1; }
  redo() { return this.x.redo() === 1; }
  checkpoint() { this.x.checkpoint(); }
  historyClear() { this.x.history_clear(); }

  /* ---- レイヤー ---- */
  layerAdd() { this.x.layer_add(); }
  layerAddFolder() { this.x.layer_add_folder(); }
  layerPlace(i, t, place) { return this.x.layer_place(i, t, place) === 1; }
  layerAddVector() { this.x.layer_add_vector(); }
  layerRasterize(i) { this.x.layer_rasterize(i); }
  vectorWidth(x, y, r, f) { return this.x.vector_width(x, y, r, f) === 1; }
  vectorErase(x, y, r, mode) { return this.x.vector_erase(x, y, r, mode) === 1; }
  selLasso(points, mode) {
    const f = new Float32Array(points.length * 2);
    points.forEach((p, i) => { f[i * 2] = p[0]; f[i * 2 + 1] = p[1]; });
    return this.withBytes(new Uint8Array(f.buffer), (p) => this.x.sel_lasso(p, points.length, mode)) === 1;
  }
  selWand(x, y, tol, all, mode) { return this.x.sel_wand(x, y, tol, all ? 1 : 0, mode) === 1; }
  selOp(op, n = 0) { return this.x.sel_op(op, n) === 1; }
  selActive() { return this.x.sel_active() === 1; }
  selPreview(max) { const n = this.x.sel_preview(max); return n ? this.outCopy() : null; }
  selApply(op) { return this.x.sel_apply(op) === 1; }
  filterApply(kind, a = 0, b = 0) { return this.x.filter_apply(kind, a, b) === 1; }
  setSymmetry(mode, n, cx, cy) { this.x.set_symmetry(mode, n, cx, cy); }
  dotLine(x0, y0, x1, y1, cell, size, shape, mode, dither) { return this.x.dot_line(x0, y0, x1, y1, cell, size, shape, mode, dither) === 1; }
  setVectorWhole(on) { this.x.set_vector_whole(on ? 1 : 0); }
  layerSelect(i) { this.x.layer_select(i); }
  layerDelete(i) { this.x.layer_delete(i); }
  layerDuplicate(i) { this.x.layer_duplicate(i); }
  layerMove(i, dir) { return this.x.layer_move(i, dir) === 1; }
  layerMergeDown(i) { return this.x.layer_merge_down(i) === 1; }
  layerClear(i) { this.x.layer_clear(i); }
  layerSet(i, key, v) { this.withText(key, (p, n) => this.x.layer_set(i, p, n, v)); }
  layerRename(i, name) { this.withText(name, (p, n) => this.x.layer_rename(i, p, n)); }
  layerThumb(i, w, h) { const n = this.x.layer_thumb(i, w, h); return n ? this.outCopy() : null; }
  layerFromRgba(rgba, w, h, x, y, name) {
    const nameBytes = enc.encode(name || '');
    const np = this.x.alloc(nameBytes.length);
    new Uint8Array(this.mem, np, nameBytes.length).set(nameBytes);
    try { this.withBytes(rgba, (p) => this.x.layer_from_rgba(p, w, h, x, y, np, nameBytes.length)); }
    finally { this.x.dealloc(np, nameBytes.length); }
  }

  /* ---- 塗る ---- */
  fill(x, y, tol, all, grow) { return this.x.fill_at(x, y, tol, all ? 1 : 0, grow) === 1; }
  floatBegin(points) {
    const f = new Float32Array(points.length * 2);
    points.forEach((p, i) => { f[i * 2] = p[0]; f[i * 2 + 1] = p[1]; });
    const ok = this.withBytes(new Uint8Array(f.buffer), (p) => this.x.float_begin(p, points.length)) === 1;
    return ok ? this.outJson() : null;
  }
  floatRgba() { const n = this.x.float_rgba(); return n ? this.outCopy() : null; }
  floatCommit(m) { return this.x.float_commit(m[0], m[1], m[2], m[3], m[4], m[5]) === 1; }
  floatCancel() { this.x.float_cancel(); }
  lasso(points, erase) {
    const f = new Float32Array(points.length * 2);
    points.forEach((p, i) => { f[i * 2] = p[0]; f[i * 2 + 1] = p[1]; });
    return this.withBytes(new Uint8Array(f.buffer), (p) => this.x.lasso(p, points.length, erase ? 1 : 0)) === 1;
  }
}
