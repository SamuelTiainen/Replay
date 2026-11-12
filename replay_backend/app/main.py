"""Local-only photo/video gallery proof of concept; not a production storefront."""
from __future__ import annotations

import hashlib
import json
import os
import sqlite3
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from fastapi.middleware.cors import CORSMiddleware

ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get('REPLAY_DATA_DIR', str(ROOT / 'data'))).resolve()
INCOMING = Path(os.environ.get('REPLAY_INCOMING_DIR', str(ROOT / 'incoming'))).resolve()
DB = DATA / 'replay.sqlite3'
STATIC = Path(__file__).resolve().parent / 'static'
SUPPORTED = {'.jpg': 'photo', '.jpeg': 'photo', '.png': 'photo', '.mp4': 'video'}
MAX_FILE_BYTES = 500 * 1024 * 1024  # demo safety limit
POLL_SECONDS = 2
STOP = threading.Event()


def connect():
    db = sqlite3.connect(DB, timeout=30)
    db.row_factory = sqlite3.Row
    return db


def setup():
    for folder in (DATA, INCOMING, DATA / 'thumbs', DATA / 'media'):
        folder.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute('''CREATE TABLE IF NOT EXISTS media (
            id TEXT PRIMARY KEY, filename TEXT NOT NULL, kind TEXT NOT NULL,
            created_at TEXT NOT NULL, captured_at TEXT, camera TEXT,
            sha256 TEXT UNIQUE NOT NULL, thumb_file TEXT,
            media_file TEXT NOT NULL, size_bytes INTEGER NOT NULL
        )''')
        db.commit()


def file_digest(path):
    digest = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def safe_copy(source, destination):
    # Copy to a temporary path, then atomically rename after completion.
    temporary = destination.with_suffix(destination.suffix + '.part')
    try:
        with source.open('rb') as src, temporary.open('wb') as dst:
            for chunk in iter(lambda: src.read(1024 * 1024), b''):
                dst.write(chunk)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def ingest(path: Path):
    if not path.is_file() or path.is_symlink():
        return False
    kind = SUPPORTED.get(path.suffix.lower())
    if not kind:
        return False
    size = path.stat().st_size
    if size == 0 or size > MAX_FILE_BYTES:
        return False
    digest = file_digest(path)
    with connect() as db:
        if db.execute('SELECT 1 FROM media WHERE sha256=?', (digest,)).fetchone():
            return False
    uid = uuid.uuid4().hex
    ext = path.suffix.lower()
    media_name = uid + ext
    media_path = DATA / 'media' / media_name
    thumb_name = None
    captured_at = None
    camera = None
    if kind == 'photo':
        try:
            with Image.open(path) as img:
                img.verify()
            with Image.open(path) as img:
                exif = img.getexif()
                captured_at = str(exif.get(36867) or '') or None
                camera = str(exif.get(272) or '') or None
                thumb = ImageOps.exif_transpose(img)
                thumb.thumbnail((640, 640))
                if thumb.mode not in ('RGB', 'L'):
                    thumb = thumb.convert('RGB')
                thumb_name = uid + '.jpg'
                thumb.save(DATA / 'thumbs' / thumb_name, 'JPEG', quality=78, optimize=True)
        except (UnidentifiedImageError, OSError, ValueError):
            return False
    else:
        # MP4 validation is deliberately minimal; production needs media probing.
        with path.open('rb') as f:
            header = f.read(32)
        if b'ftyp' not in header[4:16]:
            return False
    safe_copy(path, media_path)
    try:
        with connect() as db:
            db.execute('''INSERT INTO media VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                       (uid, path.name, kind, datetime.now(timezone.utc).isoformat(),
                        captured_at, camera, digest, thumb_name, media_name, size))
            db.commit()
    except sqlite3.IntegrityError:
        media_path.unlink(missing_ok=True)
        if thumb_name:
            (DATA / 'thumbs' / thumb_name).unlink(missing_ok=True)
        return False
    print(f'[REPLAY] Added {kind}: {path.name}', flush=True)
    return True


def watcher():
    # A file must retain its size and mtime for two scans to avoid partial imports.
    seen = {}
    while not STOP.is_set():
        try:
            current = set()
            for path in INCOMING.iterdir():
                if not path.is_file() or path.is_symlink() or path.suffix.lower() not in SUPPORTED:
                    continue
                current.add(path)
                stat = path.stat()
                signature = (stat.st_size, stat.st_mtime_ns)
                old = seen.get(path)
                if old and old[0] == signature and old[1] == 1:
                    # Import once after two stable scans; content hash protects duplicates.
                    ingest(path)
                    seen[path] = (signature, 2)
                elif old and old[0] == signature and old[1] == 2:
                    continue
                else:
                    seen[path] = (signature, 1 if old and old[0] == signature else 0)
            for missing in set(seen) - current:
                seen.pop(missing, None)
        except Exception as exc:
            print(f'[REPLAY] Watcher error: {exc}', flush=True)
        STOP.wait(POLL_SECONDS)


@asynccontextmanager
async def lifespan(app):
    setup()
    STOP.clear()
    thread = threading.Thread(target=watcher, daemon=True)
    thread.start()
    yield
    STOP.set()
    thread.join(timeout=5)


app = FastAPI(title='Striimaamo Replay – local demo', lifespan=lifespan)
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
app.mount('/static', StaticFiles(directory=STATIC), name='static')



@app.get('/')
def home():
    return FileResponse(STATIC / 'index.html')


@app.get('/api/health')
def health():
    return {'status': 'ok', 'mode': 'local-demo'}


@app.get('/api/manifest')
def manifest():
    with connect() as db:
        rows = db.execute('SELECT * FROM media ORDER BY created_at DESC, id DESC').fetchall()
    return {'event': 'Striimaamo Replay – testitapahtuma', 'count': len(rows), 'photos': [
        {'id': row['id'], 'filename': row['filename'], 'kind': row['kind'],
         'created_at': row['created_at'], 'captured_at': row['captured_at'],
         'camera': row['camera'], 'size_bytes': row['size_bytes'],
         'thumb': f"/api/thumb/{row['id']}" if row['thumb_file'] else None,
         'preview': f"/api/media/{row['id']}"}
        for row in rows]}


def lookup(uid):
    if not (len(uid) == 32 and all(c in '0123456789abcdef' for c in uid)):
        raise HTTPException(404)
    with connect() as db:
        row = db.execute('SELECT * FROM media WHERE id=?', (uid,)).fetchone()
    if not row:
        raise HTTPException(404)
    return row


@app.get('/api/thumb/{uid}')
def thumb(uid: str):
    row = lookup(uid)
    if not row['thumb_file']:
        raise HTTPException(404)
    return FileResponse(DATA / 'thumbs' / row['thumb_file'], media_type='image/jpeg')


@app.get('/api/media/{uid}')
def media(uid: str):
    row = lookup(uid)
    kind = 'video/mp4' if row['kind'] == 'video' else ('image/png' if row['media_file'].endswith('.png') else 'image/jpeg')
    return FileResponse(DATA / 'media' / row['media_file'], media_type=kind)

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000"
    ],
    allow_credentials=False,
    allow_methods=["GET"],
    allow_headers=["*"]
)
