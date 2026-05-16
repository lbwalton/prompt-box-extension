#!/bin/bash
# Builds a ~30s promo video from the 5 store screenshots using ffmpeg.
# Output: marketing/promo.mp4 (1280×800, 30fps, H.264, silent)
#
# Run: bash build-video.sh  (or: npm run video)

set -e

cd "$(dirname "$0")"

SRC="marketing/png"
OUT="marketing/promo.mp4"
FFMPEG="${FFMPEG:-/opt/homebrew/bin/ffmpeg}"

if [ ! -x "$FFMPEG" ]; then
  FFMPEG="$(command -v ffmpeg || true)"
fi
if [ -z "$FFMPEG" ]; then
  echo "ffmpeg not found — install with: brew install ffmpeg" >&2
  exit 1
fi

# Make sure screenshots exist; if not, render them.
if [ ! -f "$SRC/screenshot-1.png" ]; then
  echo "Rendering screenshots first..."
  node build-marketing.js
fi

# Each screenshot runs 6s with a subtle Ken Burns zoom. 0.5s crossfades
# between them. Final clip holds 8s to land the message, giving a total
# of ~28.5s.
#
# zoompan d=1 outputs 1 frame per input frame (preserves the 30fps
# stream from `-framerate 30`); `in` drives the zoom across the 180
# (or 240) input frames.

"$FFMPEG" -y \
  -loop 1 -framerate 30 -t 6 -i "$SRC/screenshot-1.png" \
  -loop 1 -framerate 30 -t 6 -i "$SRC/screenshot-2.png" \
  -loop 1 -framerate 30 -t 6 -i "$SRC/screenshot-3.png" \
  -loop 1 -framerate 30 -t 6 -i "$SRC/screenshot-4.png" \
  -loop 1 -framerate 30 -t 8 -i "$SRC/screenshot-5.png" \
  -filter_complex "\
    [0:v]scale=1600:1000,zoompan=z='1+0.0006*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x800:fps=30,setsar=1[v0];\
    [1:v]scale=1600:1000,zoompan=z='1+0.0006*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x800:fps=30,setsar=1[v1];\
    [2:v]scale=1600:1000,zoompan=z='1+0.0006*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x800:fps=30,setsar=1[v2];\
    [3:v]scale=1600:1000,zoompan=z='1+0.0006*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x800:fps=30,setsar=1[v3];\
    [4:v]scale=1600:1000,zoompan=z='1+0.0005*in':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=1:s=1280x800:fps=30,setsar=1[v4];\
    [v0][v1]xfade=transition=fade:duration=0.5:offset=5.5[x01];\
    [x01][v2]xfade=transition=fade:duration=0.5:offset=11[x02];\
    [x02][v3]xfade=transition=fade:duration=0.5:offset=16.5[x03];\
    [x03][v4]xfade=transition=fade:duration=0.5:offset=22[out]\
  " \
  -map "[out]" \
  -c:v libx264 -pix_fmt yuv420p -r 30 -crf 20 -preset medium \
  -movflags +faststart \
  "$OUT"

echo ""
echo "✓ Built $OUT"
"$FFMPEG" -i "$OUT" 2>&1 | grep -E "Duration|Stream" | head -3
