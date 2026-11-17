
"""Local-only photo/video gallery proof of concept; not a production storefront."""



from __future__ import annotations

import hashlib
import os
import sqlite3
import threading
import uuid
from contextlib import asynccontextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from pydantic import BaseModel

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError


ROOT = Path(__file__).resolve().parents[1]
DATA = Path(os.environ.get("REPLAY_DATA_DIR", str(ROOT / "data"))).resolve()
INCOMING = Path(os.environ.get("REPLAY_INCOMING_DIR", str(ROOT / "incoming"))).resolve()

DB = DATA / "replay.sqlite3"

PROJECT_ROOT = Path(__file__).resolve().parents[2]

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
    db.execute("PRAGMA foreign_keys = ON")
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

        db.execute("""
            CREATE TABLE IF NOT EXISTS events (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL UNIQUE,
                event_date TEXT,
                created_at TEXT NOT NULL
            )
        """)

        
        db.execute("""
            CREATE TABLE IF NOT EXISTS athletes (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                created_at TEXT NOT NULL
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS event_athletes (
                event_id TEXT NOT NULL,
                athlete_id TEXT NOT NULL,
                bib_number TEXT NOT NULL,
                PRIMARY KEY (event_id, athlete_id),
                UNIQUE (event_id, bib_number),
                FOREIGN KEY (event_id) REFERENCES events(id),
                FOREIGN KEY (athlete_id) REFERENCES athletes(id)
            )
        """)

        db.execute("""
            CREATE TABLE IF NOT EXISTS media_athletes (
                media_id TEXT NOT NULL,
                event_id TEXT NOT NULL,
                athlete_id TEXT NOT NULL,
                PRIMARY KEY (media_id, event_id, athlete_id),
                FOREIGN KEY (media_id) REFERENCES media(id),
                FOREIGN KEY (event_id, athlete_id)
                    REFERENCES event_athletes(event_id, athlete_id)
            )
        """)

        db.execute("""
            CREATE INDEX IF NOT EXISTS idx_athletes_name
            ON athletes(name)
        """)


        db.commit()
        link_media_to_athletes()

    print("[REPLAY] ROOT:", ROOT, flush=True)
    print("[REPLAY] DATA:", DATA, flush=True)
    print("[REPLAY] INCOMING:", INCOMING, flush=True)
    print("[REPLAY] INCOMING EXISTS:", INCOMING.exists(), flush=True)


def link_media_to_athletes():
    with connect() as db:
        media_rows = db.execute(
            "SELECT id, filename FROM media"
        ).fetchall()

        events = db.execute(
            "SELECT id, event_date FROM events WHERE event_date IS NOT NULL"
        ).fetchall()

        for media in media_rows:
            parts = Path(media["filename"]).stem.split("_")

            if len(parts) < 3:
                continue

            date_text = parts[0]
            bib_number = parts[1]

            if len(date_text) != 8 or not date_text.isdigit():
                continue

            try:
                media_date = datetime.strptime(
                    date_text, "%Y%m%d"
                ).date().isoformat()
            except ValueError:
                continue

            for event in events:
                if event["event_date"] != media_date:
                    continue

                athlete = db.execute(
                    """
                    SELECT athlete_id
                    FROM event_athletes
                    WHERE event_id = ? AND bib_number = ?
                    """,
                    (event["id"], bib_number)
                ).fetchone()

                if not athlete:
                    continue

                db.execute(
                    """
                    INSERT OR IGNORE INTO media_athletes
                    (media_id, event_id, athlete_id)
                    VALUES (?, ?, ?)
                    """,
                    (media["id"], event["id"], athlete["athlete_id"])
                )

        db.commit()

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
                # Päivitetään tietokannan tiedostonimi,
                # jos tiedosto on nimetty uudelleen.
                with connect() as db:
                    db.execute(
                        "UPDATE media SET filename=? WHERE id=?",
                        (path.name, existing["id"])
                    )
                    db.commit()

                print(
                    f"[REPLAY] Updated filename: {path.name}",
                    flush=True
                )

                link_media_to_athletes()
                
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

        link_media_to_athletes()

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
    "/assets",
    StaticFiles(directory=PROJECT_ROOT / "assets"),
    name="assets"
)

@app.get("/")
@app.get("/replay.html")
async def serve_replay():
    return FileResponse(PROJECT_ROOT / "replay.html")


@app.get("/media.html")
async def serve_media():
    return FileResponse(PROJECT_ROOT / "media.html")


@app.get("/header.html")
async def serve_header():
    return FileResponse(PROJECT_ROOT / "header.html")


@app.get("/footer.html")
async def serve_footer():
    return FileResponse(PROJECT_ROOT / "footer.html")

@app.get("/api/health")
def health():
    return {
        "status": "ok",
        "mode": "local-demo"
    }

