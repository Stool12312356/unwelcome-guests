"""Pack dist/ into release/unwelcome-guests-itch.zip with index.html at the archive root (itch.io HTML5 requirement)."""
import zipfile
from pathlib import Path

root = Path(__file__).resolve().parent.parent
dist = root / "dist"
if not (dist / "index.html").is_file():
    raise SystemExit("dist/index.html not found: run `npm run build` first")
out = root / "release" / "unwelcome-guests-itch.zip"
out.parent.mkdir(exist_ok=True)
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as archive:
    for path in sorted(dist.rglob("*")):
        if path.is_file():
            archive.write(path, path.relative_to(dist).as_posix())
with zipfile.ZipFile(out) as archive:
    names = archive.namelist()
    assert "index.html" in names, "index.html must be at the zip root"
print(f"{out} files={len(names)} size={out.stat().st_size / 1048576:.1f} MiB")
