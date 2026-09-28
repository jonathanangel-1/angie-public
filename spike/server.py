"""Garment service: the open-model pipeline over HTTP, for the app's live mode.

    python spike/server.py            # listens on 127.0.0.1:8765
    GARMENT_SERVICE_URL=http://127.0.0.1:8765 npm run dev

POST /understand   body: image bytes      -> {"garments": [...]} (crop as JPEG data URL + FashionCLIP embedding)
POST /similarity   {"embedding", "urls"}  -> {"scores": [...]}    (cosine similarity to each product photo)
Photos are processed in memory and never written to disk.
"""
from __future__ import annotations

import base64
import io
import json
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Lock

import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(__file__))
from garments import Models, jpeg_bytes, understand  # noqa: E402
from search import _thumb  # noqa: E402

MODELS = Models()
LOCK = Lock()  # the models are not re-entrant on CPU; one look at a time


class Handler(BaseHTTPRequestHandler):
    def _json(self, status, payload):
        body = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        length = int(self.headers.get('Content-Length') or 0)
        if length > 12 * 1024 * 1024:
            return self._json(413, {'error': 'image too large'})
        raw = self.rfile.read(length)
        try:
            if self.path == '/understand':
                image = Image.open(io.BytesIO(raw))
                with LOCK:
                    garments = understand(MODELS, image)
                return self._json(200, {'garments': [{
                    'id': f'g{i}-{g.slot}', 'slot': g.slot, 'attributes': {k: v for k, v in g.attributes.items() if not k.endswith('confidence')},
                    'query': g.query(), 'crop': 'data:image/jpeg;base64,' + base64.b64encode(jpeg_bytes(g.crop, 480)).decode(),
                    'embedding': [round(float(x), 5) for x in g.embedding],
                } for i, g in enumerate(garments)]})
            if self.path == '/similarity':
                data = json.loads(raw)
                embedding = np.array(data['embedding'], dtype=np.float32)
                with ThreadPoolExecutor(8) as pool:
                    thumbs = list(pool.map(_thumb, data['urls'][:40]))
                ok = [t for t in thumbs if t is not None]
                with LOCK:
                    sims = MODELS.image_embeddings(ok) @ embedding if ok else []
                it = iter(sims)
                return self._json(200, {'scores': [float(next(it)) if t is not None else None for t in thumbs]})
            return self._json(404, {'error': 'not found'})
        except Exception as error:  # a bad upload must not kill the service
            return self._json(400, {'error': str(error)[:200]})

    def log_message(self, *args):
        pass


if __name__ == '__main__':
    port = int(os.environ.get('PORT', 8765))
    print(f'garment service on http://127.0.0.1:{port}', flush=True)
    ThreadingHTTPServer(('127.0.0.1', port), Handler).serve_forever()
