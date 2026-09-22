// Pinokio - head turn and tilt for a single illustration layer.
//
// Apply the effect to a head-only layer on a transparent background, press
// Analyze, then animate Yaw / Pitch / Roll. See README.md for the build.

#include "Pinokio.h"
#include "PinokioWarp.h"
#include "PinokioAnalyze.h"
#include "PinokioSample.h"

#include <algorithm>
#include <vector>

static const double kDeg2Rad = 3.14159265358979323846 / 180.0;

// ---------------------------------------------------------------------------
// per-pixel warp
// ---------------------------------------------------------------------------
struct WarpRefcon {
    const pinokio::WarpState*   state;
    const PF_EffectWorld*       src;
    const PF_EffectWorld*       dst;
};

template <typename P>
static PF_Err WarpPixel(void* refconPV, A_long xL, A_long yL, P* /*inP*/, P* outP) {
    const WarpRefcon* rc = static_cast<const WarpRefcon*>(refconPV);
    pinokio::WarpOnePixel<P, PF_EffectWorld>(*rc->state, *rc->src, *rc->dst,
                                             int(xL), int(yL), *outP);
    return PF_Err_NONE;
}

static PF_Err WarpPixel8 (void* rc, A_long x, A_long y, PF_Pixel8*     i, PF_Pixel8*     o) { return WarpPixel<PF_Pixel8>(rc, x, y, i, o); }
static PF_Err WarpPixel16(void* rc, A_long x, A_long y, PF_Pixel16*    i, PF_Pixel16*    o) { return WarpPixel<PF_Pixel16>(rc, x, y, i, o); }
static PF_Err WarpPixelF (void* rc, A_long x, A_long y, PF_PixelFloat* i, PF_PixelFloat* o) { return WarpPixel<PF_PixelFloat>(rc, x, y, i, o); }

// ---------------------------------------------------------------------------
// reading the rig out of the parameters
// ---------------------------------------------------------------------------
struct PinokioInfo {
    pinokio::HeadRig rig;
};

static void RigFromValues(PF_InData* in_data,
                          double centerX, double centerY, double sizePct,
                          double depth, double falloff,
                          double origYaw, double origPitch, double origRoll,
                          double yaw, double pitch, double roll,
                          double strengthPct,
                          pinokio::HeadRig& rig) {
    rig.centerX = centerX;
    rig.centerY = centerY;
    // Size is a share of the layer width, so it survives a change of comp
    // resolution without the rig drifting off the face.
    rig.radius  = std::max(1.0, sizePct * 0.01 * double(in_data->width));
    rig.depth   = depth;
    rig.falloff = falloff;

    rig.origYaw   = origYaw   * kDeg2Rad;
    rig.origPitch = origPitch * kDeg2Rad;
    rig.origRoll  = origRoll  * kDeg2Rad;
    rig.yaw       = yaw       * kDeg2Rad;
    rig.pitch     = pitch     * kDeg2Rad;
    rig.roll      = roll      * kDeg2Rad;

    rig.strength  = strengthPct * 0.01;
}

static void RigFromParams(PF_InData* in_data, PF_ParamDef* params[], pinokio::HeadRig& rig) {
    RigFromValues(in_data,
        FIX_2_FLOAT(params[PINOKIO_CENTER]->u.td.x_value),
        FIX_2_FLOAT(params[PINOKIO_CENTER]->u.td.y_value),
        params[PINOKIO_SIZE]->u.fs_d.value,
        params[PINOKIO_DEPTH]->u.fs_d.value,
        params[PINOKIO_FALLOFF]->u.fs_d.value,
        params[PINOKIO_ORIG_YAW]->u.fs_d.value,
        params[PINOKIO_ORIG_PITCH]->u.fs_d.value,
        params[PINOKIO_ORIG_ROLL]->u.fs_d.value,
        params[PINOKIO_YAW]->u.fs_d.value,
        params[PINOKIO_PITCH]->u.fs_d.value,
        params[PINOKIO_ROLL]->u.fs_d.value,
        params[PINOKIO_STRENGTH]->u.fs_d.value,
        rig);
}

