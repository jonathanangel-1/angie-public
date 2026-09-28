"""Garment understanding for a look photo, with open-weight models only (no API key).

1. SegFormer-clothes labels every pixel (upper clothes, skirt, pants, dress, ...).
   It finds the main person and gives clean masks, but merges a jacket with the
   top under it.
2. Grounding-DINO (open-vocabulary detection) proposes boxes for "jacket", "top",
   "skirt"... inside the main person, which separates layers.
3. FashionCLIP describes each piece zero-shot (type, colour, pattern, fabric,
   silhouette, length, vibe) and embeds it for visual re-ranking.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field

import numpy as np
import torch
from PIL import Image
from scipy import ndimage
from transformers import (AutoModelForZeroShotObjectDetection, AutoProcessor, CLIPModel, CLIPProcessor,
                          SegformerForSemanticSegmentation, SegformerImageProcessor)

torch.set_num_threads(4)
SEG_ID = 'mattmdjaga/segformer_b2_clothes'
DINO_ID = 'IDEA-Research/grounding-dino-tiny'
CLIP_ID = 'patrickjohncyh/fashion-clip'
# SegFormer-clothes label ids.
UPPER, SKIRT, PANTS, DRESS, BELT, LSHOE, RSHOE, FACE, BAG, SCARF = 4, 5, 6, 7, 8, 9, 10, 11, 16, 17
PERSON_LABELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 17]

TYPES = {
    'top': ['t-shirt', 'blouse', 'button-down shirt', 'tank top', 'camisole', 'crop top', 'sweater', 'cardigan', 'corset top', 'turtleneck'],
    'outerwear': ['leather biker jacket', 'denim jacket', 'blazer', 'trench coat', 'wool coat', 'puffer jacket', 'bomber jacket', 'shacket', 'cropped jacket'],
    'skirt': ['mini skirt', 'midi skirt', 'maxi skirt', 'pleated skirt', 'pencil skirt', 'a-line skirt', 'slip skirt', 'denim skirt'],
    'pants': ['wide-leg trousers', 'straight-leg jeans', 'skinny jeans', 'leather pants', 'tailored trousers', 'cargo pants', 'flared jeans', 'shorts'],
    'dress': ['mini dress', 'midi dress', 'maxi dress', 'shirt dress', 'slip dress', 'wrap dress', 'bodycon dress', 'sweater dress', 'a-line dress', 'shift dress'],
}
PATTERNS = ['solid', 'floral print', 'striped', 'plaid', 'polka dot', 'animal print', 'graphic print', 'embroidered', 'geometric print']
FABRICS = ['leather', 'denim', 'knit', 'satin', 'silk', 'cotton', 'linen', 'lace', 'sequin', 'tweed', 'chiffon', 'wool', 'suede', 'jersey']
VIBES = ['casual', 'elegant', 'edgy', 'boho', 'minimalist', 'preppy', 'romantic', 'streetwear', 'glamorous']


@dataclass
class Garment:
    slot: str
    box: tuple[int, int, int, int]
    crop: Image.Image
    area: float
    attributes: dict = field(default_factory=dict)
    embedding: np.ndarray | None = None

    def query(self) -> str:
        a = self.attributes
        # Zero-shot pattern and fabric are noisy; only confident guesses shape the query.
        pattern = a['pattern'] if a['pattern'] != 'solid' and a['pattern_confidence'] >= 0.5 else ''
        fabric = a['fabric'] if a['fabric'] not in ('cotton', 'jersey') and a['fabric_confidence'] >= 0.5 else ''
        length = a.get('length', '') if a.get('length', '') not in a['type'] else ''
        return ' '.join(w for w in [a['color'].split(' and ')[0], pattern, fabric, length, a['type'], 'women'] if w)


class Models:
    def __init__(self):
        self.seg_proc = SegformerImageProcessor.from_pretrained(SEG_ID)
        self.seg = SegformerForSemanticSegmentation.from_pretrained(SEG_ID).eval()
        self.dino_proc = AutoProcessor.from_pretrained(DINO_ID)
        self.dino = AutoModelForZeroShotObjectDetection.from_pretrained(DINO_ID).eval()
        self.clip_proc = CLIPProcessor.from_pretrained(CLIP_ID)
        self.clip = CLIPModel.from_pretrained(CLIP_ID).eval()
        self._text_cache: dict[str, torch.Tensor] = {}

    @torch.no_grad()
    def segment(self, image: Image.Image) -> np.ndarray:
        inputs = self.seg_proc(images=image, return_tensors='pt')
        logits = self.seg(**inputs).logits
        up = torch.nn.functional.interpolate(logits, size=image.size[::-1], mode='bilinear', align_corners=False)
        return up.argmax(dim=1)[0].numpy()

    @torch.no_grad()
    def detect(self, image: Image.Image, prompt: str, threshold=0.3):
        inputs = self.dino_proc(images=image, text=prompt, return_tensors='pt')
        out = self.dino(**inputs)
        res = self.dino_proc.post_process_grounded_object_detection(out, inputs.input_ids, threshold=threshold, text_threshold=0.25, target_sizes=[image.size[::-1]])[0]
        return [(label, float(score), tuple(int(v) for v in box)) for label, score, box in zip(res['text_labels'] if 'text_labels' in res else res['labels'], res['scores'], res['boxes'].tolist())]

    @torch.no_grad()
    def image_embeddings(self, images: list[Image.Image]) -> np.ndarray:
        feats = self.clip.get_image_features(**self.clip_proc(images=images, return_tensors='pt'))
        return torch.nn.functional.normalize(feats, dim=-1).numpy()

    @torch.no_grad()
    def text_embeddings(self, texts: list[str]) -> torch.Tensor:
        missing = [t for t in texts if t not in self._text_cache]
        if missing:
            feats = self.clip.get_text_features(**self.clip_proc(text=missing, return_tensors='pt', padding=True))
            for t, f in zip(missing, torch.nn.functional.normalize(feats, dim=-1)):
                self._text_cache[t] = f
        return torch.stack([self._text_cache[t] for t in texts])

    def zero_shot(self, embedding: np.ndarray, options: list[str], template: str) -> tuple[str, float]:
        text = self.text_embeddings([template.format(o) for o in options])
        logits = torch.from_numpy(embedding) @ text.T * 100
        probs = logits.softmax(-1)
        i = int(probs.argmax())
        return options[i], float(probs[i])


PALETTE = {'black': (28, 28, 30), 'charcoal': (62, 62, 64), 'grey': (140, 140, 138), 'white': (245, 244, 240), 'cream': (236, 226, 204),
           'beige': (212, 190, 156), 'camel': (182, 138, 88), 'brown': (104, 72, 48), 'rust': (168, 82, 46), 'red': (180, 36, 44),
           'burgundy': (110, 30, 44), 'pink': (230, 166, 182), 'coral': (240, 128, 110), 'orange': (230, 130, 40), 'yellow': (228, 200, 90),
           'olive': (108, 108, 58), 'green': (58, 110, 72), 'sage': (160, 176, 142), 'light blue': (160, 190, 220), 'blue': (60, 104, 168),
           'denim blue': (80, 110, 150), 'navy': (30, 40, 70), 'purple': (110, 76, 140)}


def _lab(rgb: np.ndarray) -> np.ndarray:
    c = rgb.astype(np.float64) / 255
    c = np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
    xyz = c @ np.array([[0.4124, 0.2126, 0.0193], [0.3576, 0.7152, 0.1192], [0.1805, 0.0722, 0.9505]])
    xyz /= np.array([0.95047, 1.0, 1.08883])
    f = np.where(xyz > 0.008856, np.cbrt(xyz), 7.787 * xyz + 16 / 116)
    return np.stack([116 * f[:, 1] - 16, 500 * (f[:, 0] - f[:, 1]), 200 * (f[:, 1] - f[:, 2])], axis=1)


_PALETTE_LAB = {name: _lab(np.array([rgb]))[0] for name, rgb in PALETTE.items()}


def _name(lab: np.ndarray) -> str:
    return min(_PALETTE_LAB, key=lambda n: np.linalg.norm(_PALETTE_LAB[n] - lab))


def _kmeans(points: np.ndarray, k=2, iterations=12, seed=0):
    rng = np.random.default_rng(seed)
    centres = points[rng.choice(len(points), k, replace=False)]
    for _ in range(iterations):
        assign = np.argmin(((points[:, None] - centres[None]) ** 2).sum(-1), axis=1)
        centres = np.array([points[assign == j].mean(0) if (assign == j).any() else centres[j] for j in range(k)])
    return assign, centres


def dominant_color(image: Image.Image, mask: np.ndarray) -> str:
    """Measured from the garment's own pixels; zero-shot colour is unreliable on prints."""
    pixels = np.array(image)[mask]
    if len(pixels) > 6000:
        pixels = pixels[np.random.default_rng(0).choice(len(pixels), 6000, replace=False)]
    lab = _lab(pixels)
    assign, centres = _kmeans(lab, 3)
    shares = np.bincount(assign, minlength=3) / len(assign)
    order = np.argsort(-shares)
    first, second = order[0], order[1]
    main = _name(centres[first])
    if shares[second] > 0.3 and np.linalg.norm(centres[first] - centres[second]) > 30:
        other = _name(centres[second])
        if other != main:
            return f'{main} and {other}'
    return main


