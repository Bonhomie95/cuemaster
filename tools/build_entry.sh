#!/bin/sh
# Render the entry screen's backgrounds: the hero room at other venues and camera angles.
# The app picks one at random on every launch (mobile/src/app/art.ts). hero.jpg is the first.
set -e
cd "$(dirname "$0")/.."
BLENDER=${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}
OUT_DIR=${ENTRY_DIR:-$PWD/mobile/assets/entry}
mkdir -p "$OUT_DIR"
render() { # name skin shot layout
  HERO_OUT="$OUT_DIR/$1.jpg" HERO_SKIN=$2 HERO_SHOT=$3 HERO_LAYOUT=$4 \
    "$BLENDER" -b mobile/assets/models/cuemaster-table.blend --python tools/build_hero.py
}
render london riviera high game
render tokyo midnight break rack
render dubai jade rail game
render rio rio eye rack
render cairo cairo rail rack
render monaco monaco high rack