// ---------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------
static PF_Err About(PF_InData* in_data, PF_OutData* out_data, PF_ParamDef*[], PF_LayerDef*) {
    AEGP_SuiteHandler suites(in_data->pica_basicP);
    suites.ANSICallbacksSuite1()->sprintf(
        out_data->return_msg,
        "%s v%d.%d\r"
        "Turn and tilt a single head illustration.\r"
        "Apply to a head-only layer on a transparent background, press Analyze, "
        "then animate Yaw / Pitch / Roll.",
        PINOKIO_NAME, PINOKIO_MAJOR_VERSION, PINOKIO_MINOR_VERSION);
    return PF_Err_NONE;
}

static PF_Err GlobalSetup(PF_InData* in_data, PF_OutData* out_data, PF_ParamDef*[], PF_LayerDef*) {
    out_data->my_version = PF_VERSION(PINOKIO_MAJOR_VERSION, PINOKIO_MINOR_VERSION,
                                      PINOKIO_BUG_VERSION, PINOKIO_STAGE_VERSION,
                                      PINOKIO_BUILD_VERSION);

    out_data->out_flags  = PF_OutFlag_DEEP_COLOR_AWARE
                         | PF_OutFlag_PIX_INDEPENDENT
                         | PF_OutFlag_I_EXPAND_BUFFER;

    out_data->out_flags2 = PF_OutFlag2_FLOAT_COLOR_AWARE
                         | PF_OutFlag2_SUPPORTS_SMART_RENDER
                         | PF_OutFlag2_SUPPORTS_THREADED_RENDERING;

    return PF_Err_NONE;
}

