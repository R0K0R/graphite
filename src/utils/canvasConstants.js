export const T_PAD = 20;
export const T_HDR = 40;
export const T_FW  = 380;
export const T_FH  = 355;
export const FOCUS_FILL = 0.9;

const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','svg','webp','ico','bmp','avif']);
const PDF_EXTS   = new Set(['pdf']);

export function fileNodeSize(filePath) {
  if (!filePath) return { w: T_FW, h: T_FH };
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
  if (PDF_EXTS.has(ext))   return { w: T_FW, h: 455 };
  if (IMAGE_EXTS.has(ext)) return { w: T_FW, h: 400 };
  return { w: T_FW, h: T_FH };
}
export const T_PAD = 20;
export const T_HDR = 40;
export const T_FW  = 380;
export const T_FH  = 355;
export const FOCUS_FILL = 0.9;

const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','svg','webp','ico','bmp','avif']);
const PDF_EXTS   = new Set(['pdf']);

export function fileNodeSize(filePath) {
  if (!filePath) return { w: T_FW, h: T_FH };
  const ext = filePath.slice(filePath.lastIndexOf('.') + 1).toLowerCase();
  if (PDF_EXTS.has(ext))   return { w: T_FW, h: 455 };
  if (IMAGE_EXTS.has(ext)) return { w: T_FW, h: 400 };
  return { w: T_FW, h: T_FH };
}
