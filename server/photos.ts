import sharp from 'sharp';

export async function sanitizePhoto(buffer: Buffer): Promise<Buffer> {
  const image = sharp(buffer, { limitInputPixels: 24000000, animated: false });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format || '') || (metadata.pages || 1) > 1) throw new Error('Envie uma foto JPG, PNG ou WEBP.');
  // Re-encoding without withMetadata removes EXIF, GPS and original filename.
  return image.rotate().resize(1600, 1600, { fit: 'inside', withoutEnlargement: true }).flatten({ background: '#fff' }).jpeg({ quality: 80 }).toBuffer();
}
