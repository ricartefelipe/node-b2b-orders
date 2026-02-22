#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

python - <<'PY'
from PIL import Image, ImageDraw
from pathlib import Path
out = Path("docs/screenshots")
out.mkdir(parents=True, exist_ok=True)
def gen(name, text):
    img = Image.new("RGB", (1280, 720), (25, 25, 25))
    d = ImageDraw.Draw(img)
    d.rectangle([40,40,1240,680], outline=(200,200,200), width=3)
    d.text((80,80), name, fill=(255,255,255))
    d.text((80,140), text, fill=(220,220,220))
    img.save(out/name)
gen("swagger.png","Placeholder screenshot.")
gen("grafana-overview.png","Placeholder screenshot.")
gen("trace-example.png","Placeholder screenshot.")
gen("sequence-main-flow.png","Placeholder screenshot.")
print("Generated placeholders in docs/screenshots/")
PY
