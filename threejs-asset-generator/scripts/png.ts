// scripts/png.ts: minimal zero-dependency PNG RGBA writer & 8-bit PNG reader using node:zlib.
// Lets qa-asset.ts, ref-compare.ts and ref-intake.ts write/read PNGs even when `sharp` is not installed.
import { writeFileSync } from 'node:fs';
import { deflateSync, inflateSync } from 'node:zlib';

const SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.allocUnsafe(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

export function encodePngRgba(rgba: Uint8Array, width: number, height: number): Buffer {
  if (rgba.length !== width * height * 4) throw new Error(`encodePngRgba: expected ${width * height * 4} bytes, got ${rgba.length}`);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit
  ihdr[9] = 6; // RGBA
  const stride = width * 4;
  const raw = Buffer.allocUnsafe(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const rowOff = y * (1 + stride);
    raw[rowOff] = 0; // filter None
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowOff + 1);
  }
  return Buffer.concat([SIG, chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export function writePngRgba(file: string, rgba: Uint8Array, width: number, height: number): void {
  writeFileSync(file, encodePngRgba(rgba, width, height));
}

export function scaleNearestRgba(rgba: Uint8Array, width: number, height: number, scale: number): Uint8Array {
  const s = Math.max(1, Math.round(scale)), ow = width * s, oh = height * s;
  const out = new Uint8Array(ow * oh * 4);
  for (let y = 0; y < oh; y++) {
    const sy = Math.floor(y / s);
    for (let x = 0; x < ow; x++) {
      const si = (sy * width + Math.floor(x / s)) * 4, di = (y * ow + x) * 4;
      out[di] = rgba[si]; out[di + 1] = rgba[si + 1]; out[di + 2] = rgba[si + 2]; out[di + 3] = rgba[si + 3];
    }
  }
  return out;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decodes non-interlaced 8-bit PNG (Gray, RGB, Gray+Alpha, RGBA) into RGBA. Returns null for non-PNG or unsupported formats. */
export function decodePngRgba(buf: Buffer): { rgba: Uint8Array; width: number; height: number } | null {
  if (buf.length < 33 || !buf.subarray(0, 8).equals(SIG)) return null;
  let width = 0, height = 0, bitDepth = 0, colorType = -1, interlace = 0;
  const idats: Buffer[] = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (off + 12 + len > buf.length) return null;
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0); height = data.readUInt32BE(4);
      bitDepth = data[8]; colorType = data[9]; interlace = data[12];
    } else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  const bppMap: Record<number, number> = { 0: 1, 2: 3, 4: 2, 6: 4 };
  const bpp = bppMap[colorType];
  if (!width || !height || bitDepth !== 8 || !bpp || interlace !== 0 || !idats.length) return null;
  let inflated: Buffer;
  try { inflated = inflateSync(Buffer.concat(idats)); } catch { return null; }
  const stride = width * bpp;
  if (inflated.length < height * (1 + stride)) return null;

  const recon = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const f = inflated[y * (1 + stride)], srcOff = y * (1 + stride) + 1, dstOff = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = inflated[srcOff + x];
      const a = x >= bpp ? recon[dstOff + x - bpp] : 0;
      const b = y > 0 ? recon[dstOff - stride + x] : 0;
      const c = (x >= bpp && y > 0) ? recon[dstOff - stride + x - bpp] : 0;
      let v = raw;
      if (f === 1) v = (raw + a) & 255;
      else if (f === 2) v = (raw + b) & 255;
      else if (f === 3) v = (raw + ((a + b) >> 1)) & 255;
      else if (f === 4) v = (raw + paeth(a, b, c)) & 255;
      else if (f !== 0) return null;
      recon[dstOff + x] = v;
    }
  }

  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const di = i * 4, si = i * bpp;
    if (colorType === 6) { rgba[di] = recon[si]; rgba[di + 1] = recon[si + 1]; rgba[di + 2] = recon[si + 2]; rgba[di + 3] = recon[si + 3]; }
    else if (colorType === 2) { rgba[di] = recon[si]; rgba[di + 1] = recon[si + 1]; rgba[di + 2] = recon[si + 2]; rgba[di + 3] = 255; }
    else if (colorType === 4) { rgba[di] = rgba[di + 1] = rgba[di + 2] = recon[si]; rgba[di + 3] = recon[si + 1]; }
    else { rgba[di] = rgba[di + 1] = rgba[di + 2] = recon[si]; rgba[di + 3] = 255; }
  }
  return { rgba, width, height };
}
