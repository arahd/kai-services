/** Map overall multipart upload bytes to per-file progress (FormData append order). */
export function progressByFileSizes(
  loaded: number,
  total: number,
  fileSizesInOrder: number[],
): number[] {
  if (!fileSizesInOrder.length) return [];
  if (!total || loaded <= 0) return fileSizesInOrder.map(() => 0);

  const fileBytes = fileSizesInOrder.reduce((sum, size) => sum + size, 0);
  if (fileBytes <= 0) return fileSizesInOrder.map(() => 0);

  const effectiveLoaded = Math.min(loaded, total) * (fileBytes / total);
  let consumed = 0;

  return fileSizesInOrder.map((size) => {
    if (size <= 0) return 0;
    const start = consumed;
    consumed += size;
    if (effectiveLoaded <= start) return 0;
    if (effectiveLoaded >= consumed) return 100;
    return Math.round(((effectiveLoaded - start) / size) * 100);
  });
}
