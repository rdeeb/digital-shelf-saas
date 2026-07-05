import sharp from 'sharp';
import { pickTextColor, parseHexColor, rgbToHex } from './contrast.js';

export interface ProcessedSpineArt {
  jpeg: Buffer;
  width: number;
  height: number;
  accentColor: string;
  spineTextColor: 'white' | 'black';
}

export async function processSpineArt(
  input: Buffer,
  options: { targetHeight: number },
): Promise<ProcessedSpineArt> {
  const rotated = sharp(input).rotate(90);
  const resized = await rotated.resize({ height: options.targetHeight }).jpeg().toBuffer({ resolveWithObject: true });

  const { data } = await sharp(resized.data)
    .resize(1, 1)
    .raw()
    .toBuffer({ resolveWithObject: true });

  const rgb = { r: data[0]!, g: data[1]!, b: data[2]! };
  const accentColor = rgbToHex(rgb);

  return {
    jpeg: resized.data,
    width: resized.info.width,
    height: resized.info.height,
    accentColor,
    spineTextColor: pickTextColor(parseHexColor(accentColor)),
  };
}
