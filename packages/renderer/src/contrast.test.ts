import { describe, expect, it } from 'vitest';
import { pickTextColor, parseHexColor } from './contrast.js';

describe('contrast', () => {
  it('picks white text on dark backgrounds', () => {
    expect(pickTextColor(parseHexColor('#111111'))).toBe('white');
  });

  it('picks black text on light backgrounds', () => {
    expect(pickTextColor(parseHexColor('#eeeeee'))).toBe('black');
  });
});
