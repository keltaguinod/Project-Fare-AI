// generate-icons.mjs — draw BiyaheOffline's PWA icons (jeepney on a green tile)
// as real PNG files, with no image libraries. Pure pixel math + Node's zlib.
// Run: node scripts/generate-icons.mjs
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "icons");
mkdirSync(outDir, { recursive: true });

// ---- tiny RGBA canvas ----
function canvas(size) {
  const px = new Uint8Array(size * size * 4);
  const set = (x, y, [r, g, b, a = 255]) => {
    x = x | 0;
    y = y | 0;
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    const i = (y * size + x) * 4;
    // alpha-blend onto existing
    const ia = a / 255;
    px[i] = px[i] * (1 - ia) + r * ia;
    px[i + 1] = px[i + 1] * (1 - ia) + g * ia;
    px[i + 2] = px[i + 2] * (1 - ia) + b * ia;
    px[i + 3] = Math.max(px[i + 3], a);
  };
  const inRoundRect = (x, y, rx, ry, rw, rh, r) => {
    if (x < rx || y < ry || x > rx + rw || y > ry + rh) return false;
    const cx = Math.min(Math.max(x, rx + r), rx + rw - r);
    const cy = Math.min(Math.max(y, ry + r), ry + rh - r);
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r + 1e-9 || (x >= rx + r && x <= rx + rw - r) || (y >= ry + r && y <= ry + rh - r);
  };
  return {
    size,
    px,
    roundRect(rx, ry, rw, rh, r, color) {
      for (let y = Math.floor(ry); y <= ry + rh; y++)
        for (let x = Math.floor(rx); x <= rx + rw; x++)
          if (inRoundRect(x, y, rx, ry, rw, rh, r)) set(x, y, color);
    },
    circle(cx, cy, rad, color) {
      for (let y = Math.floor(cy - rad); y <= cy + rad; y++)
        for (let x = Math.floor(cx - rad); x <= cx + rad; x++)
          if ((x - cx) ** 2 + (y - cy) ** 2 <= rad * rad) set(x, y, color);
    },
    vGradient(rx, ry, rw, rh, r, top, bottom) {
      for (let y = Math.floor(ry); y <= ry + rh; y++) {
        const t = (y - ry) / rh;
        const c = [
          Math.round(top[0] + (bottom[0] - top[0]) * t),
          Math.round(top[1] + (bottom[1] - top[1]) * t),
          Math.round(top[2] + (bottom[2] - top[2]) * t),
          255,
        ];
        for (let x = Math.floor(rx); x <= rx + rw; x++) if (inRoundRect(x, y, rx, ry, rw, rh, r)) set(x, y, c);
      }
    },
  };
}

// ---- PNG encode (RGBA, 8-bit) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const typeBuf = Buffer.from(type, "latin1");
  const body = Buffer.concat([typeBuf, data]);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}
function encodePNG(size, px) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  // scanlines with filter byte 0
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    px.slice(y * size * 4, (y + 1) * size * 4).forEach((v, i) => {
      raw[y * (size * 4 + 1) + 1 + i] = v;
    });
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

// ---- draw the icon ----
function drawIcon(size) {
  const c = canvas(size);
  const s = (n) => n * size; // normalized → px
  const WHITE = [255, 255, 255, 255];
  const WIN = [11, 125, 59, 255];
  const TIRE = [21, 24, 31, 255];

  c.vGradient(0, 0, size - 1, size - 1, s(0.19), [15, 163, 79], [11, 125, 59]);
  // body
  c.roundRect(s(0.15), s(0.42), s(0.7), s(0.23), s(0.05), WHITE);
  c.roundRect(s(0.15), s(0.37), s(0.59), s(0.08), s(0.035), WHITE);
  c.roundRect(s(0.73), s(0.46), s(0.12), s(0.16), s(0.03), WHITE);
  // windows
  c.roundRect(s(0.2), s(0.405), s(0.11), s(0.07), s(0.015), WIN);
  c.roundRect(s(0.34), s(0.405), s(0.11), s(0.07), s(0.015), WIN);
  c.roundRect(s(0.48), s(0.405), s(0.11), s(0.07), s(0.015), WIN);
  // wheels
  c.circle(s(0.33), s(0.67), s(0.08), TIRE);
  c.circle(s(0.33), s(0.67), s(0.03), WHITE);
  c.circle(s(0.69), s(0.67), s(0.08), TIRE);
  c.circle(s(0.69), s(0.67), s(0.03), WHITE);
  return encodePNG(size, c.px);
}

for (const size of [192, 512]) {
  const buf = drawIcon(size);
  writeFileSync(join(outDir, `icon-${size}.png`), buf);
  console.log(`wrote icons/icon-${size}.png (${buf.length} bytes)`);
}
