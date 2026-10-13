import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
import { createWorker } from 'tesseract.js';
import { parseFuelPriceText } from '../src/services/fuelPriceRules';

export async function sanitizePhoto(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer, { limitInputPixels: 24000000, animated: false });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error('Envie uma foto JPG, PNG ou WEBP.');
  // Re-encoding without withMetadata removes EXIF, GPS and original filename.
  return image.rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 85 }).toBuffer();
}

let ocrBusy = false;
export async function extractPrices(buffer: Buffer) {
  if (ocrBusy) return { prices: [], message: 'O leitor de fotos está ocupado. Você pode preencher os preços manualmente.' };
  ocrBusy = true;
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const require = createRequire(import.meta.url);
    const languagePath = path.join(path.dirname(require.resolve('@tesseract.js-data/eng/package.json')), '4.0.0_best_int');
    await fs.mkdir(process.env.OCR_CACHE_PATH || './data/ocr', { recursive: true });
    worker = await createWorker('eng', 1, { langPath: languagePath, cachePath: process.env.OCR_CACHE_PATH || './data/ocr', gzip: true });
    const result = await Promise.race([
      worker.recognize(buffer),
      new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('OCR timeout')), 30000); })
    ]);
    const prices = parseFuelPriceText(result.data.text);
    return { prices, message: prices.length ? 'Confira cada combustível e valor antes de confirmar.' : 'Não consegui ler valores com segurança. Preencha os preços manualmente.' };
  } catch {
    return { prices: [], message: 'Não consegui ler esta foto. Preencha os preços manualmente.' };
  } finally {
    if (timer) clearTimeout(timer);
    if (worker) await worker.terminate().catch(() => {});
    ocrBusy = false;
  }
}
