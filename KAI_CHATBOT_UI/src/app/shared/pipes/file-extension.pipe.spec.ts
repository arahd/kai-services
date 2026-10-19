import { FileExtensionPipe } from './file-extension.pipe';

describe('FileExtensionPipe', () => {
  let pipe: FileExtensionPipe;

  beforeEach(() => {
    pipe = new FileExtensionPipe();
  });

  it('should return uppercase extension', () => {
    expect(pipe.transform('document.pdf')).toBe('PDF');
    expect(pipe.transform('image.png')).toBe('PNG');
  });

  it('should handle null or empty inputs gracefully', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform(undefined)).toBe('');
    expect(pipe.transform('')).toBe('');
  });
});
