"""Run the v3 pipeline on real public look photos and write evidence.

    python spike/run_spike.py <out_dir>

Photos are downloaded from Wikimedia Commons at run time (see photos.json for
source and license). They are not committed to this repository.
"""
from __future__ import annotations

import io
import json
import os
import resource
import sys
import time

import requests
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(__file__))
import search  # noqa: E402
from garments import Models, understand  # noqa: E402

HERE = os.path.dirname(__file__)
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/spike-out'
os.makedirs(OUT, exist_ok=True)
UA = {'User-Agent': 'angie-spike/0.1 (+https://github.com/jonathanangel-1/angie-public)'}


def font(size):
    for path in ['/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', '/usr/share/fonts/dejavu/DejaVuSans.ttf']:
        if os.path.exists(path):
            return ImageFont.truetype(path, size)
    return ImageFont.load_default()


def sheet(photo, image, garments, matches, path):
    W, row_h, thumb = 1500, 250, 190
    height = 60 + max(560, row_h * len(garments)) + 40
    canvas = Image.new('RGB', (W, height), 'white')
    d = ImageDraw.Draw(canvas)
    d.text((16, 14), f"{photo['title']}  ·  {photo['license']}  ·  {photo['author']}", fill='black', font=font(15))
    d.text((16, 36), photo['page'], fill=(90, 90, 90), font=font(12))
    look = image.copy(); look.thumbnail((360, 540)); canvas.paste(look, (16, 64))
    for r, (g, items) in enumerate(zip(garments, matches)):
        y = 64 + r * row_h
        crop = g.crop.copy(); crop.thumbnail((150, thumb)); canvas.paste(crop, (400, y))
        a = g.attributes
        d.text((400, y + thumb + 4), g.slot.upper(), fill='black', font=font(13))
        d.text((400, y + thumb + 20), a['color'][:24], fill=(60, 60, 60), font=font(11))
        d.text((560, y), f"{a['type']} · {a.get('length', '')} · {a['pattern']} · {a['vibe']}", fill='black', font=font(12))
        d.text((560, y + 16), f"query: \"{g.query()}\"", fill=(90, 90, 90), font=font(11))
        for c, item in enumerate(items[:5]):
            x = 560 + c * 186
            try:
                im = search._thumb(item['image']); im.thumbnail((170, 150)); canvas.paste(im, (x, y + 36))
            except Exception:
                pass
            d.text((x, y + 190), f"{item['brand'][:22]}", fill='black', font=font(11))
            d.text((x, y + 204), f"${item['price']:.0f} · sim {item['visual_similarity']:.2f} · {'+'.join(item['sources'])}", fill=(60, 60, 60), font=font(10))
            d.text((x, y + 218), item['title'][:28], fill=(90, 90, 90), font=font(10))
    canvas.save(path)


def main():
    photos = json.load(open(os.path.join(HERE, 'photos.json')))
    started = time.time(); models = Models(); load_s = time.time() - started
    results = []
    for n, photo in enumerate(photos, 1):
        image = Image.open(io.BytesIO(requests.get(photo['download'], headers=UA, timeout=60).content)).convert('RGB')
        image.thumbnail((900, 900))
        search.calls.clear()
        t0 = time.time(); cpu0 = time.process_time()
        garments = understand(models, image)
        t1 = time.time(); cpu1 = time.process_time()
        matches = [search.find(models, g) for g in garments]
        t2 = time.time(); cpu2 = time.process_time()
        slug = f"spike_{n:02d}_{photo['slug']}"
        sheet(photo, image, garments, matches, os.path.join(OUT, slug + '.png'))
        results.append({
            'photo': {k: photo[k] for k in ('title', 'page', 'license', 'author')},
            'garments': [{'slot': g.slot, 'box': g.box, 'attributes': g.attributes, 'query': g.query(), 'matches': m} for g, m in zip(garments, matches)],
            'timing': {'understand_s': round(t1 - t0, 2), 'search_and_rerank_s': round(t2 - t1, 2), 'cpu_understand_s': round(cpu1 - cpu0, 2), 'cpu_search_s': round(cpu2 - cpu1, 2)},
            'catalog_calls': list(search.calls),
        })
        print(slug, [(g.slot, g.query()) for g in garments], results[-1]['timing'], flush=True)
    summary = {
        'pipeline': {'segmentation': 'mattmdjaga/segformer_b2_clothes', 'person_detection': 'IDEA-Research/grounding-dino-tiny', 'attributes_and_rerank': 'patrickjohncyh/fashion-clip',
                     'search': 'Shopify Global Catalog MCP (https://catalog.shopify.com/api/ucp/mcp), unauthenticated, text + image search', 'hardware': f'{os.cpu_count()} vCPU, CPU only'},
        'model_load_s': round(load_s, 1), 'peak_rss_mb': round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024),
        'paid_api_calls': 0, 'catalog_calls_total': sum(len(r['catalog_calls']) for r in results),
        'results': results,
    }
    json.dump(summary, open(os.path.join(OUT, 'spike_results.json'), 'w'), indent=1, default=str)


if __name__ == '__main__':
    main()
