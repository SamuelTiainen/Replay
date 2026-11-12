from io import BytesIO
from PIL import Image
from fastapi.testclient import TestClient
from app import main


def test_photo_ingest_and_manifest(tmp_path, monkeypatch):
    monkeypatch.setattr(main, 'DATA', tmp_path / 'data')
    monkeypatch.setattr(main, 'DB', tmp_path / 'data' / 'replay.sqlite3')
    monkeypatch.setattr(main, 'INCOMING', tmp_path / 'incoming')
    main.setup()
    photo = main.INCOMING / 'test.jpg'
    Image.new('RGB', (1200, 800), (80, 30, 160)).save(photo)
    assert main.ingest(photo)
    assert not main.ingest(photo)
    with TestClient(main.app) as client:
        result = client.get('/api/manifest')
        assert result.status_code == 200
        items = result.json()['photos']
        assert len(items) == 1 and items[0]['kind'] == 'photo'
        assert client.get(items[0]['thumb']).status_code == 200
        assert client.get(items[0]['preview']).status_code == 200
        assert client.get('/api/media/../../etc/passwd').status_code in (404, 422)
