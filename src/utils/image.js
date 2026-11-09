import { fileTypeFromBuffer } from 'file-type';

const imageExtensions = new Map([
  ['image/jpeg', 'jpg'],
  ['image/png', 'png'],
  ['image/webp', 'webp']
]);

export async function detectAllowedImage(buffer) {
  const detected = await fileTypeFromBuffer(buffer);
  const extension = detected && imageExtensions.get(detected.mime);
  return extension ? { mime: detected.mime, extension } : null;
}
