use oekaki_engine::*;
fn dark() -> usize {
    doc_export_rgba(0);
    let n = out_len();
    let p = unsafe { std::slice::from_raw_parts(out_ptr(), n) };
    p.chunks(4).filter(|c| c[0] < 128).count()
}
#[test]
fn whole_erase() {
    doc_new(800, 600, 350.0, 1);
    layer_add_vector();
    brush_select(0);
    stroke_begin(50.0, 300.0);
    for i in 0..=100 { stroke_push(50.0 + i as f32 * 7.0, 300.0, 0.8, 0.0, 0.0, 0.0, i as f64 * 5.0); }
    stroke_end();
    let a = dark();
    set_vector_whole(1);
    brush_select(7);
    stroke_begin(200.0, 250.0);
    for i in 0..=30 { stroke_push(200.0, 250.0 + i as f32 * 4.0, 1.0, 0.0, 0.0, 0.0, i as f64 * 5.0); }
    stroke_end();
    let b = dark();
    println!("{a} -> {b}");
    assert!(b < a);
}

#[test]
fn width() {
    doc_new(800, 600, 350.0, 1);
    layer_add_vector();
    brush_select(0);
    stroke_begin(50.0, 300.0);
    for i in 0..=100 { stroke_push(50.0 + i as f32 * 7.0, 300.0, 0.8, 0.0, 0.0, 0.0, i as f64 * 5.0); }
    stroke_end();
    let a = dark();
    checkpoint();
    vector_width(0.0, 0.0, 0.0, 2.0);
    let b = dark();
    vector_width(0.0, 0.0, 0.0, 0.25);
    let c = dark();
    println!("{a} {b} {c}");
    assert!(b > a && c < a);
}

#[test]
fn cross_erase() {
    doc_new(800, 600, 350.0, 1);
    layer_add_vector();
    brush_select(0);
    let line = |x0: f32, y0: f32, x1: f32, y1: f32| {
        stroke_begin(x0, y0);
        for i in 0..=100 { let t = i as f32 / 100.0; stroke_push(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, 0.8, 0.0, 0.0, 0.0, i as f64 * 5.0); }
        stroke_end();
    };
    line(50.0, 300.0, 750.0, 300.0);
    line(300.0, 100.0, 300.0, 500.0);
    line(500.0, 100.0, 500.0, 500.0);
    let a = dark();
    checkpoint();
    assert_eq!(vector_erase(400.0, 300.0, 6.0, 1), 1);
    let b = dark();
    println!("cross {a} -> {b}");
    assert!(a - b > 1500 && a - b < 3000);
}

#[test]
fn mask_paint() {
    doc_new(800, 600, 350.0, 0);
    brush_select(0);
    stroke_begin(50.0, 300.0);
    for i in 0..=100 { stroke_push(50.0 + i as f32 * 7.0, 300.0, 0.9, 0.0, 0.0, 0.0, i as f64 * 5.0); }
    stroke_end();
    let a = dark_t();
    assert_eq!(mask_create(0), 1);
    brush_select(7); // 消しゴム = かくす
    stroke_begin(400.0, 200.0);
    for i in 0..=50 { stroke_push(400.0, 200.0 + i as f32 * 4.0, 1.0, 0.0, 0.0, 0.0, i as f64 * 5.0); }
    stroke_end();
    let b = dark_t();
    mask_op(2); // オフ
    let c = dark_t();
    mask_op(2);
    mask_op(1); // 適用
    let d = dark_t();
    println!("mask {a} {b} {c} {d}");
    assert!(b < a && c == a && d == b);
}
fn dark_t() -> usize {
    doc_export_rgba(1);
    let n = out_len();
    let p = unsafe { std::slice::from_raw_parts(out_ptr(), n) };
    p.chunks(4).filter(|c| c[3] > 128).count()
}

#[test]
fn multi_layers() {
    doc_new(400, 300, 350.0, 1);
    layer_add(); layer_add(); layer_add();
    doc_info();
    let info: serde_json::Value = serde_json::from_slice(unsafe { std::slice::from_raw_parts(out_ptr(), out_len()) }).unwrap();
    let ids: Vec<u32> = info["layers"].as_array().unwrap().iter().skip(2).map(|l| l["id"].as_u64().unwrap() as u32).collect();
    let bytes: Vec<u8> = ids.iter().flat_map(|i| i.to_le_bytes()).collect();
    assert_eq!(layers_group(bytes.as_ptr(), ids.len() as u32), 1);
    doc_info();
    let info: serde_json::Value = serde_json::from_slice(unsafe { std::slice::from_raw_parts(out_ptr(), out_len()) }).unwrap();
    let names: Vec<String> = info["layers"].as_array().unwrap().iter().map(|l| format!("{}@{}", l["name"].as_str().unwrap(), l["parent"])).collect();
    println!("group {:?}", names);
    assert_eq!(layers_merge(bytes.as_ptr(), ids.len() as u32), 1);
    assert!(layers_delete(bytes.as_ptr(), 1) >= 1);
}

#[test]
fn quick_keeps_vector() {
    doc_new(800, 600, 350.0, 1);
    layer_add_vector();
    brush_select(0);
    stroke_begin(50.0, 300.0);
    for i in 0..=100 { stroke_push(50.0 + i as f32 * 7.0, 300.0, 0.8, 0.0, 0.0, 0.0, i as f64 * 5.0); }
    stroke_end();
    let a = dark();
    doc_save_quick();
    let bytes = unsafe { std::slice::from_raw_parts(out_ptr(), out_len()) }.to_vec();
    doc_new(100, 100, 350.0, 1);
    assert_eq!(doc_load_quick(bytes.as_ptr(), bytes.len()), 0);
    assert_eq!(dark(), a);
    assert_eq!(vector_width_stroke(300.0, 300.0, 20.0, 2.0), 1);
    assert!(dark() > a);
}
