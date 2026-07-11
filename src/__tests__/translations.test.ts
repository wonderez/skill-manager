import { describe, it, expect } from 'vitest';
import { TRANSLATIONS } from '../translations';

describe('TRANSLATIONS', () => {
  it('should have en and zh locales', () => {
    expect(TRANSLATIONS).toHaveProperty('en');
    expect(TRANSLATIONS).toHaveProperty('zh');
  });

  it('should have same keys in both locales', () => {
    const enKeys = Object.keys(TRANSLATIONS.en).sort();
    const zhKeys = Object.keys(TRANSLATIONS.zh).sort();
    expect(enKeys).toEqual(zhKeys);
  });

  it('should have dashboard key', () => {
    expect(TRANSLATIONS.en.dashboard).toBe('Dashboard');
    expect(TRANSLATIONS.zh.dashboard).toBe('仪表盘');
  });
});
