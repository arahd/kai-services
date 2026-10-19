import { FileSizePipe } from './file-size.pipe';

describe('FileSizePipe', () => {
  let pipe: FileSizePipe;

  beforeEach(() => {
    pipe = new FileSizePipe();
  });

  it('should return "0 B" for null or undefined input', () => {
    expect(pipe.transform(null)).toBe('0 B');
    expect(pipe.transform(undefined)).toBe('0 B');
  });

  it('should format valid byte sizes correctly', () => {
    expect(pipe.transform(0)).toBe('0 B');
    expect(pipe.transform(1024)).toBe('1.0 KB');
    expect(pipe.transform(2048000)).toBe('2.0 MB');
  });
});
