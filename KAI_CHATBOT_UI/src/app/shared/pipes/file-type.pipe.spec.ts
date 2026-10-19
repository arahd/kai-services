import { FileTypePipe } from './file-type.pipe';

describe('FileTypePipe', () => {
  let pipe: FileTypePipe;

  beforeEach(() => {
    pipe = new FileTypePipe();
  });

  it('should resolve file type via FileUtils', () => {
    expect(pipe.transform('test.docx')).toBe('DOCX');
    expect(pipe.transform('report.pdf')).toBe('PDF');
  });

  it('should return default FILE for empty or null input', () => {
    expect(pipe.transform(null)).toBe('FILE');
    expect(pipe.transform(undefined)).toBe('FILE');
  });
});
