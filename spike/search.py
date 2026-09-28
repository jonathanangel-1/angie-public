"""Where to look: Shopify Global Catalog (keyless, official agent endpoint).

Each garment is searched twice: by an attribute text query and by its masked
crop image ("find similar"). Results are merged by product, then re-ranked by
FashionCLIP similarity between the crop and each product photo.
Results are used live and never cached, per Shopify's catalog terms.
"""
from __future__ import annotations

import base64
import io
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
import requests
from PIL import Image

from garments import Garment, Models, jpeg_bytes

CATALOG = 'https://catalog.shopify.com/api/ucp/mcp'
PROFILE = 'https://shopify.dev/ucp/agent-profiles/2026-04-08/valid-with-capabilities.json'
session = requests.Session()
session.headers.update({'Content-Type': 'application/json', 'User-Agent': 'angie-spike/0.1 (+https://github.com/jonathanangel-1/angie-public)'})
calls: list[dict] = []


def _call(catalog: dict, kind: str) -> list[dict]:
    body = {'jsonrpc': '2.0', 'method': 'tools/call', 'id': 1,
            'params': {'name': 'search_catalog', 'arguments': {'meta': {'ucp-agent': {'profile': PROFILE}}, 'catalog': catalog}}}
    started = time.time()
    for attempt in range(3):
        response = session.post(CATALOG, json=body, timeout=30)
        if response.status_code != 429:
            break
        time.sleep(2 ** attempt)
    calls.append({'kind': kind, 'status': response.status_code, 'ms': int((time.time() - started) * 1000), 'bytes': len(response.content)})
    if not response.ok:
        return []
    result = response.json().get('result', {})
    return (result.get('structuredContent') or {}).get('products') or []


def _filters(budget_max: int | None):
    f = {'available': True, 'ships_to': {'country': 'US'}, 'attributes': [{'name': 'Target gender', 'values': ['Female']}]}
    if budget_max:
        f['price'] = {'max': budget_max * 100}
    return f


def text_search(query: str, limit=20, budget_max=None):
    return _call({'query': query, 'pagination': {'limit': limit}, 'context': {'address_country': 'US', 'currency': 'USD'}, 'filters': _filters(budget_max)}, 'text')


def image_search(crop: Image.Image, limit=20, budget_max=None):
    data = base64.b64encode(jpeg_bytes(crop)).decode()
    return _call({'like': [{'image': {'content_type': 'image/jpeg', 'data': data}}], 'pagination': {'limit': limit},
                  'context': {'address_country': 'US', 'currency': 'USD'}, 'filters': _filters(budget_max)}, 'image')


def normalize(product: dict, source: str) -> dict | None:
    variant = (product.get('variants') or [{}])[0]
    image = next((m['url'] for m in product.get('media', []) + variant.get('media', []) if m.get('type') == 'image'), None)
    price = variant.get('price') or (product.get('price_range') or {}).get('min')
    if not image or not variant.get('url') or not price:
        return None
    seller = variant.get('seller') or {}
    specs = (product.get('metadata') or {}).get('tech_specs') or []
    return {
        'id': product['id'], 'title': product.get('title', ''), 'brand': seller.get('name', ''), 'url': variant['url'],
        'price': price['amount'] / 100, 'currency': price.get('currency', 'USD'), 'image': image,
        'rating': (product.get('rating') or {}).get('value'), 'reviews': (product.get('rating') or {}).get('count'),
        'sizes': next((o['values'] for o in product.get('options', []) if o.get('name', '').lower() == 'size'), []),
        'fabric': next((s for s in (specs if isinstance(specs, list) else str(specs).split('\n')) if 'fabric' in s.lower() or '%' in s), ''),
        'sources': [source],
    }


import re  # noqa: E402

# Attribute guard: a result must be the same kind of garment as the crop.
SLOT_WORDS = {
    'outerwear': r'jacket|blazer|coat|trench|bomber|shacket|parka|puffer|biker|moto|overshirt',
    'top': r'\btops?\b|tee|t-shirt|shirt|blouse|cami|camisole|tank|bodysuit|sweater|knit|cardigan|corset|turtleneck|polo|halter|bustier',
    'skirt': r'skirt|skort',
    'pants': r'pants?\b|trouser|jeans?\b|legging|jogger|cargo|culotte|flare',
    'dress': r'dress|gown',
}
NOT_CLOTHING = r'earring|necklace|bracelet|ring\b|watch|band\b|bag|tote|purse|boot|shoe|sandal|heel|sneaker|scarf|belt|hat\b|sock|kids|girls?\b|baby|toddler|\bmen\b|men\'s|pattern\b|sewing|doll|costume'


def same_kind(slot: str, title: str) -> bool:
    t = title.lower()
    return bool(re.search(SLOT_WORDS[slot], t)) and not re.search(NOT_CLOTHING, t)


def _thumb(url: str) -> Image.Image | None:
    try:
        r = session.get(url + ('&' if '?' in url else '?') + 'width=320', timeout=15)
        r.raise_for_status()
        return Image.open(io.BytesIO(r.content)).convert('RGB')
    except Exception:
        return None


def find(models: Models, garment: Garment, limit=6, budget_max=None) -> list[dict]:
    with ThreadPoolExecutor(2) as pool:
        by_text = pool.submit(text_search, garment.query(), 20, budget_max)
        by_image = pool.submit(image_search, garment.crop, 20, budget_max)
        found = [(p, 'text') for p in by_text.result()] + [(p, 'image') for p in by_image.result()]
    merged: dict[str, dict] = {}
    for product, source in found:
        item = normalize(product, source)
        if not item:
            continue
        key = (item['brand'].lower(), item['title'].lower())
        existing = next((m for m in merged.values() if (m['brand'].lower(), m['title'].lower()) == key), None)
        if existing:
            existing['sources'] = sorted(set(existing['sources']) | {source})
        else:
            merged[item['id']] = item
    items = [i for i in merged.values() if same_kind(garment.slot, i['title'])]
    with ThreadPoolExecutor(8) as pool:
        thumbs = list(pool.map(_thumb, [i['image'] for i in items]))
    items = [i for i, t in zip(items, thumbs) if t is not None]
    thumbs = [t for t in thumbs if t is not None]
    if not items:
        return []
    embeddings = models.image_embeddings(thumbs)
    similarity = embeddings @ garment.embedding
    for item, sim in zip(items, similarity):
        item['visual_similarity'] = round(float(sim), 3)
        item['score'] = round(float(sim) + (0.02 if len(item['sources']) == 2 else 0), 3)
    items.sort(key=lambda i: -i['score'])
    return items[:limit]
