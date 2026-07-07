import sharp from 'sharp';

function toRgb565(r: number, g: number, b: number): number {
  return ((r & 0xf8) << 8) | ((g & 0xfc) << 3) | (b >> 3);
}

export async function pngBufferToRgb565(png: Buffer): Promise<Buffer> {
  const { data, info } = await sharp(png).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(info.width * info.height * 2);
  let offset = 0;
  for (let i = 0; i < data.length; i += info.channels) {
    const value = toRgb565(data[i]!, data[i + 1]!, data[i + 2]!);
    out.writeUInt16LE(value, offset);
    offset += 2;
  }
  return out;
}

export function pngToRgb565(png: Buffer): Promise<Buffer> {
  return pngBufferToRgb565(png);
}