static PF_Err ParamsSetup(PF_InData* in_data, PF_OutData* out_data, PF_ParamDef*[], PF_LayerDef*) {
    PF_Err       err = PF_Err_NONE;
    PF_ParamDef  def;

    AEFX_CLR_STRUCT(def);
    PF_ADD_BUTTON("Analyze", "Analyze", 0, PF_ParamFlag_SUPERVISE, ANALYZE_DISK_ID);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Head", HEAD_TOPIC_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_POINT("Face center", 50, 50, 0, CENTER_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_FLOAT_SLIDERX("Face size", 1, 200, 5, 80, 0, 30,
                             PF_Precision_TENTHS, PF_ValueDisplayFlag_PERCENT, 0, SIZE_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_FLOAT_SLIDERX("Depth", 0, 3, 0, 2, 0, 1.1,
                             PF_Precision_HUNDREDTHS, 0, 0, DEPTH_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_FLOAT_SLIDERX("Follow", 0, 3, 0, 2, 0, 0.85,
                             PF_Precision_HUNDREDTHS, 0, 0, FALLOFF_DISK_ID);

    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(HEAD_TOPIC_END_DISK_ID);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Original pose", ORIG_TOPIC_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_FLOAT_SLIDERX("Yaw", -PINOKIO_MAX_YAW, PINOKIO_MAX_YAW, -PINOKIO_MAX_YAW, PINOKIO_MAX_YAW, 0, 0,
                             PF_Precision_TENTHS, 0, 0, ORIG_YAW_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_FLOAT_SLIDERX("Pitch", -PINOKIO_MAX_PITCH, PINOKIO_MAX_PITCH, -PINOKIO_MAX_PITCH, PINOKIO_MAX_PITCH, 0, 0,
                             PF_Precision_TENTHS, 0, 0, ORIG_PITCH_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_FLOAT_SLIDERX("Roll", -PINOKIO_MAX_ROLL, PINOKIO_MAX_ROLL, -PINOKIO_MAX_ROLL, PINOKIO_MAX_ROLL, 0, 0,
                             PF_Precision_TENTHS, 0, 0, ORIG_ROLL_DISK_ID);

    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(ORIG_TOPIC_END_DISK_ID);

    AEFX_CLR_STRUCT(def);
    PF_ADD_TOPIC("Pose", POSE_TOPIC_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_FLOAT_SLIDERX("Yaw", -PINOKIO_MAX_YAW, PINOKIO_MAX_YAW, -PINOKIO_MAX_YAW, PINOKIO_MAX_YAW, 0, 0,
                             PF_Precision_TENTHS, 0, 0, YAW_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_FLOAT_SLIDERX("Pitch", -PINOKIO_MAX_PITCH, PINOKIO_MAX_PITCH, -PINOKIO_MAX_PITCH, PINOKIO_MAX_PITCH, 0, 0,
                             PF_Precision_TENTHS, 0, 0, PITCH_DISK_ID);

        AEFX_CLR_STRUCT(def);
        PF_ADD_FLOAT_SLIDERX("Roll", -PINOKIO_MAX_ROLL, PINOKIO_MAX_ROLL, -PINOKIO_MAX_ROLL, PINOKIO_MAX_ROLL, 0, 0,
                             PF_Precision_TENTHS, 0, 0, ROLL_DISK_ID);

    AEFX_CLR_STRUCT(def);
    PF_END_TOPIC(POSE_TOPIC_END_DISK_ID);

    AEFX_CLR_STRUCT(def);
    PF_ADD_FLOAT_SLIDERX("Strength", 0, 100, 0, 100, 0, 100,
                         PF_Precision_TENTHS, PF_ValueDisplayFlag_PERCENT, 0, STRENGTH_DISK_ID);

    out_data->num_params = PINOKIO_NUM_PARAMS;
    return err;
}

// ---------------------------------------------------------------------------
// Analyze
//
// Reads the alpha of the layer at the current time and writes the face centre,
// the head size and a first guess at the drawing's own pose into the
// parameters. Everything it writes stays editable afterwards.
// ---------------------------------------------------------------------------
static PF_Err BuildAlphaMap(PF_InData* in_data, const PF_EffectWorld& src,
                            std::vector<float>& outBuf, int& outW, int& outH,
                            double& scale) {
    PF_Err err = PF_Err_NONE;
    AEGP_SuiteHandler suites(in_data->pica_basicP);

    PF_PixelFormat fmt = PF_PixelFormat_ARGB32;
    ERR(suites.PFWorldSuite2()->PF_GetPixelFormat(const_cast<PF_EffectWorld*>(&src), &fmt));
    if (err) return err;

    if (src.width <= 0 || src.height <= 0) return PF_Err_BAD_CALLBACK_PARAM;

    // The analysis only looks at the shape, so a reduced copy is plenty and
    // keeps a 16k-wide illustration from costing seconds.
    const int longest = std::max(src.width, src.height);
    const int step    = std::max(1, (longest + 511) / 512);

    outW = (src.width  + step - 1) / step;
    outH = (src.height + step - 1) / step;
    if (outW <= 0 || outH <= 0) return PF_Err_BAD_CALLBACK_PARAM;

    scale = double(step);
    outBuf.assign(size_t(outW) * size_t(outH), 0.f);

    for (int y = 0; y < outH; ++y) {
        const int sy = std::min(src.height - 1, y * step);
        for (int x = 0; x < outW; ++x) {
            const int sx = std::min(src.width - 1, x * step);
            float a = 0.f;
            switch (fmt) {
                case PF_PixelFormat_ARGB128:
                    a = pinokio::ConstRowOf<PF_PixelFloat, PF_EffectWorld>(src, sy)[sx].alpha;
                    break;
                case PF_PixelFormat_ARGB64:
                    a = float(pinokio::ConstRowOf<PF_Pixel16, PF_EffectWorld>(src, sy)[sx].alpha) / 32768.f;
                    break;
                default:
                    a = float(pinokio::ConstRowOf<PF_Pixel8, PF_EffectWorld>(src, sy)[sx].alpha) / 255.f;
                    break;
            }
            outBuf[size_t(y) * outW + x] = a;
        }
    }
    return PF_Err_NONE;
}

static PF_Err Analyze(PF_InData* in_data, PF_OutData* out_data, PF_ParamDef* params[]) {
    PF_Err      err = PF_Err_NONE;
    PF_ParamDef checkout;
    AEFX_CLR_STRUCT(checkout);

    ERR(PF_CHECKOUT_PARAM(in_data, PINOKIO_INPUT, in_data->current_time,
                          in_data->time_step, in_data->time_scale, &checkout));
    if (err) return err;

    std::vector<float> alpha;
    int aw = 0, ah = 0;
    double scale = 1.0;
    err = BuildAlphaMap(in_data, checkout.u.ld, alpha, aw, ah, scale);

    pinokio::FaceGuess guess;
    if (!err) {
        pinokio::AlphaMap map;
        map.a = alpha.data(); map.width = aw; map.height = ah;
        guess = pinokio::analyzeFace(map);
    }

    // Everything needed from the layer is copied out before it is checked
    // back in: the world is not ours to read after that.
    const A_long srcOriginX = checkout.u.ld.origin_x;
    const A_long srcOriginY = checkout.u.ld.origin_y;
    const A_long srcWidth   = checkout.u.ld.width;

    ERR2(PF_CHECKIN_PARAM(in_data, &checkout));

    if (err) return err;

    if (!guess.found) {
        AEGP_SuiteHandler suites(in_data->pica_basicP);
        suites.ANSICallbacksSuite1()->sprintf(
            out_data->return_msg,
            "Pinokio could not find a head. Give the layer a transparent "
            "background with only the head on it, and leave some room around it.");
        out_data->out_flags |= PF_OutFlag_DISPLAY_ERROR_MESSAGE;
        return PF_Err_NONE;
    }

    // The parameters are in layer pixels; the analysis worked in world pixels
    // on a reduced copy.
    const double layerW = in_data->width > 0 ? double(in_data->width) : double(srcWidth);
    const double cx = guess.centerX * scale - double(srcOriginX);
    const double cy = guess.centerY * scale - double(srcOriginY);
    const double sizePct = (guess.radius * scale) / layerW * 100.0;

    params[PINOKIO_CENTER]->u.td.x_value = FLOAT2FIX(cx);
    params[PINOKIO_CENTER]->u.td.y_value = FLOAT2FIX(cy);
    params[PINOKIO_CENTER]->uu.change_flags |= PF_ChangeFlag_CHANGED_VALUE;

    params[PINOKIO_SIZE]->u.fs_d.value = sizePct;
    params[PINOKIO_SIZE]->uu.change_flags |= PF_ChangeFlag_CHANGED_VALUE;

    params[PINOKIO_ORIG_YAW]->u.fs_d.value   = guess.yaw   / kDeg2Rad;
    params[PINOKIO_ORIG_YAW]->uu.change_flags   |= PF_ChangeFlag_CHANGED_VALUE;
    params[PINOKIO_ORIG_PITCH]->u.fs_d.value = guess.pitch / kDeg2Rad;
    params[PINOKIO_ORIG_PITCH]->uu.change_flags |= PF_ChangeFlag_CHANGED_VALUE;
    params[PINOKIO_ORIG_ROLL]->u.fs_d.value  = guess.roll  / kDeg2Rad;
    params[PINOKIO_ORIG_ROLL]->uu.change_flags  |= PF_ChangeFlag_CHANGED_VALUE;

    out_data->out_flags |= PF_OutFlag_FORCE_RERENDER;
    return PF_Err_NONE;
}

static PF_Err UserChangedParam(PF_InData* in_data, PF_OutData* out_data,
                               PF_ParamDef* params[], const PF_UserChangedParamExtra* extra) {
    if (extra && extra->param_index == PINOKIO_ANALYZE) {
        return Analyze(in_data, out_data, params);
    }
    return PF_Err_NONE;
}

// ---------------------------------------------------------------------------
// smart render
// ---------------------------------------------------------------------------
static PF_Err CheckoutRig(PF_InData* in_data, pinokio::HeadRig& rig) {
    PF_Err err = PF_Err_NONE;
    PF_ParamDef p[PINOKIO_NUM_PARAMS];
    for (int i = 0; i < PINOKIO_NUM_PARAMS; ++i) AEFX_CLR_STRUCT(p[i]);

    static const int kWanted[] = {
        PINOKIO_CENTER, PINOKIO_SIZE, PINOKIO_DEPTH, PINOKIO_FALLOFF,
        PINOKIO_ORIG_YAW, PINOKIO_ORIG_PITCH, PINOKIO_ORIG_ROLL,
        PINOKIO_YAW, PINOKIO_PITCH, PINOKIO_ROLL, PINOKIO_STRENGTH
    };
    const int n = sizeof(kWanted) / sizeof(kWanted[0]);

    int got = 0;
    for (; got < n && !err; ++got) {
        err = PF_CHECKOUT_PARAM(in_data, kWanted[got], in_data->current_time,
                                in_data->time_step, in_data->time_scale, &p[kWanted[got]]);
    }

    if (!err) {
        RigFromValues(in_data,
            FIX_2_FLOAT(p[PINOKIO_CENTER].u.td.x_value),
            FIX_2_FLOAT(p[PINOKIO_CENTER].u.td.y_value),
            p[PINOKIO_SIZE].u.fs_d.value,
            p[PINOKIO_DEPTH].u.fs_d.value,
            p[PINOKIO_FALLOFF].u.fs_d.value,
            p[PINOKIO_ORIG_YAW].u.fs_d.value,
            p[PINOKIO_ORIG_PITCH].u.fs_d.value,
            p[PINOKIO_ORIG_ROLL].u.fs_d.value,
            p[PINOKIO_YAW].u.fs_d.value,
            p[PINOKIO_PITCH].u.fs_d.value,
            p[PINOKIO_ROLL].u.fs_d.value,
            p[PINOKIO_STRENGTH].u.fs_d.value,
            rig);
    }

    // Check in exactly what was checked out, even when one of them failed.
    for (int i = 0; i < got; ++i) {
        PF_CHECKIN_PARAM(in_data, &p[kWanted[i]]);
    }
    return err;
}

static PF_Err PreRender(PF_InData* in_data, PF_OutData* out_data, PF_PreRenderExtra* extra) {
    PF_Err err = PF_Err_NONE;
    AEGP_SuiteHandler suites(in_data->pica_basicP);

    pinokio::HeadRig rig;
    ERR(CheckoutRig(in_data, rig));
    if (err) return err;

    PF_Handle infoH = suites.HandleSuite1()->host_new_handle(sizeof(PinokioInfo));
    if (!infoH) return PF_Err_OUT_OF_MEMORY;

    PinokioInfo* info = static_cast<PinokioInfo*>(suites.HandleSuite1()->host_lock_handle(infoH));
    if (!info) {
        suites.HandleSuite1()->host_dispose_handle(infoH);
        return PF_Err_OUT_OF_MEMORY;
    }
    info->rig = rig;
    extra->output->pre_render_data = infoH;

    // Ask for as much of the source as the warp can reach, and let the result
    // grow by the same amount so a turned head is never clipped.
    const A_long pad = A_long(std::ceil(pinokio::maxDisplacement(rig))) + 2;

    PF_RenderRequest req = extra->input->output_request;
    req.rect.left   -= pad;
    req.rect.top    -= pad;
    req.rect.right  += pad;
    req.rect.bottom += pad;
    req.preserve_rgb_of_zero_alpha = TRUE;

    PF_CheckoutResult in_result;
    ERR(extra->cb->checkout_layer(in_data->effect_ref, PINOKIO_INPUT, PINOKIO_INPUT,
                                  &req, in_data->current_time, in_data->time_step,
                                  in_data->time_scale, &in_result));
    if (err) {
        suites.HandleSuite1()->host_unlock_handle(infoH);
        return err;
    }

    PF_LRect grown = in_result.result_rect;
    grown.left   -= pad;
    grown.top    -= pad;
    grown.right  += pad;
    grown.bottom += pad;

    UnionLRect(&grown, &extra->output->result_rect);
    UnionLRect(&grown, &extra->output->max_result_rect);

    suites.HandleSuite1()->host_unlock_handle(infoH);
    return err;
}

static PF_Err SmartRender(PF_InData* in_data, PF_OutData* out_data, PF_SmartRenderExtra* extra) {
    PF_Err err = PF_Err_NONE, err2 = PF_Err_NONE;
    AEGP_SuiteHandler suites(in_data->pica_basicP);

    PF_EffectWorld* input  = NULL;
    PF_EffectWorld* output = NULL;

    PinokioInfo* info = static_cast<PinokioInfo*>(
        suites.HandleSuite1()->host_lock_handle(reinterpret_cast<PF_Handle>(extra->input->pre_render_data)));
    if (!info) return PF_Err_INTERNAL_STRUCT_DAMAGED;

    ERR(extra->cb->checkout_layer_pixels(in_data->effect_ref, PINOKIO_INPUT, &input));
    ERR(extra->cb->checkout_output(in_data->effect_ref, &output));

    if (!err && input && output) {
        PF_PixelFormat fmt = PF_PixelFormat_ARGB32;
        ERR(suites.PFWorldSuite2()->PF_GetPixelFormat(output, &fmt));

        const pinokio::WarpState state(info->rig);
        WarpRefcon rc;
        rc.state = &state;
        rc.src   = input;
        rc.dst   = output;

        PF_LRect area;
        area.left = 0; area.top = 0;
        area.right = output->width; area.bottom = output->height;

        if (!err) {
            switch (fmt) {
                case PF_PixelFormat_ARGB128:
                    ERR(suites.IterateFloatSuite2()->iterate(in_data, 0, output->height, NULL,
                                                             &area, &rc, WarpPixelF, output));
                    break;
                case PF_PixelFormat_ARGB64:
                    ERR(suites.Iterate16Suite2()->iterate(in_data, 0, output->height, NULL,
                                                          &area, &rc, WarpPixel16, output));
                    break;
                default:
                    ERR(suites.Iterate8Suite2()->iterate(in_data, 0, output->height, NULL,
                                                         &area, &rc, WarpPixel8, output));
                    break;
            }
        }
    }

    ERR2(extra->cb->checkin_layer_pixels(in_data->effect_ref, PINOKIO_INPUT));
    suites.HandleSuite1()->host_unlock_handle(reinterpret_cast<PF_Handle>(extra->input->pre_render_data));
    return err;
}

// Kept for hosts that still ask for a plain render; the warp itself is shared.
static PF_Err LegacyRender(PF_InData* in_data, PF_OutData* out_data,
                           PF_ParamDef* params[], PF_LayerDef* output) {
    PF_Err err = PF_Err_NONE;
    AEGP_SuiteHandler suites(in_data->pica_basicP);

    pinokio::HeadRig rig;
    RigFromParams(in_data, params, rig);

    const pinokio::WarpState state(rig);
    WarpRefcon rc;
    rc.state = &state;
    rc.src   = &params[PINOKIO_INPUT]->u.ld;
    rc.dst   = output;

    PF_LRect area;
    area.left = 0; area.top = 0;
    area.right = output->width; area.bottom = output->height;

    if (PF_WORLD_IS_DEEP(output)) {
        ERR(suites.Iterate16Suite2()->iterate(in_data, 0, output->height, NULL,
                                              &area, &rc, WarpPixel16, output));
    } else {
        ERR(suites.Iterate8Suite2()->iterate(in_data, 0, output->height, NULL,
                                             &area, &rc, WarpPixel8, output));
    }
    return err;
}

// ---------------------------------------------------------------------------
// entry points
// ---------------------------------------------------------------------------
extern "C" DllExport PF_Err PluginDataEntryFunction2(
    PF_PluginDataPtr        inPtr,
    PF_PluginDataCB2        inPluginDataCallBackPtr,
    SPBasicSuite*           inSPBasicSuitePtr,
    const char*             inHostName,
    const char*             inHostVersion)
{
    return PF_REGISTER_EFFECT_EXT2(
        inPtr, inPluginDataCallBackPtr,
        PINOKIO_NAME,
        "HAANI Pinokio",                 // match name: never change once shipped
        "HAANI",                         // category
        AE_RESERVED_INFO,
        "EffectMain",
        "https://haanidesign.github.io/");
}

PF_Err EffectMain(PF_Cmd cmd, PF_InData* in_data, PF_OutData* out_data,
                  PF_ParamDef* params[], PF_LayerDef* output, void* extra)
{
    PF_Err err = PF_Err_NONE;
    try {
        switch (cmd) {
            case PF_Cmd_ABOUT:
                err = About(in_data, out_data, params, output);
                break;
            case PF_Cmd_GLOBAL_SETUP:
                err = GlobalSetup(in_data, out_data, params, output);
                break;
            case PF_Cmd_PARAMS_SETUP:
                err = ParamsSetup(in_data, out_data, params, output);
                break;
            case PF_Cmd_USER_CHANGED_PARAM:
                err = UserChangedParam(in_data, out_data, params,
                                       reinterpret_cast<const PF_UserChangedParamExtra*>(extra));
                break;
            case PF_Cmd_SMART_PRE_RENDER:
                err = PreRender(in_data, out_data, reinterpret_cast<PF_PreRenderExtra*>(extra));
                break;
            case PF_Cmd_SMART_RENDER:
                err = SmartRender(in_data, out_data, reinterpret_cast<PF_SmartRenderExtra*>(extra));
                break;
            case PF_Cmd_RENDER:
                err = LegacyRender(in_data, out_data, params, output);
                break;
            default:
                break;
        }
    } catch (PF_Err& thrown) {
        err = thrown;
    } catch (...) {
        err = PF_Err_INTERNAL_STRUCT_DAMAGED;
    }
    return err;
}
