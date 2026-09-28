// Local, dependency-free image descriptor: garment silhouette + colour.
// It works on clean product shots and flat-lays. It is not a substitute for a
// CLIP-class embedding on street photos; see DECISION.md. Vectors from different
// versions must never be compared, so the version is stored with every vector.
export const EMBEDDER_VERSION = 'silhouette-color-v1';

export type Pixels = { width: number; height: number; data: ArrayLike<number> };
export type ImageFeatures = {
  version: string;
  shape: number[];
  aspect: number;
  color: number[];
  colorName: string;
  foreground: number;
};

const SAMPLE = 96;
const GRID = 12;
const HUE_BINS = 12;
const LIGHT_BINS = 5;
const BACKGROUND_DELTA = 6;

type Lab = [number, number, number];

function toLinear(channel: number) {
  const c = channel / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function rgbToLab(r: number, g: number, b: number): Lab {
  const [lr, lg, lb] = [toLinear(r), toLinear(g), toLinear(b)];
  const x = (lr * 0.4124 + lg * 0.3576 + lb * 0.1805) / 0.95047;
  const y = lr * 0.2126 + lg * 0.7152 + lb * 0.0722;
  const z = (lr * 0.0193 + lg * 0.1192 + lb * 0.9505) / 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

const deltaE = (a: Lab, b: Lab) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function resample(pixels: Pixels) {
  const out: Array<Lab | null> = new Array(SAMPLE * SAMPLE);
  const sx = pixels.width / SAMPLE, sy = pixels.height / SAMPLE;
  for (let y = 0; y < SAMPLE; y++) for (let x = 0; x < SAMPLE; x++) {
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    // Average every source pixel: skipping any lets a thin outline disappear.
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) {
      const i = (yy * pixels.width + xx) * 4;
      r += pixels.data[i]; g += pixels.data[i + 1]; b += pixels.data[i + 2]; a += pixels.data[i + 3]; n++;
    }
    out[y * SAMPLE + x] = a / n < 128 ? null : rgbToLab(r / n, g / n, b / n);
  }
  return out;
}

function solve3(m: number[][], v: number[]) {
  const det = (a: number[][]) => a[0][0] * (a[1][1] * a[2][2] - a[1][2] * a[2][1]) - a[0][1] * (a[1][0] * a[2][2] - a[1][2] * a[2][0]) + a[0][2] * (a[1][0] * a[2][1] - a[1][1] * a[2][0]);
  const d = det(m);
  if (Math.abs(d) < 1e-9) return [v[0] / Math.max(1, m[0][0]), 0, 0];
  return [0, 1, 2].map(column => det(m.map((row, r) => row.map((value, c) => (c === column ? v[r] : value)))) / d);
}

// Background colour as a plane over (x, y), fitted to the border, so studio
// gradients and uneven lighting stay background.
function backgroundModel(lab: Array<Lab | null>) {
  const points: Array<[number, number, Lab]> = [];
  for (let i = 0; i < SAMPLE; i++) for (const index of [i, (SAMPLE - 1) * SAMPLE + i, i * SAMPLE, i * SAMPLE + SAMPLE - 1]) {
    if (lab[index]) points.push([(index % SAMPLE) / SAMPLE, Math.floor(index / SAMPLE) / SAMPLE, lab[index]!]);
  }
  const normal = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
  for (const [x, y] of points) {
    const row = [1, x, y];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) normal[r][c] += row[r] * row[c];
  }
  const coefficients = [0, 1, 2].map(channel => {
    const rhs = [0, 0, 0];
    for (const [x, y, value] of points) { rhs[0] += value[channel]; rhs[1] += x * value[channel]; rhs[2] += y * value[channel]; }
    return solve3(normal, rhs);
  });
  return (index: number): Lab => {
    const x = (index % SAMPLE) / SAMPLE, y = Math.floor(index / SAMPLE) / SAMPLE;
    return coefficients.map(([a, b, c]) => a + b * x + c * y) as Lab;
  };
}

// Background = everything connected to the border without crossing an edge.
// Filling enclosed regions keeps a white tee with a thin outline as foreground.
function foregroundMask(lab: Array<Lab | null>) {
  const background = backgroundModel(lab);
  const isBackground = new Uint8Array(SAMPLE * SAMPLE);
  const queue: number[] = [];
  const visit = (index: number, from: Lab | null) => {
    if (isBackground[index]) return;
    const pixel = lab[index];
    if (pixel && (deltaE(pixel, background(index)) > BACKGROUND_DELTA || (from && deltaE(pixel, from) > BACKGROUND_DELTA))) return;
    isBackground[index] = 1; queue.push(index);
  };
  for (let i = 0; i < SAMPLE; i++) for (const index of [i, (SAMPLE - 1) * SAMPLE + i, i * SAMPLE, i * SAMPLE + SAMPLE - 1]) visit(index, null);
  while (queue.length) {
    const index = queue.pop()!; const x = index % SAMPLE, y = Math.floor(index / SAMPLE);
    const from = lab[index];
    if (x > 0) visit(index - 1, from);
    if (x < SAMPLE - 1) visit(index + 1, from);
    if (y > 0) visit(index - SAMPLE, from);
    if (y < SAMPLE - 1) visit(index + SAMPLE, from);
  }
  const mask = new Uint8Array(SAMPLE * SAMPLE);
  let count = 0;
  for (let i = 0; i < mask.length; i++) if (!isBackground[i] && lab[i]) { mask[i] = 1; count++; }
  if (count < SAMPLE * SAMPLE * 0.03) { mask.fill(1); count = mask.length; }
  return { mask, count };
}

