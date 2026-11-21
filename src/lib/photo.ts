/** Skaliert ein Foto auf max. 800 px Kantenlänge und speichert es als JPEG (spart Platz in IndexedDB). */
export async function shrinkPhoto(file: File, maxEdge = 800): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Foto konnte nicht verarbeitet werden'))), 'image/jpeg', 0.85),
  );
}
