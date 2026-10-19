import { Injectable, inject } from '@angular/core';
import { ToastService } from '@core/services/toast.service';

@Injectable({
  providedIn: 'root'
})
export class ClipboardShareService {
  private readonly toastService = inject(ToastService);

  constructor() {}

  async copyBotMessage(msg: any, index: number, onCopied: (index: number, msg: string) => void) {
    try {
      const plainText = msg.html ? this.stripHtml(msg.html) : msg.message || '';

      if (
        !(
          window.ClipboardItem &&
          navigator.clipboard &&
          navigator.clipboard.write
        )
      ) {
        throw new Error('ClipboardItem not supported');
      }

      const clipboardData: Record<string, Blob> = {
        'text/plain': new Blob([plainText], { type: 'text/plain' }),
      };

      if (msg.html || (msg.images && msg.images.length > 0)) {
        const container = document.createElement('div');
        if (msg.html) container.innerHTML = msg.html;

        if (msg.images && msg.images.length > 0) {
          const imgContainer = document.createElement('div');
          msg.images.forEach((img: any) => {
            const imgEl = document.createElement('img');
            imgEl.src = img.url;
            imgEl.alt = img.name || 'Generated Image';
            imgEl.style.maxWidth = '100%';
            imgEl.style.marginTop = '10px';
            imgContainer.appendChild(imgEl);
          });
          container.appendChild(imgContainer);
        }

        let firstImageBlob: Blob | null = null;
        let firstImageType: string | null = null;

        const imgs = container.querySelectorAll('img');
        for (let i = 0; i < imgs.length; i++) {
          const img = imgs[i];
          try {
            if (img.src.startsWith('data:')) {
              if (!firstImageBlob) {
                const { blob, type } = this.dataURLToBlob(img.src);
                firstImageBlob = blob;
                firstImageType = type;
              }
            } else if (img.src.startsWith('http')) {
              const response = await fetch(img.src);
              const blob = await response.blob();

              const reader = new FileReader();
              const base64Url = await new Promise<string>((resolve) => {
                reader.onloadend = () => resolve(reader.result as string);
                reader.readAsDataURL(blob);
              });

              img.src = base64Url;

              if (!firstImageBlob) {
                firstImageBlob = blob;
                firstImageType = blob.type;
              }
            }
          } catch (e) {
            console.warn('Failed to process image for copying:', e);
          }
        }

        const finalHtml = container.innerHTML;
        clipboardData['text/html'] = new Blob([finalHtml], {
          type: 'text/html',
        });

        if (firstImageBlob && firstImageType !== 'image/png') {
          const pngBlob = await this.convertToPngBlob(firstImageBlob);
          if (pngBlob) {
            clipboardData['image/png'] = pngBlob;
          } else {
            console.warn(
              'convertToPngBlob failed to return a valid PNG. Injecting original blob instead, which might be rejected by strict clipboards.'
            );
            clipboardData[firstImageType!] = firstImageBlob;
          }
        } else if (firstImageBlob && firstImageType) {
          clipboardData[firstImageType] = firstImageBlob;
        }

        await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
        onCopied(index, 'Copied successfully!');
      } else {
        await navigator.clipboard.write([new ClipboardItem(clipboardData)]);
        onCopied(index, 'Copied successfully!');
      }
    } catch (err) {
      console.warn('Rich copy failed, falling back to text only', err);
      try {
        const textToCopy = msg.html ? this.stripHtml(msg.html) : msg.message || '';
        await navigator.clipboard.writeText(textToCopy);
        onCopied(index, 'Copied text only!');
      } catch (fallbackErr) {
        console.error('Copy fallback failed:', fallbackErr);
        this.toastService.show('Failed to copy', 'error');
      }
    }
  }

  copyUserMessage(msg: any, index: number, onCopied: (index: number) => void) {
    const textToCopy = msg.message;
    navigator.clipboard
      .writeText(textToCopy)
      .then(() => {
        onCopied(index);
        this.toastService.show('Copied to clipboard!', 'success');
      })
      .catch((err) => {
        console.error('Failed to copy: ', err);
        this.toastService.show('Failed to copy', 'error');
      });
  }

  async shareMessage(msg: any) {
    const text = msg.html ? this.stripHtml(msg.html) : msg.message || '';

    if (!navigator.share) {
      alert('Sharing is not supported in this browser.');
      return;
    }

    try {
      const files = await this.collectShareFiles(msg);

      const shareData: ShareData = {
        title: 'Shared from Kumaran AI',
        text,
      };

      if (files.length > 0 && navigator.canShare?.({ files })) {
        shareData.files = files;
      }

      await navigator.share(shareData);
    } catch (error) {
      console.log('Share cancelled or failed', error);
    }
  }

  stripHtml(html: string): string {
    const div = document.createElement('div');
    div.innerHTML = html;
    return div.textContent || div.innerText || '';
  }

  private dataURLToBlob(dataURL: string): { blob: Blob; type: string } {
    const parts = dataURL.split(',');
    const match = parts[0].match(/:(.*?);/);
    const mime = match ? match[1] : 'image/png';
    const bstr = atob(parts[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return { blob: new Blob([u8arr], { type: mime }), type: mime };
  }

  private async convertToPngBlob(sourceBlob: Blob): Promise<Blob | null> {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(sourceBlob);
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0);
          canvas.toBlob((blob) => {
            URL.revokeObjectURL(url);
            resolve(blob);
          }, 'image/png');
        } else {
          URL.revokeObjectURL(url);
          resolve(null);
        }
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  }

  private async collectShareFiles(msg: any): Promise<File[]> {
    const files: File[] = [];

    if (msg.html) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(msg.html, 'text/html');
      const images = Array.from(doc.querySelectorAll('img'));

      for (let i = 0; i < images.length; i++) {
        const src = images[i].getAttribute('src');
        if (!src) continue;

        try {
          const file = await this.urlToFile(src, `image-${i + 1}`);
          if (file) files.push(file);
        } catch (err) {
          console.warn('Failed to fetch image for sharing:', src, err);
        }
      }
    }

    const attachments = msg.attachments || msg.files || [];

    for (let i = 0; i < attachments.length; i++) {
      const item = attachments[i];

      try {
        if (item instanceof File) {
          files.push(item);
          continue;
        }

        if (item?.url) {
          const file = await this.urlToFile(
            item.url,
            item.name || `file-${i + 1}`,
            item.type
          );
          if (file) files.push(file);
        }
      } catch (err) {
        console.warn('Failed to fetch attachment for sharing:', item, err);
      }
    }

    return files;
  }

  private async urlToFile(
    url: string,
    fallbackName: string,
    forcedType?: string
  ): Promise<File | null> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch file: ${url}`);
    }

    const blob = await response.blob();
    const mimeType = forcedType || blob.type || 'application/octet-stream';

    const extension =
      this.getExtensionFromMimeType(mimeType) || this.getExtensionFromUrl(url);
    const fileName = extension ? `${fallbackName}.${extension}` : fallbackName;

    return new File([blob], fileName, { type: mimeType });
  }

  private getExtensionFromMimeType(type: string): string {
    const map: Record<string, string> = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'application/pdf': 'pdf',
      'text/plain': 'txt',
      'application/msword': 'doc',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
        'docx',
      'application/vnd.ms-excel': 'xls',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet':
        'xlsx',
    };

    return map[type] || '';
  }

  private getExtensionFromUrl(url: string): string {
    try {
      const cleanUrl = url.split('?')[0].split('#')[0];
      const parts = cleanUrl.split('.');
      return parts.length > 1 ? parts.pop() || '' : '';
    } catch {
      return '';
    }
  }
}