function hueBin(a: number, b: number) {
  const hue = (Math.atan2(b, a) / (2 * Math.PI) + 1) % 1;
  return hue * HUE_BINS;
}

function normalize(vector: number[]) {
  const length = Math.hypot(...vector) || 1;
  return vector.map(value => value / length);
}

const PALETTE: Array<[string, [number, number, number]]> = [
  ['black', [28, 28, 30]], ['charcoal', [62, 62, 64]], ['grey', [140, 140, 138]], ['white', [248, 247, 243]],
  ['cream', [238, 229, 208]], ['beige', [214, 194, 160]], ['camel', [182, 138, 88]], ['brown', [106, 74, 48]],
  ['rust', [168, 82, 46]], ['red', [178, 38, 46]], ['pink', [228, 164, 180]], ['navy', [31, 42, 70]],
  ['blue', [62, 104, 164]], ['green', [58, 104, 72]], ['sage', [160, 176, 142]], ['olive', [108, 108, 58]],
  ['yellow', [226, 196, 90]], ['purple', [108, 76, 138]],
];
const PALETTE_LAB = PALETTE.map(([name, rgb]) => [name, rgbToLab(...rgb)] as const);

export function nameColor(lab: Lab) {
  return PALETTE_LAB.reduce((best, entry) => deltaE(entry[1], lab) < deltaE(best[1], lab) ? entry : best)[0];
}

export function describeImage(pixels: Pixels): ImageFeatures {
  const lab = resample(pixels);
  const { mask, count } = foregroundMask(lab);
  let minX = SAMPLE, minY = SAMPLE, maxX = 0, maxY = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i]) {
    const x = i % SAMPLE, y = Math.floor(i / SAMPLE);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const boxW = maxX - minX + 1, boxH = maxY - minY + 1;
  const shape = new Array(GRID * GRID).fill(0);
  const cells = new Array(GRID * GRID).fill(0);
  for (let y = minY; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
    const cell = Math.min(GRID - 1, Math.floor(((y - minY) / boxH) * GRID)) * GRID + Math.min(GRID - 1, Math.floor(((x - minX) / boxW) * GRID));
    cells[cell]++; shape[cell] += mask[y * SAMPLE + x];
  }
  for (let i = 0; i < shape.length; i++) shape[i] = cells[i] ? shape[i] / cells[i] : 0;

  const bins = HUE_BINS * LIGHT_BINS + LIGHT_BINS;
  const color = new Array(bins).fill(0);
  const binLab: Array<[number, number, number, number]> = Array.from({ length: bins }, () => [0, 0, 0, 0]);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || !lab[i]) continue;
    const [l, a, b] = lab[i]!;
    const lightness = Math.min(LIGHT_BINS - 1e-6, Math.max(0, l / (100 / LIGHT_BINS)));
    const chroma = Math.hypot(a, b);
    const lightIndex = Math.floor(lightness);
    let bin: number;
    if (chroma < 10) bin = HUE_BINS * LIGHT_BINS + lightIndex;
    else {
      const h = hueBin(a, b), h0 = Math.floor(h) % HUE_BINS, h1 = (h0 + 1) % HUE_BINS, w = h - Math.floor(h);
      color[lightIndex * HUE_BINS + h0] += 1 - w; color[lightIndex * HUE_BINS + h1] += w;
      bin = lightIndex * HUE_BINS + (w < 0.5 ? h0 : h1);
      const entry = binLab[bin]; entry[0] += l; entry[1] += a; entry[2] += b; entry[3]++;
      continue;
    }
    color[bin] += 1;
    const entry = binLab[bin]; entry[0] += l; entry[1] += a; entry[2] += b; entry[3]++;
  }
  const dominant = binLab.reduce((best, entry) => entry[3] > best[3] ? entry : best);
  const colorName = dominant[3] ? nameColor([dominant[0] / dominant[3], dominant[1] / dominant[3], dominant[2] / dominant[3]]) : 'unknown';
  const total = color.reduce((s, v) => s + v, 0) || 1;
  const aspect = (boxH * pixels.height) / (boxW * pixels.width);
  return {
    version: EMBEDDER_VERSION,
    shape: shape.map(v => Math.round(v * 1000) / 1000),
    aspect: Math.round(aspect * 1000) / 1000,
    color: normalize(color.map(v => Math.sqrt(v / total))).map(v => Math.round(v * 10000) / 10000),
    colorName,
    foreground: Math.round((count / mask.length) * 1000) / 1000,
  };
}

export function shapeSimilarity(a: ImageFeatures, b: ImageFeatures) {
  let difference = 0;
  for (let i = 0; i < a.shape.length; i++) difference += Math.abs(a.shape[i] - b.shape[i]);
  const grid = 1 - difference / a.shape.length;
  const aspect = Math.exp(-2 * Math.abs(Math.log(a.aspect / b.aspect)));
  return Math.max(0, Math.min(1, 0.8 * grid + 0.2 * aspect));
}

export function colorSimilarity(a: ImageFeatures, b: ImageFeatures) {
  let dot = 0;
  for (let i = 0; i < a.color.length; i++) dot += a.color[i] * b.color[i];
  return Math.max(0, Math.min(1, dot));
}
