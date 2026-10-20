import { describe, it, expect } from 'vitest';
import { detectImageType } from './service.js';

describe('Validation du type réel des images', () => {
  it('reconnaît une signature PNG', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(detectImageType(png)?.mime).toBe('image/png');
  });

  it('reconnaît une signature JPEG', () => {
    const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0]);
    expect(detectImageType(jpg)?.mime).toBe('image/jpeg');
  });

  it('rejette un fichier non-image (ex. exécutable/texte déguisé)', () => {
    const fake = Buffer.from('MZ\x90\x00 fake exe', 'binary'); // en-tête PE
    expect(detectImageType(fake)).toBeNull();
    const text = Buffer.from('<script>alert(1)</script>', 'utf8');
    expect(detectImageType(text)).toBeNull();
  });
});
