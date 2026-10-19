/**
 * Static utility class for file-related operations.
 *
 * Consolidates helpers that were previously duplicated across:
 * - AttachmentService (isImage, isPdfFile, isImageFile, getFileType, humanFileSize)
 * - UserMessageComponent (isImageFile, isPdfFile, getFileType)
 * - PromptComposerComponent (isImageFile)
 * - ClipboardShareService (getExtensionFromMimeType)
 */
export class FileUtils {

  private static readonly IMAGE_EXTENSIONS = /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i;
  private static readonly PDF_EXTENSION = /\.pdf$/i;

  /** Check if a File object is an image by its MIME type. */
  static isImage(file: File): boolean {
    return file.type.startsWith('image/');
  }

  /** Check if a filename has an image extension. */
  static isImageFile(fileName: string): boolean {
    return FileUtils.IMAGE_EXTENSIONS.test(fileName || '');
  }

  /** Check if a filename has a PDF extension. */
  static isPdfFile(fileName: string): boolean {
    return FileUtils.PDF_EXTENSION.test(fileName || '');
  }

  /** Check if a filename has a Word document extension (.doc, .docx). */
  static isWordFile(fileName: string): boolean {
    return /\.(docx?)$/i.test(fileName || '');
  }

  /** Check if a filename has an Excel / spreadsheet extension (.xls, .xlsx, .csv). */
  static isSpreadsheetFile(fileName: string): boolean {
    return /\.(xlsx?|csv)$/i.test(fileName || '');
  }

  /** Check if a filename has a PowerPoint presentation extension (.ppt, .pptx). */
  static isPresentationFile(fileName: string): boolean {
    return /\.(pptx?)$/i.test(fileName || '');
  }

  /** Get the appropriate icon name for a file based on its extension */
  static getFileIconName(fileName: string): string {
    if (!fileName) return 'document';
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    if (ext === 'ppt' || ext === 'pptx') return 'presentation';
    if (ext === 'xls' || ext === 'xlsx' || ext === 'csv') return 'spreadsheet';
    if (ext === 'doc' || ext === 'docx') return 'word-doc';
    if (ext === 'pdf') return 'pdf-doc';
    return 'document';
  }

  /** Get the uppercase extension label from a filename (e.g. 'PDF', 'DOCX'). */
  static getFileType(fileName: string): string {
    if (!fileName) return 'FILE';
    const ext = fileName.split('.').pop();
    return ext ? ext.toUpperCase() : 'FILE';
  }

  /** Format bytes into a human-readable string (e.g. '2.4 MB'). */
  static humanFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    const thresh = 1024;
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let u = 0;
    let b = bytes;
    while (b >= thresh && u < units.length - 1) {
      b /= thresh;
      u++;
    }
    return `${b.toFixed(1)} ${units[u]}`;
  }

  /** Map a MIME type to its common file extension. */
  static getExtensionFromMimeType(type: string): string {
    const map: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
      'application/vnd.ms-powerpoint': 'ppt',
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    };
    return map[type] || '';
  }

  /** Extract extension from a URL string. */
  static getExtensionFromUrl(url: string): string {
    try {
      const cleanUrl = url.split('?')[0].split('#')[0];
      const parts = cleanUrl.split('.');
      return parts.length > 1 ? parts.pop() || '' : '';
    } catch {
      return '';
    }
  }
}
