import { progressByFileSizes } from './upload-progress.util';

describe('upload-progress.util', () => {
  it('should return empty array if no file sizes provided', () => {
    expect(progressByFileSizes(100, 1000, [])).toEqual([]);
  });

  it('should return 0 array if total is 0 or loaded <= 0', () => {
    expect(progressByFileSizes(0, 1000, [500, 500])).toEqual([0, 0]);
    expect(progressByFileSizes(100, 0, [500, 500])).toEqual([0, 0]);
  });

  it('should return 0 array if sum of file sizes is 0', () => {
    expect(progressByFileSizes(100, 1000, [0, 0])).toEqual([0, 0]);
  });

  it('should calculate correct percentages sequentially', () => {
    // Total 1000 bytes, files 400 & 600
    // Loaded 200 => 50% of first file, 0% of second
    expect(progressByFileSizes(200, 1000, [400, 600])).toEqual([50, 0]);

    // Loaded 700 => 100% of first file, 50% of second
    expect(progressByFileSizes(700, 1000, [400, 600])).toEqual([100, 50]);

    // Loaded 1000 => 100% of both
    expect(progressByFileSizes(1000, 1000, [400, 600])).toEqual([100, 100]);
  });
});
