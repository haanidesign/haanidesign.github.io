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
