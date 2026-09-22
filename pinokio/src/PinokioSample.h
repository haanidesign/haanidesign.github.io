#pragma once

// Pinokio - pixel fetching.
//
// Only the pixel structs and the few fields of an effect world are used here
// (data, rowbytes, width, height, origin_x, origin_y), and the world type is a
// template parameter, so this file builds and can be tested without After
// Effects while staying the code the plugin actually runs.

#include <algorithm>
#include <cmath>

#include "PinokioWarp.h"

namespace pinokio {

// ---------------------------------------------------------------------------
// coordinates
//
// An effect world records where the layer origin sits inside its own buffer,
// so a world pixel and a layer pixel differ by that offset. Both directions go
// through these: if a render ever comes out shifted by exactly the amount the
// buffer was expanded, the sign here is the first thing to look at.
// ---------------------------------------------------------------------------
template <class World> inline double WorldToLayerX(const World& w, double x) { return x - w.origin_x; }
template <class World> inline double WorldToLayerY(const World& w, double y) { return y - w.origin_y; }
template <class World> inline double LayerToWorldX(const World& w, double x) { return x + w.origin_x; }
template <class World> inline double LayerToWorldY(const World& w, double y) { return y + w.origin_y; }

// ---------------------------------------------------------------------------
// pixels
// ---------------------------------------------------------------------------
template <typename P> struct PixTraits;

template <> struct PixTraits<PF_Pixel8> {
    static void zero(PF_Pixel8& p) { p.alpha = p.red = p.green = p.blue = 0; }
    static void store(PF_Pixel8& p, double a, double r, double g, double b) {
        p.alpha = A_u_char(std::min(255.0, std::max(0.0, a + 0.5)));
        p.red   = A_u_char(std::min(255.0, std::max(0.0, r + 0.5)));
        p.green = A_u_char(std::min(255.0, std::max(0.0, g + 0.5)));
        p.blue  = A_u_char(std::min(255.0, std::max(0.0, b + 0.5)));
    }
};
template <> struct PixTraits<PF_Pixel16> {
    static void zero(PF_Pixel16& p) { p.alpha = p.red = p.green = p.blue = 0; }
    static void store(PF_Pixel16& p, double a, double r, double g, double b) {
        p.alpha = A_u_short(std::min(32768.0, std::max(0.0, a + 0.5)));
        p.red   = A_u_short(std::min(32768.0, std::max(0.0, r + 0.5)));
        p.green = A_u_short(std::min(32768.0, std::max(0.0, g + 0.5)));
        p.blue  = A_u_short(std::min(32768.0, std::max(0.0, b + 0.5)));
    }
};
template <> struct PixTraits<PF_PixelFloat> {
    static void zero(PF_PixelFloat& p) { p.alpha = p.red = p.green = p.blue = 0.f; }
    // 32 bpc is not clamped: values above 1.0 are legal and must survive.
    static void store(PF_PixelFloat& p, double a, double r, double g, double b) {
        p.alpha = float(a); p.red = float(r); p.green = float(g); p.blue = float(b);
    }
};

template <typename P, class World>
inline P* RowOf(const World& w, int y) {
    return reinterpret_cast<P*>(reinterpret_cast<char*>(w.data) + size_t(y) * size_t(w.rowbytes));
}

template <typename P, class World>
inline const P* ConstRowOf(const World& w, int y) {
    return reinterpret_cast<const P*>(reinterpret_cast<const char*>(w.data) + size_t(y) * size_t(w.rowbytes));
}

// Reads transparent black outside the world, so a head can be pushed past the
// edge of its own source without smearing the border pixels outwards.
template <typename P, class World>
inline void SampleBilinear(const World& src, double x, double y, P& out) {
    const int W = src.width, H = src.height;
    const int x0 = int(std::floor(x)), y0 = int(std::floor(y));
    if (x0 < -1 || y0 < -1 || x0 > W - 1 || y0 > H - 1) { PixTraits<P>::zero(out); return; }

    const double fx = x - x0, fy = y - y0;
    double a = 0, r = 0, g = 0, b = 0;

    for (int j = 0; j < 2; ++j) {
        const int yy = y0 + j;
        if (yy < 0 || yy >= H) continue;
        const P* row = ConstRowOf<P, World>(src, yy);
        const double wy = j ? fy : (1.0 - fy);
        if (wy <= 0.0) continue;
        for (int i = 0; i < 2; ++i) {
            const int xx = x0 + i;
            if (xx < 0 || xx >= W) continue;
            const double w = wy * (i ? fx : (1.0 - fx));
            if (w <= 0.0) continue;
            const P& p = row[xx];
            a += w * p.alpha; r += w * p.red; g += w * p.green; b += w * p.blue;
        }
    }
    PixTraits<P>::store(out, a, r, g, b);
}

// Fills one output pixel. Pixel centres sit at +0.5, which is what keeps an
// untouched rig a byte-for-byte copy instead of a half-pixel blur.
template <typename P, class World>
inline void WarpOnePixel(const WarpState& state, const World& src, const World& dst,
                         int x, int y, P& out) {
    const double lx = WorldToLayerX(dst, double(x) + 0.5);
    const double ly = WorldToLayerY(dst, double(y) + 0.5);
    const Vec2 s = state.sourceOf(lx, ly);
    SampleBilinear<P, World>(src,
                             LayerToWorldX(src, s.x) - 0.5,
                             LayerToWorldY(src, s.y) - 0.5,
                             out);
}

} // namespace pinokio