def _main_person_box(models: 'Models', image: Image.Image):
    people = models.detect(image, 'person.', 0.3)
    if not people:
        return (0, 0, image.width, image.height)
    def score(d):
        x0, y0, x1, y1 = d[2]
        centrality = 1 - abs((x0 + x1) / 2 / image.width - 0.5)
        return d[1] * (x1 - x0) * (y1 - y0) * centrality
    x0, y0, x1, y1 = max(people, key=score)[2]
    pad = int(0.04 * image.width)
    return max(0, x0 - pad), max(0, y0 - pad), min(image.width, x1 + pad), min(image.height, y1 + pad)


def _largest(mask: np.ndarray) -> np.ndarray:
    comp, n = ndimage.label(mask)
    if n <= 1:
        return mask
    sizes = ndimage.sum(mask, comp, range(1, n + 1))
    return comp == (int(np.argmax(sizes)) + 1)


def _masked_crop(image: Image.Image, mask: np.ndarray, box) -> Image.Image:
    x0, y0, x1, y1 = box
    arr = np.array(image)
    out = np.full_like(arr, 255)
    out[mask] = arr[mask]
    return Image.fromarray(out[y0:y1, x0:x1])


def _box(mask: np.ndarray, pad=6):
    ys, xs = np.nonzero(mask)
    h, w = mask.shape
    return int(max(0, xs.min() - pad)), int(max(0, ys.min() - pad)), int(min(w, xs.max() + pad)), int(min(h, ys.max() + pad))


