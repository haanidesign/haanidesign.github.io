#pragma once

#include "AEConfig.h"
#include "entry.h"
#include "AE_Effect.h"
#include "AE_EffectCB.h"
#include "AE_EffectCBSuites.h"
#include "AE_EffectSuites.h"
#include "AE_Macros.h"
#include "AEGP_SuiteHandler.h"
#include "Param_Utils.h"
#include "Smart_Utils.h"

#ifdef AE_OS_WIN
    #include <Windows.h>
#endif

#define PINOKIO_NAME            "Pinokio"
#define PINOKIO_MAJOR_VERSION   1
#define PINOKIO_MINOR_VERSION   0
#define PINOKIO_BUG_VERSION     0
#define PINOKIO_STAGE_VERSION   PF_Stage_DEVELOP
#define PINOKIO_BUILD_VERSION   1

// The plugin is documented to work inside these ranges; the sliders enforce
// them so a project cannot quietly drift into angles the warp cannot hold.
#define PINOKIO_MAX_YAW    20.0
#define PINOKIO_MAX_PITCH  20.0
#define PINOKIO_MAX_ROLL   15.0

enum {
    PINOKIO_INPUT = 0,
    PINOKIO_ANALYZE,

    PINOKIO_HEAD_TOPIC,
    PINOKIO_CENTER,
    PINOKIO_SIZE,
    PINOKIO_DEPTH,
    PINOKIO_FALLOFF,
    PINOKIO_HEAD_TOPIC_END,

    PINOKIO_ORIG_TOPIC,
    PINOKIO_ORIG_YAW,
    PINOKIO_ORIG_PITCH,
    PINOKIO_ORIG_ROLL,
    PINOKIO_ORIG_TOPIC_END,

    PINOKIO_POSE_TOPIC,
    PINOKIO_YAW,
    PINOKIO_PITCH,
    PINOKIO_ROLL,
    PINOKIO_POSE_TOPIC_END,

    PINOKIO_STRENGTH,

    PINOKIO_NUM_PARAMS
};

// Disk IDs never change once shipped: they are how After Effects matches a
// saved project's values back onto the parameters.
enum {
    ANALYZE_DISK_ID = 1,
    HEAD_TOPIC_DISK_ID,
    CENTER_DISK_ID,
    SIZE_DISK_ID,
    DEPTH_DISK_ID,
    FALLOFF_DISK_ID,
    HEAD_TOPIC_END_DISK_ID,
    ORIG_TOPIC_DISK_ID,
    ORIG_YAW_DISK_ID,
    ORIG_PITCH_DISK_ID,
    ORIG_ROLL_DISK_ID,
    ORIG_TOPIC_END_DISK_ID,
    POSE_TOPIC_DISK_ID,
    YAW_DISK_ID,
    PITCH_DISK_ID,
    ROLL_DISK_ID,
    POSE_TOPIC_END_DISK_ID,
    STRENGTH_DISK_ID
};

extern "C" {

DllExport PF_Err EffectMain(
    PF_Cmd          cmd,
    PF_InData       *in_data,
    PF_OutData      *out_data,
    PF_ParamDef     *params[],
    PF_LayerDef     *output,
    void            *extra);

}
