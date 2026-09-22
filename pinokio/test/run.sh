#!/bin/sh
# Exercises the parts of Pinokio that carry no After Effects types.
# Needs nothing but a C++ compiler; run it from this folder.
set -e
cd "$(dirname "$0")"
for t in warp analyze sample; do
    printf '=== %s ===\n' "$t"
    c++ -O2 -Wall -o "/tmp/pinokio_$t" "${t}_test.cpp"
    "/tmp/pinokio_$t"
done
echo "all tests passed"
