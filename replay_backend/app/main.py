
"""Local-only photo/video gallery proof of concept; not a production storefront."""
from __future__ import annotations

import hashlib
import os
import sqlite3
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError


ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("REPLAY_DATA_DIR", str(ROOT / "data"))).resolve()
INCOMING = Path(os.environ.get("REPLAY_INCOMING_DIR", str(ROOT / "incoming"))).resolve()

DB = DATA / "replay.sqlite3"
STATIC = Path(__file__).resolve().parent / "static"

SUPPORTED = {
    ".jpg": "photo",
    ".jpeg": "photo",
    ".png": "photo",
    ".mp4": "video",
}

MAX_FILE_BYTES = 500 * 1024 * 1024
POLL_SECONDS = 2
STOP = threading.Event()


def connect():
    db = sqlite3.connect(DB, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def setup():
    for folder in (DATA, INCOMING, DATA / "thumbs", DATA / "media"):
        folder.mkdir(parents=True, exist_ok=True)

    with connect() as db:
        db.execute("""
            CREATE TABLE IF NOT EXISTS media (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                kind TEXT NOT NULL,
                created_at TEXT NOT NULL,
                captured_at TEXT,
                camera TEXT,
                sha256 TEXT UNIQUE NOT NULL,
                thumb_file TEXT,
                media_file TEXT NOT NULL,
                size_bytes INTEGER NOT NULL
            )
        """)
        db.commit()

    print("[REPLAY] ROOT:", ROOT, flush=True)
    print("[REPLAY] DATA:", DATA, flush=True)
    print("[REPLAY] INCOMING:", INCOMING, flush=True)
    print("[REPLAY] INCOMING EXISTS:", INCOMING.exists(), flush=True)


def file_digest(path):
    digest = hashlib.sha256()

    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            digest.update(chunk)

    return digest.hexdigest()


def safe_copy(source, destination):
    temporary = destination.with_suffix(destination.suffix + ".part")

    try:
        with source.open("rb") as src, temporary.open("wb") as dst:
            for chunk in iter(lambda: src.read(1024 * 1024), b""):
                dst.write(chunk)

        temporary.replace(destination)

    finally:
        temporary.unlink(missing_ok=True)


def ingest(path: Path):
    print(f"[REPLAY] Trying to import: {path.name}", flush=True)

    if not path.is_file() or path.is_symlink():
        return False

    kind = SUPPORTED.get(path.suffix.lower())

    if not kind:
        return False

    try:
        size = path.stat().st_size

        if size == 0 or size > MAX_FILE_BYTES:
            print(f"[REPLAY] Invalid file size: {path.name}", flush=True)
            return False

        digest = file_digest(path)

        with connect() as db:
            existing = db.execute(
                "SELECT * FROM media WHERE sha256=?",
                (digest,)
            ).fetchone()

        # Jos tietokannassa on vanha merkintä mutta tiedosto puuttuu,
        # poistetaan vanha merkintä ja tuodaan tiedosto uudelleen.
        if existing:
            existing_media = DATA / "media" / existing["media_file"]
            existing_thumb = (
                DATA / "thumbs" / existing["thumb_file"]
                if existing["thumb_file"] else None
            )

            if existing_media.is_file() and (
                existing_thumb is None or existing_thumb.is_file()
            ):
                print(f"[REPLAY] Already imported: {path.name}", flush=True)
                return False

            with connect() as db:
                db.execute(
                    "DELETE FROM media WHERE sha256=?",
                    (digest,)
                )
                db.commit()

            print(f"[REPLAY] Removed stale database entry: {path.name}", flush=True)

        uid = uuid.uuid4().hex
        ext = path.suffix.lower()

        media_name = uid + ext
        media_path = DATA / "media" / media_name

        thumb_name = None
        captured_at = None
        camera = None

        if kind == "photo":
            try:
                with Image.open(path) as img:
                    img.verify()

                with Image.open(path) as img:
                    exif = img.getexif()

                    captured_at = str(exif.get(36867) or "") or None
                    camera = str(exif.get(272) or "") or None

                    thumb = ImageOps.exif_transpose(img)
                    thumb.thumbnail((640, 640))

                    if thumb.mode not in ("RGB", "L"):
                        thumb = thumb.convert("RGB")

                    thumb_name = uid + ".jpg"

                    thumb_path = DATA / "thumbs" / thumb_name

                    thumb.save(
                        thumb_path,
                        "JPEG",
                        quality=78,
                        optimize=True
                    )

            except (
                UnidentifiedImageError,
                OSError,
                ValueError
            ) as exc:

                print(
                    f"[REPLAY] IMAGE ERROR: {path.name}: {exc}",
                    flush=True
                )

                return False

        else:
            with path.open("rb") as f:
                header = f.read(32)

            if b"ftyp" not in header[4:16]:
                print(
                    f"[REPLAY] INVALID MP4: {path.name}",
                    flush=True
                )
                return False

        safe_copy(path, media_path)

        if not media_path.is_file():
            raise RuntimeError(f"Copy failed: {media_path}")

        print(
            f"[REPLAY] COPIED: {media_path} "
            f"SIZE: {media_path.stat().st_size}",
            flush=True
        )

        try:
            with connect() as db:
                db.execute(
                    """
                    INSERT INTO media VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        uid,
                        path.name,
                        kind,
                        datetime.now(timezone.utc).isoformat(),
                        captured_at,
                        camera,
                        digest,
                        thumb_name,
                        media_name,
                        size
                    )
                )
                db.commit()

        except Exception:
            media_path.unlink(missing_ok=True)

            if thumb_name:
                (DATA / "thumbs" / thumb_name).unlink(missing_ok=True)

            raise

        print(
            f"[REPLAY] Added {kind}: {path.name}",
            flush=True
        )

        return True

    except Exception as exc:
        print(
            f"[REPLAY] IMPORT ERROR: {path.name}: {exc}",
            flush=True
        )
        return False


def watcher():
    print(f"[REPLAY] Watching folder: {INCOMING}", flush=True)

    seen = {}

    while not STOP.is_set():
        try:
            current = set()

            for path in INCOMING.iterdir():

                if (
                    not path.is_file()
                    or path.is_symlink()
                    or path.suffix.lower() not in SUPPORTED
                ):
                    continue

                current.add(path)

                stat = path.stat()
                signature = (stat.st_size, stat.st_mtime_ns)

                old = seen.get(path)

                if old and old[0] == signature and old[1] >= 1:
                    if old[1] == 1:
                        ingest(path)

                    seen[path] = (signature, 2)

                else:
                    seen[path] = (signature, 1)

            for missing in set(seen) - current:
                seen.pop(missing, None)

        except Exception as exc:
            print(f"[REPLAY] WATCHER ERROR: {exc}", flush=True)

        STOP.wait(POLL_SECONDS)


@asynccontextmanager
async def lifespan(app):
    setup()

    STOP.clear()

    thread = threading.Thread(
        target=watcher,
        daemon=True
    )

    thread.start()

    yield

    STOP.set()
    thread.join(timeout=5)


app = FastAPI(
    title="Striimaamo Replay – local demo",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:5500",
        "http://localhost:5500",
        "http://127.0.0.1:5501",
        "http://localhost:5501"
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"]
)

app.mount(
    "/static",
    StaticFiles(directory=STATIC),
    name="static"
)


@app.get("/")
def home():
    return FileResponse(STATIC / "index.html")


@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "mode": "local-demo"
    }


@app.get("/api/manifest")
def manifest():
    with connect() as db:
        rows = db.execute(
            "SELECT * FROM media ORDER BY created_at DESC, id DESC"
        ).fetchall()

    photos = []

    for row in rows:
        media_path = DATA / "media" / row["media_file"]

        if not media_path.is_file():
            continue

        thumb_path = (
            DATA / "thumbs" / row["thumb_file"]
            if row["thumb_file"] else None
        )

        photos.append({
            "id": row["id"],
            "filename": row["filename"],
            "kind": row["kind"],
            "created_at": row["created_at"],
            "captured_at": row["captured_at"],
            "camera": row["camera"],
            "size_bytes": row["size_bytes"],
            "thumb": (
                f"/api/thumb/{row['id']}"
                if thumb_path and thumb_path.is_file()
                else None
            ),
            "preview": f"/api/media/{row['id']}"
        })

    return {
        "event": "Striimaamo Replay – testitapahtuma",
        "count": len(photos),
        "photos": photos
    }


def lookup(uid):
    if not (
        len(uid) == 32
        and all(c in "0123456789abcdef" for c in uid)
    ):
        raise HTTPException(404)

    with connect() as db:
        row = db.execute(
            "SELECT * FROM media WHERE id=?",
            (uid,)
        ).fetchone()

    if not row:
        raise HTTPException(404)

    return row


@app.get("/api/thumb/{uid}")
def thumb(uid: str):
    row = lookup(uid)

    if not row["thumb_file"]:
        raise HTTPException(404)

    path = DATA / "thumbs" / row["thumb_file"]

    if not path.is_file():
        raise HTTPException(404, "Thumbnail file missing")

    return FileResponse(
        path,
        media_type="image/jpeg"
    )


@app.get("/api/media/{uid}")
def media(uid: str):
    row = lookup(uid)

    path = DATA / "media" / row["media_file"]

    if not path.is_file():
        raise HTTPException(404, "Media file missing")

    if row["kind"] == "video":
        kind = "video/mp4"
    elif path.suffix.lower() == ".png":
        kind = "image/png"
    else:
        kind = "image/jpeg"

    return FileResponse(
        path,
        media_type=kind
    )