@app.get("/api/events")
def get_events():
    with connect() as db:
        rows = db.execute(
            "SELECT id, name, event_date FROM events ORDER BY event_date DESC"
        ).fetchall()

    return {
        "events": [dict(row) for row in rows]
    }
class EventCreate(BaseModel):
    name: str
    event_date: date | None = None


@app.post("/api/events")
def create_event(event: EventCreate):
    name = event.name.strip()

    if not name:
        raise HTTPException(400, "Tapahtuman nimi puuttuu.")

    event_id = uuid.uuid4().hex
    created_at = datetime.now(timezone.utc).isoformat()

    try:
        with connect() as db:
            db.execute(
                """
                INSERT INTO events (id, name, event_date, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (
                    event_id,
                    name,
                    event.event_date.isoformat() if event.event_date else None,
                    created_at
                )
            )

    except sqlite3.IntegrityError:
        raise HTTPException(409, "Tämän niminen tapahtuma on jo olemassa.")

    return {
        "id": event_id,
        "name": name,
        "event_date": event.event_date.isoformat() if event.event_date else None
    }

class AthleteCreate(BaseModel):
    name: str
    bib_number: str


@app.post("/api/events/{event_id}/athletes")
def create_athlete(event_id: str, athlete: AthleteCreate):
    name = athlete.name.strip()
    bib_number = athlete.bib_number.strip()

    if not name or not bib_number:
        raise HTTPException(400, "Nimi tai kilpailunumero puuttuu.")

    with connect() as db:
        event = db.execute(
            "SELECT id FROM events WHERE id=?",
            (event_id,)
        ).fetchone()

        if not event:
            raise HTTPException(404, "Tapahtumaa ei löydy.")

        athlete_id = uuid.uuid4().hex
        created_at = datetime.now(timezone.utc).isoformat()

        try:
            db.execute(
                """
                INSERT INTO athletes (id, name, created_at)
                VALUES (?, ?, ?)
                """,
                (athlete_id, name, created_at)
            )

            db.execute(
                """
                INSERT INTO event_athletes
                (event_id, athlete_id, bib_number)
                VALUES (?, ?, ?)
                """,
                (event_id, athlete_id, bib_number)
            )

        except sqlite3.IntegrityError:
            raise HTTPException(
                409,
                "Tämä kilpailunumero on jo käytössä tässä tapahtumassa."
            )

    return {
        "id": athlete_id,
        "name": name,
        "bib_number": bib_number,
        "event_id": event_id
    }


@app.get("/api/events/{event_id}/athletes/media")
def get_athlete_media(event_id: str):
    with connect() as db:
        rows = db.execute(
            """
            SELECT
                a.name,
                ea.bib_number,
                COUNT(DISTINCT ma.media_id) AS media_count,
                GROUP_CONCAT(DISTINCT m.filename) AS filenames
            FROM event_athletes ea
            JOIN athletes a ON a.id = ea.athlete_id
            LEFT JOIN media_athletes ma
                ON ma.event_id = ea.event_id
                AND ma.athlete_id = ea.athlete_id
            LEFT JOIN media m ON m.id = ma.media_id
            WHERE ea.event_id = ?
            GROUP BY a.id, a.name, ea.bib_number
            ORDER BY ea.bib_number
            """,
            (event_id,)
        ).fetchall()

    return {
        "athletes": [dict(row) for row in rows]
    }


# Haetaan valitun tapahtuman osallistujat
@app.get("/api/events/{event_id}/athletes")
def get_event_athletes(event_id: str, search: str = ""):
    with connect() as db:
        rows = db.execute(
            """
            SELECT
                a.id,
                a.name,
                ea.bib_number
            FROM event_athletes ea
            JOIN athletes a ON a.id = ea.athlete_id
            WHERE ea.event_id = ?
            AND a.name LIKE ?
            ORDER BY a.name
            """,
            (event_id, f"%{search.strip()}%")
        ).fetchall()

    return {
        "athletes": [dict(row) for row in rows]
    }


# Haetaan valitun osallistujan kuvat ja videot
@app.get("/api/events/{event_id}/athletes/{athlete_id}/media")
def get_athlete_media_items(event_id: str, athlete_id: str):
    with connect() as db:
        rows = db.execute(
            """
            SELECT
                m.id,
                m.filename,
                m.kind,
                m.created_at,
                m.thumb_file
            FROM media_athletes ma
            JOIN media m ON m.id = ma.media_id
            WHERE ma.event_id = ?
            AND ma.athlete_id = ?
            ORDER BY m.created_at DESC
            """,
            (event_id, athlete_id)
        ).fetchall()

    media_items = []

    for row in rows:
        media_items.append({
            "id": row["id"],
            "filename": row["filename"],
            "kind": row["kind"],
            "created_at": row["created_at"],
            "thumb": (
                f"/api/thumb/{row['id']}"
                if row["thumb_file"] else None
            ),
            "preview": f"/api/media/{row['id']}"
        })

    return {
        "media": media_items
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