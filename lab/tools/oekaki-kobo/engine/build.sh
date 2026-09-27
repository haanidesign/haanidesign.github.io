#!/bin/sh
# engine.wasm を つくりなおす。
set -e
cd "$(dirname "$0")"
cargo build --release --target wasm32-unknown-unknown
cp target/wasm32-unknown-unknown/release/oekaki_engine.wasm ../engine.wasm
ls -l ../engine.wasm
