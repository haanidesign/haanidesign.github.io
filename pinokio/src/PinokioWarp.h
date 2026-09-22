#pragma once

// Pinokio - head warp math.
//
// The head is modelled as a flattened sphere (an ellipsoid whose depth is
// controlled by kDepth). A pixel of the *output* is un-projected onto that
// sphere, rotated back by the inverse of the requested head rotation, and
// projected again. The resulting point is where the pixel must be sampled
// from in the source illustration.
//
// Roll (tilt) is exact for a flat illustration, so it is handled as a plain
// 2D rotation around the face centre and applied before the sphere step.
//
// Everything here is pure math: no After Effects types, so it can be unit
// tested on its own.

#include <cmath>

namespace pinokio {

struct Vec2 { double x, y; };
struct Vec3 { double x, y, z; };

// Row-major 3x3.
struct Mat3 {
    double m[9];

    static Mat3 identity() {
        Mat3 r; r.m[0]=1; r.m[1]=0; r.m[2]=0;
                r.m[3]=0; r.m[4]=1; r.m[5]=0;
                r.m[6]=0; r.m[7]=0; r.m[8]=1;
        return r;
    }

    // Rotation around Y: turns the head left / right (yaw).
    static Mat3 rotY(double a) {
        const double c = std::cos(a), s = std::sin(a);
        Mat3 r; r.m[0]= c; r.m[1]=0; r.m[2]= s;
                r.m[3]= 0; r.m[4]=1; r.m[5]= 0;
                r.m[6]=-s; r.m[7]=0; r.m[8]= c;
        return r;
    }

    // Rotation around X: nods the head up / down (pitch).
    // Screen Y points down, so a positive angle looks down.
    static Mat3 rotX(double a) {
        const double c = std::cos(a), s = std::sin(a);
        Mat3 r; r.m[0]=1; r.m[1]= 0; r.m[2]= 0;
                r.m[3]=0; r.m[4]= c; r.m[5]=-s;
                r.m[6]=0; r.m[7]= s; r.m[8]= c;
        return r;
    }

    Mat3 operator*(const Mat3& o) const {
        Mat3 r;
        for (int i = 0; i < 3; ++i)
            for (int j = 0; j < 3; ++j) {
                double s = 0;
                for (int k = 0; k < 3; ++k) s += m[i*3+k] * o.m[k*3+j];
                r.m[i*3+j] = s;
            }
        return r;
    }

    Vec3 operator*(const Vec3& v) const {
        Vec3 r;
        r.x = m[0]*v.x + m[1]*v.y + m[2]*v.z;
        r.y = m[3]*v.x + m[4]*v.y + m[5]*v.z;
        r.z = m[6]*v.x + m[7]*v.y + m[8]*v.z;
        return r;
    }

    // Rotations are orthonormal, so the transpose is the inverse.
    Mat3 transposed() const {
        Mat3 r;
        for (int i = 0; i < 3; ++i)
            for (int j = 0; j < 3; ++j) r.m[i*3+j] = m[j*3+i];
        return r;
    }
};

// Everything the warp needs, in layer pixels / radians.
struct HeadRig {
    double centerX = 0.0;     // face centre, layer pixels
    double centerY = 0.0;
    double radius  = 1.0;     // head radius, layer pixels

    double depth   = 1.10;    // head depth in radii; lower = flatter head
    double falloff = 0.85;    // how far past the head the warp keeps reaching

    double yaw = 0.0, pitch = 0.0, roll = 0.0;              // target pose
    double origYaw = 0.0, origPitch = 0.0, origRoll = 0.0;  // pose of the drawing

    double strength = 1.0;    // 0 = no deformation, 1 = full
};

inline double smoothstep(double edge0, double edge1, double x) {
    if (edge1 == edge0) return x < edge0 ? 0.0 : 1.0;
    double t = (x - edge0) / (edge1 - edge0);
    if (t < 0.0) t = 0.0;
    if (t > 1.0) t = 1.0;
    return t * t * (3.0 - 2.0 * t);
}

// Precomputed per-frame state, so the per-pixel loop stays cheap.
struct WarpState {
    Mat3   invRot;       // inverse of the yaw/pitch part
    double cosRoll, sinRoll;
    double centerX, centerY, radius, invRadius;
    double depth, falloff, strength;
    bool   identity;     // nothing to do at all

