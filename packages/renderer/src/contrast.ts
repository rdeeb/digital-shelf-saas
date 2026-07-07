export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export function parseHexColor(hex: string): Rgb {
  const normalized = hex.replace('#', '');
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const transform = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
}

function contrastRatio(l1: number, l2: number): number {
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function pickTextColor(bg: Rgb): 'white' | 'black' {
  const bgLum = relativeLuminance(bg);
  const whiteContrast = contrastRatio(bgLum, relativeLuminance({ r: 255, g: 255, b: 255 }));
  const blackContrast = contrastRatio(bgLum, relativeLuminance({ r: 0, g: 0, b: 0 }));
  return whiteContrast >= blackContrast ? 'white' : 'black';
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (n: number) => n.toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}
