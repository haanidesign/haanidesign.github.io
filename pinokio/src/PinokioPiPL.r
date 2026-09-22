#include "AEConfig.h"
#include "AE_EffectVers.h"

#ifndef AE_OS_WIN
    #include <AE_General.r>
#endif

resource 'PiPL' (16000) {
    {
        Kind { AEEffect },
        Name { "Pinokio" },
        Category { "HAANI" },

#ifdef AE_OS_WIN
    #ifdef AE_PROC_INTELx64
        CodeWin64X86 { "EffectMain" },
    #endif
#else
    #ifdef AE_OS_MAC
        CodeMacIntel64 { "EffectMain" },
        CodeMacARM64 { "EffectMain" },
    #endif
#endif

        AE_PiPL_Version { 2, 0 },
        AE_Effect_Spec_Version { PF_PLUG_IN_VERSION, PF_PLUG_IN_SUBVERS },
        AE_Effect_Version { 524289 },   /* PF_VERSION(1,0,0,PF_Stage_DEVELOP,1) */

        AE_Effect_Info_Flags { 0 },

        /* These two must match GlobalSetup() exactly or After Effects
           complains on load. See the table in README.md. */
        AE_Effect_Global_OutFlags {
            0x02000600  /* DEEP_COLOR_AWARE | PIX_INDEPENDENT | I_EXPAND_BUFFER */
        },
        AE_Effect_Global_OutFlags_2 {
            0x04000A00  /* SUPPORTS_THREADED_RENDERING | FLOAT_COLOR_AWARE | SUPPORTS_SMART_RENDER */
        },

        AE_Effect_Match_Name { "HAANI Pinokio" },
        AE_Reserved_Info { 0 }
    }
};