def _split_layers(image: Image.Image, upper: np.ndarray):
    """An open jacket over a top shows as two colour regions: a narrow central
    one (the top) framed by a wider one (the jacket). Heuristic, not a model."""
    ys, xs = np.nonzero(upper)
    if len(xs) < 800:
        return None
    lab = _lab(np.array(image)[upper])
    assign, centres = _kmeans(lab, 2)
    if np.linalg.norm(centres[0] - centres[1]) < 28:
        return None
    shares = np.bincount(assign, minlength=2) / len(assign)
    if shares.min() < 0.12:
        return None
    spread = [xs[assign == j].std() for j in range(2)]
    centre_x = (xs.min() + xs.max()) / 2
    offset = [abs(xs[assign == j].mean() - centre_x) for j in range(2)]
    inner = int(np.argmin(spread))
    if spread[inner] > 0.75 * spread[1 - inner] or offset[inner] > 0.12 * (xs.max() - xs.min()):
        return None
    top = np.zeros_like(upper)
    top[ys[assign == inner], xs[assign == inner]] = True
    top = ndimage.binary_fill_holes(ndimage.binary_closing(_largest(ndimage.binary_opening(top, iterations=2)), iterations=4)) & upper
    # The jacket is everything else, so both open fronts stay one garment.
    return upper & ~top, top


def understand(models: Models, image: Image.Image) -> list[Garment]:
    image = image.convert('RGB')
    image.thumbnail((900, 900))
    person_box = _main_person_box(models, image)
    image = image.crop(person_box)
    labels = models.segment(image)
    person = _largest(ndimage.binary_closing(np.isin(labels, PERSON_LABELS), iterations=2))
    total = person.sum() or 1
    found: list[tuple[str, np.ndarray]] = []
    for slot, ids in {'dress': [DRESS], 'skirt': [SKIRT], 'pants': [PANTS], 'upper': [UPPER]}.items():
        mask = _largest(ndimage.binary_opening(np.isin(labels, ids) & person, iterations=2))
        if mask.sum() >= 0.04 * total:
            found.append((slot, mask))
    upper = next((m for s, m in found if s == 'upper'), None)
    if upper is not None:
        layers = _split_layers(image, upper)
        if layers:
            found = [(s, m) for s, m in found if s != 'upper'] + [('outerwear', layers[0]), ('top', layers[1])]
    garments: list[Garment] = []
    for slot, mask in found:
        box = _box(mask)
        g = Garment(slot=slot, box=box, crop=_masked_crop(image, mask, box), area=float(mask.sum() / total))
        g.embedding = models.image_embeddings([g.crop])[0]
        if slot == 'upper':
            kind, _ = models.zero_shot(g.embedding, ['top or blouse', 'jacket or coat'], 'a photo of a {}')
            g.slot = 'outerwear' if kind == 'jacket or coat' else 'top'
        g.attributes = describe(models, g)
        g.attributes['color'] = dominant_color(image, mask)
        garments.append(g)
    order = {'dress': 0, 'outerwear': 1, 'top': 2, 'skirt': 3, 'pants': 4}
    return sorted(garments, key=lambda g: order[g.slot])


LENGTHS = {'dress': ['mini', 'knee-length', 'midi', 'maxi'], 'skirt': ['mini', 'knee-length', 'midi', 'maxi']}


def describe(models: Models, g: Garment) -> dict:
    e = g.embedding
    kind, kind_p = models.zero_shot(e, TYPES[g.slot], 'a photo of a {}')
    pattern, pattern_p = models.zero_shot(e, PATTERNS, 'a photo of a {} garment')
    fabric, fabric_p = models.zero_shot(e, FABRICS, 'a photo of a {} garment')
    vibe, _ = models.zero_shot(e, VIBES, 'a {} outfit')
    out = {'type': kind, 'type_confidence': round(kind_p, 2), 'pattern': pattern, 'pattern_confidence': round(pattern_p, 2),
           'fabric': fabric, 'fabric_confidence': round(fabric_p, 2), 'vibe': vibe}
    if g.slot in LENGTHS:
        out['length'], _ = models.zero_shot(e, LENGTHS[g.slot], 'a photo of a {} ' + g.slot)
    return out


def jpeg_bytes(image: Image.Image, max_side=640) -> bytes:
    im = image.copy()
    im.thumbnail((max_side, max_side))
    buf = io.BytesIO()
    im.save(buf, format='JPEG', quality=88)
    return buf.getvalue()
