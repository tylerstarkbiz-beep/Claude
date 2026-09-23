/**
 * Downscale a photo in the browser before upload. Phone photos are often 5–12 MB;
 * 1600px JPEG keeps them readable at ~300 KB so uploads work on a weak signal.
 */
export async function resizeImage(file: File, maxSize = 1600, quality = 0.8): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', quality);
}
