# Pinokio

An After Effects effect that turns and tilts a head drawn on a single layer.

Apply it to a head-only image on a transparent background, press **Analyze**,
then animate Yaw / Pitch / Roll.

## Building

Nothing here has been compiled or run inside After Effects yet. It needs a
machine with the SDK on it.

You need:

- After Effects 2025 or 2026
- The matching After Effects SDK (the folder that holds `Headers/AE_Effect.h`)
- Visual Studio 2022 with the C++ desktop workload, or Xcode on macOS
- CMake 3.20 or newer

```
cmake -S . -B build -G "Visual Studio 17 2022" -A x64 ^
      -DAE_SDK_PATH="C:/AE_SDK/After Effects 2026 SDK"
cmake --build build --config Release
```

Copy `build/Release/Pinokio.aex` into
`C:\Program Files\Adobe\Adobe After Effects 2026\Support Files\Plug-ins\`
and restart After Effects. The effect shows up under **HAANI > Pinokio**.

Quit After Effects before replacing the file.

### If the build fails

- `PiPLtool.exe not found` — pass `-DPIPL_TOOL=<path>`. It sits in the SDK
  under `Examples/Resources`.
- After Effects reports a flag mismatch on load — `AE_Effect_Global_OutFlags`
  in `src/PinokioPiPL.r` has to equal `out_flags` in `GlobalSetup()` exactly,
  and the same for the `_2` pair. The current values are

  | | value | flags |
  |---|---|---|
  | `OutFlags` | `0x02000600` | `DEEP_COLOR_AWARE`, `PIX_INDEPENDENT`, `I_EXPAND_BUFFER` |
  | `OutFlags_2` | `0x04000A00` | `SUPPORTS_THREADED_RENDERING`, `FLOAT_COLOR_AWARE`, `SUPPORTS_SMART_RENDER` |

## Parameters

| | |
|---|---|
| **Analyze** | Reads the layer's alpha and fills in the three below plus Original pose. |
| **Face center**, **Face size** | Where the head is and how big it is. Size is a share of the layer width. |
| **Depth** | How round the head is treated as being. Lower is flatter. |
| **Follow** | How far past the head the warp keeps reaching, so hair and hats come along. |
| **Original pose** | The direction the drawing already faces. Analyze guesses it; correct it by hand. |
| **Pose** | The direction to turn it to. This is what you keyframe. |
| **Strength** | Scales the whole deformation. |

`script/PinokioController.jsx` adds a null you drag inside a circle instead of
touching the Pose sliders. Run it with the layer selected.

## How it works

The head is treated as a shallow dome. Each output pixel is lifted onto that
dome, rotated back by the inverse of the pose, and dropped again; where it
lands is where it gets its colour from. Past the silhouette the displacement
fades out over the Follow distance, which is what carries hair and hats.

Roll is an exact 2D rotation around the face centre, so tilt costs no quality.

Analyze works from the alpha channel alone: the widest line of the silhouette
gives the centre and the size, the second moments give the tilt, and the offset
between the chin and the skull gives a first guess at the turn.

## What it does not do

It deforms the drawing it is given. It cannot invent anything.

- Nothing hidden in the original becomes visible by turning it.
- The turn guess is rough and often needs correcting by hand. Pitch is not
  guessed at all.
- Large angles, deep downward views, hidden faces and heavy deformation will
  not hold.
- No separate rigging or physics for hair and hats.
- The sliders stop at 20 degrees of turn and 15 of tilt.

## Notes

- Transparent background, head only, no neck or body, with room around it.
- Very large hair ornaments and long hair deform better on their own layer.
- 8, 16 and 32 bpc, and multi-frame rendering.

## Layout

| | |
|---|---|
| `src/PinokioWarp.h` | The dome warp. No After Effects types. |
| `src/PinokioAnalyze.h` | Reading a face out of an alpha channel. No After Effects types. |
| `src/PinokioSample.h` | Coordinates and bilinear fetching. Templated on the world type. |
| `src/Pinokio.cpp` | Everything that talks to After Effects. |
| `src/PinokioPiPL.r` | The resource After Effects reads to find the effect. |
| `script/PinokioController.jsx` | The round controller. |

The three headers hold no host types on purpose, so the maths can be exercised
without After Effects. `test/` does exactly that.
