#pragma once

// Pinokio - face analysis.
//
// The plugin is documented to take a head-only image on a transparent
// background, which is exactly the case where the alpha channel already says
// a great deal: the silhouette gives the head's centre, its size and its tilt,
// and the left/right imbalance of the ink gives a first guess at how far the
// head is already turned.
//
// The result is written straight into the effect's parameters, so every value
// stays editable by hand afterwards - the yaw guess in particular is rough and
// is meant to be corrected.
//
// No After Effects types here either: the caller hands in a plain alpha
// bitmap, so this can be tested on its own.

#include <cmath>
#include <vector>

namespace pinokio {

struct AlphaMap {
    const float* a = nullptr;   // 0..1, row major
    int width  = 0;
    int height = 0;

    float at(int x, int y) const { return a[size_t(y) * width + x]; }
};

struct FaceGuess {
    bool   found   = false;
    double centerX = 0.0;   // pixels, in the alpha map's own coordinates
    double centerY = 0.0;
    double radius  = 0.0;
    double yaw     = 0.0;   // radians, pose of the drawing
    double pitch   = 0.0;
    double roll    = 0.0;
};

// `threshold` is the alpha above which a pixel counts as part of the drawing.
inline FaceGuess analyzeFace(const AlphaMap& map, float threshold = 0.25f) {
    FaceGuess out;
    if (!map.a || map.width <= 0 || map.height <= 0) return out;

    // --- silhouette bounds, and the left/right extent of every row ----------
    std::vector<int> rowL(map.height, -1), rowR(map.height, -1);
    int top = -1, bottom = -1;
    double totalW = 0.0;

    for (int y = 0; y < map.height; ++y) {
        int l = -1, r = -1;
        for (int x = 0; x < map.width; ++x) {
            if (map.at(x, y) >= threshold) { if (l < 0) l = x; r = x; }
        }
        rowL[y] = l; rowR[y] = r;
        if (l >= 0) { if (top < 0) top = y; bottom = y; totalW += double(r - l + 1); }
    }
    if (top < 0) return out;                       // nothing but transparency

    const int headH = bottom - top + 1;
    if (headH < 16) return out;                    // far too small to read

    // --- head width: the widest run of rows, not a single lucky row --------
    // A stray hair strand can make one row very wide, so smooth over a band.
    const int band = headH / 20 + 1;
    int   widestY = top;
    double widest = 0.0;
    for (int y = top; y <= bottom; ++y) {
        double sum = 0.0; int n = 0;
        for (int k = -band; k <= band; ++k) {
            const int yy = y + k;
            if (yy < top || yy > bottom || rowL[yy] < 0) continue;
            sum += double(rowR[yy] - rowL[yy] + 1); ++n;
        }
        if (n == 0) continue;
        const double w = sum / n;
        if (w > widest) { widest = w; widestY = y; }
    }

    // The widest part of a head is the cheek / ear line, which sits close to
    // the eyes. That is the height we want the rotation centre at.
    out.centerY = double(widestY);
    out.radius  = widest * 0.5 * 0.95;
    if (out.radius < 1.0) return out;

    // --- horizontal centre, read around that same line ---------------------
    {
        double sum = 0.0; int n = 0;
        const int half = headH / 8 + 1;
        for (int y = widestY - half; y <= widestY + half; ++y) {
            if (y < top || y > bottom || rowL[y] < 0) continue;
            sum += 0.5 * double(rowL[y] + rowR[y]); ++n;
        }
        out.centerX = n ? sum / n : 0.5 * double(rowL[widestY] + rowR[widestY]);
    }

    // --- tilt, from the second moments of the silhouette -------------------
    {
        double m = 0.0, mx = 0.0, my = 0.0;
        for (int y = top; y <= bottom; ++y) {
            if (rowL[y] < 0) continue;
            for (int x = rowL[y]; x <= rowR[y]; ++x) {
                const double w = map.at(x, y);
                if (w < threshold) continue;
                m += w; mx += w * x; my += w * y;
            }
        }
        if (m > 0.0) {
            const double cx = mx / m, cy = my / m;
            double sxx = 0.0, syy = 0.0, sxy = 0.0;
            for (int y = top; y <= bottom; ++y) {
                if (rowL[y] < 0) continue;
                for (int x = rowL[y]; x <= rowR[y]; ++x) {
                    const double w = map.at(x, y);
                    if (w < threshold) continue;
                    const double dx = x - cx, dy = y - cy;
                    sxx += w * dx * dx; syy += w * dy * dy; sxy += w * dx * dy;
                }
            }
            // Angle of the long axis, measured away from vertical.
            const double axis = 0.5 * std::atan2(2.0 * sxy, sxx - syy);
            double roll = axis + 3.14159265358979323846 * 0.5;
            while (roll >  3.14159265358979323846 * 0.5) roll -= 3.14159265358979323846;
            while (roll < -3.14159265358979323846 * 0.5) roll += 3.14159265358979323846;
            // A head is only a little taller than wide, so the long axis is a
            // weak signal. Trust it partly, and never past the supported range.
            roll *= 0.6;
            const double kMaxRoll = 15.0 * 3.14159265358979323846 / 180.0;
            if (roll >  kMaxRoll) roll =  kMaxRoll;
            if (roll < -kMaxRoll) roll = -kMaxRoll;
            out.roll = roll;
        }
    }

    // --- how far the head is already turned --------------------------------
    // Seen from the front, the chin sits directly below the widest part of the
    // skull. As the head turns, the chin swings towards the side being turned
    // to while the skull stays put, so the offset between the two is a first
    // guess at the pose. It is a weak signal and is meant to be corrected by
    // hand afterwards.
    {
        double sum = 0.0; int n = 0;
        const int from = bottom - headH / 6;
        for (int y = from; y <= bottom; ++y) {
            if (y < top || rowL[y] < 0) continue;
            sum += 0.5 * double(rowL[y] + rowR[y]); ++n;
        }
        if (n) {
            const double chinX = sum / n;
            double t = (chinX - out.centerX) / out.radius;
            t *= 1.5;                              // the offset is small
            if (t >  1.0) t =  1.0;
            if (t < -1.0) t = -1.0;
            const double kMaxYaw = 20.0 * 3.14159265358979323846 / 180.0;
            out.yaw = t * kMaxYaw;
        }
    }

    // Pitch leaves no reliable trace in a silhouette, so it starts at zero and
    // is left to the user.
    out.pitch = 0.0;
    out.found = true;
    return out;
}

} // namespace pinokio