    explicit WarpState(const HeadRig& rig) {
        const Mat3 target = Mat3::rotY(rig.yaw)     * Mat3::rotX(rig.pitch);
        const Mat3 origin = Mat3::rotY(rig.origYaw) * Mat3::rotX(rig.origPitch);
        // Bring the drawing back to a neutral pose, then into the target one.
        invRot = (target * origin.transposed()).transposed();

        const double dRoll = rig.roll - rig.origRoll;
        cosRoll = std::cos(-dRoll);
        sinRoll = std::sin(-dRoll);

        centerX   = rig.centerX;
        centerY   = rig.centerY;
        radius    = rig.radius > 1e-6 ? rig.radius : 1e-6;
        invRadius = 1.0 / radius;
        depth     = rig.depth;
        falloff   = rig.falloff < 0.0 ? 0.0 : rig.falloff;
        strength  = rig.strength;

        identity = (rig.strength == 0.0) ||
                   (std::fabs(rig.yaw   - rig.origYaw)   < 1e-9 &&
                    std::fabs(rig.pitch - rig.origPitch) < 1e-9 &&
                    std::fabs(dRoll)                     < 1e-9);
    }

    // Unit-sphere displacement for a point already inside the head.
    // Input and output are in head radii, relative to the face centre.
    Vec2 sphereDisplace(double u, double v) const {
        double r2 = u*u + v*v;
        if (r2 > 1.0) r2 = 1.0;
        // A true sphere (sqrt) has an infinite slope at the silhouette, which
        // puts a visible crease along the hairline. This paraboloid matches a
        // sphere near the centre - where the face is - and stays smooth at the
        // rim. Its depth is half a sphere's, hence the larger default below.
        const double z = depth * (1.0 - r2);
        const Vec3 src = invRot * Vec3{ u, v, z };
        return Vec2{ src.x - u, src.y - v };
    }

    // Where the output pixel (ox, oy) must be sampled from in the source.
    // Coordinates are layer pixels for both input and output.
    Vec2 sourceOf(double ox, double oy) const {
        if (identity) return Vec2{ ox, oy };

        // 1. undo the tilt around the face centre
        const double dx = ox - centerX;
        const double dy = oy - centerY;
        const double rx = dx * cosRoll - dy * sinRoll;
        const double ry = dx * sinRoll + dy * cosRoll;

        // 2. yaw / pitch on the sphere, fading out past the head
        double u = rx * invRadius;
        double v = ry * invRadius;
        const double r = std::sqrt(u*u + v*v);

        double fade = 1.0;
        if (r > 1.0) {
            if (r >= 1.0 + falloff) {
                // far outside the head: only the tilt applies
                return Vec2{ centerX + rx, centerY + ry };
            }
            // evaluate the displacement at the silhouette and let it decay
            fade = smoothstep(1.0 + falloff, 1.0, r);
            const double inv = 1.0 / r;
            u *= inv;
            v *= inv;
        }

        const Vec2 d = sphereDisplace(u, v);
        const double k = fade * strength * radius;
        return Vec2{ centerX + rx + d.x * k,
                     centerY + ry + d.y * k };
    }
};

// How far the warp can push a pixel, in layer pixels. Used to decide how much
// the render buffer has to grow so nothing gets clipped.
inline double maxDisplacement(const HeadRig& rig) {
    const WarpState st(rig);
    if (st.identity) return 0.0;
    // The largest displacement sits somewhere inside the head, not on the
    // silhouette, so walk a grid over the whole disk.
    double worst = 0.0;
    const int kSteps = 32;
    for (int iy = -kSteps; iy <= kSteps; ++iy) {
        for (int ix = -kSteps; ix <= kSteps; ++ix) {
            const double u = double(ix) / kSteps;
            const double v = double(iy) / kSteps;
            if (u*u + v*v > 1.0) continue;
            const Vec2 d = st.sphereDisplace(u, v);
            const double len = std::sqrt(d.x*d.x + d.y*d.y);
            if (len > worst) worst = len;
        }
    }
    return worst * rig.radius * rig.strength;
}

} // namespace pinokio
