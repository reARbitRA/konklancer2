/**
 * Post-build CSS modernizer for older Android WebViews.
 *
 * Tailwind CSS v4 emits `oklch()`, `color-mix()`, `@layer` and `@property`
 * which require Chrome 111+. Older Samsung Galaxy Tab WebViews (One UI < 6,
 * Android <= 13) silently fail to parse these and the whole stylesheet can
 * be dropped or mis-parsed — making the entire UI transparent/mis-styled.
 *
 * This script converts the built CSS to plain RGB/HEX + rgba() equivalents
 * that every WebView from Android 4.4 (API 19) can parse.
 */
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('[css-modernize] dist/assets not found — run `vite build` first');
  process.exit(1);
}

const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css'));
let totalOklch = 0;
let totalColorMix = 0;
let totalLayers = 0;
let totalProperties = 0;

for (const cssFile of cssFiles) {
  const file = path.join(assetsDir, cssFile);
  const css = fs.readFileSync(file, 'utf8');
  let out = css;

  // ---- 1. Strip @layer blocks: they only matter for cascade priority and
  //          are not needed when there is a single compiled stylesheet.
  //          Keep their contents (the declarations inside are preserved).
  const layerCount = (out.match(/@layer\s/g) || []).length;
  totalLayers += layerCount;
  out = out.replace(/@layer\s+[^{]*\{/g, '{');

  // ---- 2. Strip @property rules entirely (custom-property type declarations).
  const propertyCount = (out.match(/@property\s/g) || []).length;
  totalProperties += propertyCount;
  out = out.replace(/@property\s[^{]*\{[^}]*\}/g, '');

  // ---- 3. Convert oklch(...) to hex.
  //          oklch(L C H) → approximate sRGB hex via a standard oklch→rgb path.
  const oklchCount = (out.match(/oklch\(/g) || []).length;
  totalOklch += oklchCount;
  out = out.replace(/oklch\(([^)]+)\)/g, (_m, args) => {
    const parts = args.split('/').map((s) => s.trim());
    // Handle both oklch(L C H) and oklch(L% C H) / oklch(L C H / A)
    const [lRaw, cRaw, hRaw] = parts;
    const alpha = parts.length === 4 ? Number(parts[3]) : 1;
    const L = parseFloat(lRaw) / 100;
    const C = parseFloat(cRaw);
    const H = (parseFloat(hRaw) * Math.PI) / 180;
    const a = C * Math.cos(H);
    const b = C * Math.sin(H);
    const rgb = oklabToRgb(L, a, b);
    const hex = rgbToHex(rgb.r, rgb.g, rgb.b);
    if (alpha < 1) {
      return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
    }
    return hex;
  });

  // ---- 4. Convert color-mix(in srgb, X pct, Y pct) → rgba blend.
  //          Simplified: parse the two color operands and blend linearly.
  const colorMixCount = (out.match(/color-mix\(/g) || []).length;
  totalColorMix += colorMixCount;
  out = out.replace(/color-mix\(([^)]+)\)/g, (_m, args) => {
    const inner = args.replace(/^in\s+srgb\s*,?\s*/i, '').trim();
    const segments = splitColorOperands(inner);
    if (segments.length < 2) return 'transparent';
    const a = parseColor(segments[0]);
    const b = parseColor(segments[1]);
    if (!a || !b) return 'transparent';
    const pA = parsePercent(segments[0]);
    const pB = parsePercent(segments[1]);
    const t = pA === null || pB === null ? 0.5 : pA / (pA + pB);
    return rgba(a, b, t);
  });

  fs.writeFileSync(file, out, 'utf8');
  console.log(`[css-modernize] ${cssFile}: oklch=${oklchCount} color-mix=${colorMixCount} @layer=${layerCount} @property=${propertyCount}`);
}

console.log(`[css-modernize] done — total: oklch=${totalOklch} color-mix=${totalColorMix} @layer=${totalLayers} @property=${totalProperties}`);

// ================= helpers =================

function oklabToRgb(L, a, b) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return {
    r: clamp255(Math.round(r * 255)),
    g: clamp255(Math.round(g * 255)),
    b: clamp255(Math.round(bl * 255)),
  };
}

function clamp255(v) {
  return Math.max(0, Math.min(255, v));
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function splitColorOperands(inner) {
  // color-mix operands separated by commas at top level (ignore nested commas
  // inside oklch/rgb/hsl).
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of inner) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function parseColor(seg) {
  // Returns {r,g,b,a} from hex, rgb(), rgba(), oklch()
  const trimmed = seg.trim();
  if (trimmed.startsWith('#')) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 6 || hex.length === 8) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1,
      };
    }
  }
  const rgbMatch = trimmed.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(/[,/]/).map((x) => x.trim());
    return {
      r: Math.round(parseFloat(parts[0])),
      g: Math.round(parseFloat(parts[1])),
      b: Math.round(parseFloat(parts[2])),
      a: parts[3] !== undefined ? parseFloat(parts[3]) : 1,
    };
  }
  // fallback: oklch
  const oklchMatch = trimmed.match(/^oklch\(([^)]+)\)$/i);
  if (oklchMatch) {
    const parts = oklchMatch[1].split('/').map((x) => x.trim());
    const [lRaw, cRaw, hRaw] = parts;
    const L = parseFloat(lRaw) / 100;
    const C = parseFloat(cRaw);
    const H = (parseFloat(hRaw) * Math.PI) / 180;
    const a = C * Math.cos(H);
    const b = C * Math.sin(H);
    const rgb = oklabToRgb(L, a, b);
    return {
      r: rgb.r,
      g: rgb.g,
      b: rgb.b,
      a: parts.length === 4 ? parseFloat(parts[3]) : 1,
    };
  }
  return null;
}

function parsePercent(seg) {
  // Returns percentage as a fraction (0.5 for 50%).
  const pct = seg.match(/([\d.]+)%/);
  if (pct) return parseFloat(pct[1]) / 100;
  // bare number like "50" — Tailwind emits `color-mix(in oklab, c1, c2)` with
  // no percentages meaning 50/50.
  if (/^\d+$/.test(seg.trim())) return parseFloat(seg);
  return null;
}

function rgba(a, b, t) {
  const r = Math.round(a.r * t + b.r * (1 - t));
  const g = Math.round(a.g * t + b.g * (1 - t));
  const bl = Math.round(a.b * t + b.b * (1 - t));
  const alpha = a.a * t + b.a * (1 - t);
  if (alpha < 1) {
    return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
  }
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
