import { FileUtils } from './file.utils';

describe('FileUtils', () => {
  describe('isImage', () => {
    it('should return true for image MIME types', () => {
      const file = new File([''], 'test.png', { type: 'image/png' });
      expect(FileUtils.isImage(file)).toBeTrue();
    });

    it('should return false for non-image MIME types', () => {
      const file = new File([''], 'test.pdf', { type: 'application/pdf' });
      expect(FileUtils.isImage(file)).toBeFalse();
    });
  });

  describe('isImageFile', () => {
    it('should identify image extensions correctly', () => {
      expect(FileUtils.isImageFile('photo.jpg')).toBeTrue();
      expect(FileUtils.isImageFile('image.PNG')).toBeTrue();
      expect(FileUtils.isImageFile('graphic.webp')).toBeTrue();
      expect(FileUtils.isImageFile('doc.pdf')).toBeFalse();
      expect(FileUtils.isImageFile('')).toBeFalse();
    });
  });

  describe('isPdfFile', () => {
    it('should identify PDF files correctly', () => {
      expect(FileUtils.isPdfFile('document.pdf')).toBeTrue();
      expect(FileUtils.isPdfFile('DOCUMENT.PDF')).toBeTrue();
      expect(FileUtils.isPdfFile('photo.jpg')).toBeFalse();
      expect(FileUtils.isPdfFile('')).toBeFalse();
    });
  });

  describe('getFileType', () => {
    it('should return uppercase extension or FILE', () => {
      expect(FileUtils.getFileType('archive.zip')).toBe('ZIP');
      expect(FileUtils.getFileType('noext')).toBe('NOEXT');
      expect(FileUtils.getFileType('')).toBe('FILE');
    });
  });

  describe('humanFileSize', () => {
    it('should format bytes to human readable string', () => {
      expect(FileUtils.humanFileSize(0)).toBe('0 B');
      expect(FileUtils.humanFileSize(500)).toBe('500.0 B');
      expect(FileUtils.humanFileSize(1024)).toBe('1.0 KB');
      expect(FileUtils.humanFileSize(1048576)).toBe('1.0 MB');
      expect(FileUtils.humanFileSize(1073741824)).toBe('1.0 GB');
    });
  });

  describe('getExtensionFromMimeType', () => {
    it('should map known MIME types to extensions', () => {
      expect(FileUtils.getExtensionFromMimeType('image/png')).toBe('png');
      expect(FileUtils.getExtensionFromMimeType('application/pdf')).toBe('pdf');
      expect(FileUtils.getExtensionFromMimeType('unknown/type')).toBe('');
    });
  });

  describe('getExtensionFromUrl', () => {
    it('should extract file extension from URL', () => {
      expect(FileUtils.getExtensionFromUrl('https://example.com/file.pdf?v=1')).toBe('pdf');
      expect(FileUtils.getExtensionFromUrl('https://example.com/image.png#top')).toBe('png');
      expect(FileUtils.getExtensionFromUrl('invalid-url')).toBe('');
    });
  });
});
