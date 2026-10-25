/**
 * Post-build CSS modernizer for older Android WebViews.
 *
 * Tailwind CSS v4 emits `@layer` and `@property` which require Chrome 99+.
 * Older Samsung Galaxy Tab WebViews (One UI < 6, Android <= 13) can silently
 * drop rules inside unsupported at-rules.
 *
 * This script safely unwraps `@layer` blocks (preserving balanced braces)
 * and safely strips `@property` definitions so that legacy WebViews parse
 * all styles cleanly without any syntax errors.
 */
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');
const assetsDir = path.join(distDir, 'assets');

if (!fs.existsSync(assetsDir)) {
  console.error('[css-modernize] dist/assets not found — run `vite build` first');
  process.exit(1);
}

function unwrapAtLayers(css) {
  let result = '';
  let i = 0;
  let layerCount = 0;
  while (i < css.length) {
    // Match bare layer list like: @layer properties; or @layer theme, base, utilities;
    const bareLayer = css.slice(i).match(/^@layer\s+[^;{]+;\s*/);
    if (bareLayer) {
      i += bareLayer[0].length;
      layerCount++;
      continue;
    }

    // Match block layer like: @layer properties { ... }
    const layerBlock = css.slice(i).match(/^@layer(?:\s+[^{]+)?\s*\{/);
    if (layerBlock) {
      layerCount++;
      i += layerBlock[0].length;
      let depth = 1;
      let inner = '';
      while (i < css.length && depth > 0) {
        const c = css[i];
        if (c === '{') depth++;
        else if (c === '}') {
          depth--;
          if (depth === 0) {
            i++;
            break;
          }
        }
        inner += c;
        i++;
      }
      result += inner;
    } else {
      result += css[i];
      i++;
    }
  }
  return { css: result, count: layerCount };
}

function stripAtProperties(css) {
  let result = '';
  let i = 0;
  let propCount = 0;
  while (i < css.length) {
    const propMatch = css.slice(i).match(/^@property\s+[^{]+\{/);
    if (propMatch) {
      propCount++;
      i += propMatch[0].length;
      let depth = 1;
      while (i < css.length && depth > 0) {
        if (css[i] === '{') depth++;
        else if (css[i] === '}') depth--;
        i++;
      }
    } else {
      result += css[i];
      i++;
    }
  }
  return { css: result, count: propCount };
}

function sanitizeOklch(css) {
  // Safe oklch fallback if any remain
  let count = 0;
  const out = css.replace(/oklch\(([^)]+)\)/g, (_m, args) => {
    count++;
    try {
      const [main, alphaRaw] = args.split('/').map((s) => s.trim());
      const parts = main.split(/\s+/).filter(Boolean);
      if (parts.length < 3) return '#10b981';
      const l = parseFloat(parts[0]) / (parts[0].includes('%') ? 100 : 1);
      const c = parseFloat(parts[1]);
      const h = (parseFloat(parts[2]) * Math.PI) / 180;
      const alpha = alphaRaw !== undefined ? parseFloat(alphaRaw) : 1;

      // Oklab to linear sRGB
      const a = c * Math.cos(h);
      const b = c * Math.sin(h);
      const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
      const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
      const s_ = l - 0.0894841775 * a - 1.291485548 * b;
      const lLin = l_ ** 3;
      const mLin = m_ ** 3;
      const sLin = s_ ** 3;
      const rLin = 4.0767416621 * lLin - 3.3077115913 * mLin + 0.2309699292 * sLin;
      const gLin = -1.2684380046 * lLin + 2.6097574011 * mLin - 0.3413193965 * sLin;
      const bLin = -0.0041960863 * lLin - 0.7034186147 * mLin + 1.707614701 * sLin;

      // Gamma compression
      const toGamma = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(Math.max(0, x), 1 / 2.4) - 0.055);
      const r = Math.round(Math.max(0, Math.min(255, toGamma(rLin) * 255)));
      const g = Math.round(Math.max(0, Math.min(255, toGamma(gLin) * 255)));
      const bl = Math.round(Math.max(0, Math.min(255, toGamma(bLin) * 255)));

      if (isNaN(r) || isNaN(g) || isNaN(bl)) return '#10b981';
      if (alpha < 1 && !isNaN(alpha)) {
        return `rgba(${r}, ${g}, ${bl}, ${alpha})`;
      }
      return '#' + [r, g, bl].map((v) => v.toString(16).padStart(2, '0')).join('');
    } catch {
      return '#10b981';
    }
  });
  return { css: out, count };
}

const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css'));
let totalLayers = 0;
let totalProperties = 0;
let totalOklch = 0;

for (const cssFile of cssFiles) {
  const file = path.join(assetsDir, cssFile);
  let css = fs.readFileSync(file, 'utf8');

  const layersRes = unwrapAtLayers(css);
  css = layersRes.css;
  totalLayers += layersRes.count;

  const propsRes = stripAtProperties(css);
  css = propsRes.css;
  totalProperties += propsRes.count;

  const oklchRes = sanitizeOklch(css);
  css = oklchRes.css;
  totalOklch += oklchRes.count;

  fs.writeFileSync(file, css, 'utf8');
  console.log(`[css-modernize] ${cssFile}: layers=${layersRes.count} properties=${propsRes.count} oklch=${oklchRes.count}`);
}

console.log(`[css-modernize] done — total: layers=${totalLayers} properties=${totalProperties} oklch=${totalOklch}`);
