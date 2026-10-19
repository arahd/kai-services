import { Injectable } from '@angular/core';
import { HttpResponse } from '@angular/common/http';

@Injectable({
  providedIn: 'root',
})
export class FileDownloadService {
  downloadFile(
    response: HttpResponse<Blob>,
    fallbackFilename: string = 'download',
  ): void {
    const blob = response.body;
    if (!blob) {
      console.error('Download error: Empty response body');
      return;
    }

    const filename = this.getFilenameFromResponse(response) || fallbackFilename;
    const url = window.URL.createObjectURL(blob);

    this.triggerBrowserDownload(url, filename);

    setTimeout(() => {
      window.URL.revokeObjectURL(url);
    }, 100);
  }

  async parseBlobError(error: any): Promise<any> {
    if (error.error instanceof Blob) {
      try {
        const text = await error.error.text();
        return JSON.parse(text);
      } catch (e) {
        return null; // Not JSON stringifiable
      }
    }
    return error.error;
  }

  private getFilenameFromResponse(response: HttpResponse<Blob>): string | null {
    const contentDisposition = response.headers.get('Content-Disposition');
    if (!contentDisposition) return null;

    const filenameUtf8Regex = /filename\*=UTF-8''([^;]+)/i;
    const filenameRegex = /filename="?([^";]+)"?/i;

    const utf8Match = contentDisposition.match(filenameUtf8Regex);
    if (utf8Match && utf8Match[1]) {
      return decodeURIComponent(utf8Match[1]);
    }

    const standardMatch = contentDisposition.match(filenameRegex);
    if (standardMatch && standardMatch[1]) {
      return standardMatch[1];
    }

    return null;
  }

  private triggerBrowserDownload(url: string, filename: string): void {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}
