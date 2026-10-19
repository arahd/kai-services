import { Injectable, inject } from '@angular/core';
import { MarkdownService } from '@shared/services/markdown.service';
import { ChatDocument, ChatImage } from '@shared/models';

@Injectable({ providedIn: 'root' })
export class ResponseMapperService {
  private readonly markdownService = inject(MarkdownService);

  private readonly MAPPED_RESPONSES: Record<string, string> = {
    'sensitive-question': 'I apologize, I am not allowed to answer this question',
    'no-content': "Apologize, I don't see any relevant content in my knowledge base to answer this question",
    'not-answered': 'Kindly rephrase the question and check',
    'PII': 'The question cannot be processed because it contains PII (Personally identifiable information).',
  };

  isMappedResponseType(responseType: string): boolean {
    return !!this.MAPPED_RESPONSES[responseType];
  }

  getMappedResponseText(responseType: string): string {
    return this.MAPPED_RESPONSES[responseType] || '';
  }

  extractImages(res: any): ChatImage[] {
    if (!res) return [];
    const images: ChatImage[] = [];
    const imageResponses = res.image_responses || res.image_response;
    
    if (imageResponses) {
      if (Array.isArray(imageResponses)) {
        imageResponses.forEach((img: any) => {
          if (img && img.image_bytes) {
            const mimeType = img.mime_type || (img.extension ? `image/${img.extension}` : 'image/png');
            images.push({
               url: `data:${mimeType};base64,${img.image_bytes}`,
               name: img.image_name || 'Generated Image',
            });
          }
        });
      } else if (imageResponses.image_bytes) {
        // Single image response object
        const mimeType = imageResponses.mime_type || (imageResponses.extension ? `image/${imageResponses.extension}` : 'image/png');
        images.push({
           url: `data:${mimeType};base64,${imageResponses.image_bytes}`,
           name: imageResponses.image_name || 'Generated Image',
        });
      }
    }

    // Fallback: check if the response object or its elements directly contain the image_bytes
    if (images.length === 0) {
      if (Array.isArray(res)) {
        res.forEach((img: any) => {
          if (img && img.image_bytes) {
            const mimeType = img.mime_type || (img.extension ? `image/${img.extension}` : 'image/png');
            images.push({
               url: `data:${mimeType};base64,${img.image_bytes}`,
               name: img.image_name || 'Generated Image',
            });
          }
        });
      } else if (res.image_bytes) {
        const mimeType = res.mime_type || (res.extension ? `image/${res.extension}` : 'image/png');
        images.push({
           url: `data:${mimeType};base64,${res.image_bytes}`,
           name: res.image_name || 'Generated Image',
        });
      }
    }

    return images;
  }

  extractDocuments(res: any): ChatDocument[] {
    if (!res) return [];
    const documents: ChatDocument[] = [];

    const pushDocument = (doc: any) => {
      const mapped = this.mapDocumentItem(doc);
      if (mapped) documents.push(mapped);
    };

    const docResponses =
      res.generated_document_response ||
      res.generated_document_responses ||
      res.generated_documents ||
      res.documents;

    if (docResponses) {
      if (Array.isArray(docResponses)) {
        docResponses.forEach(pushDocument);
      } else {
        pushDocument(docResponses);
      }
    }

    if (documents.length === 0) {
      if (Array.isArray(res)) {
        res.forEach(pushDocument);
      } else {
        pushDocument(res);
      }
    }

    return documents;
  }

  private readonly MIME_MAP: Record<string, string> = {
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    ppt: 'application/vnd.ms-powerpoint',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls: 'application/vnd.ms-excel',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    doc: 'application/msword',
    pdf: 'application/pdf',
    csv: 'text/csv',
  };

  private readonly DEFAULT_NAME_MAP: Record<string, string> = {
    pptx: 'Generated Presentation',
    ppt: 'Generated Presentation',
    xlsx: 'Generated Spreadsheet',
    xls: 'Generated Spreadsheet',
    docx: 'Generated Document',
    doc: 'Generated Document',
    pdf: 'Generated Document',
    csv: 'Generated Spreadsheet',
  };

  private mapDocumentItem(doc: any): ChatDocument | null {
    if (!doc) return null;
    const bytes = doc.generated_document_bytes || doc.file_bytes;
    if (!bytes) return null;

    let extension = doc.extension;
    if (!extension) {
      const nameCandidate = doc.generated_document_name || doc.filename || doc.document_name;
      if (nameCandidate) {
        const dotIdx = nameCandidate.lastIndexOf('.');
        if (dotIdx > -1) {
          extension = nameCandidate.substring(dotIdx + 1);
        }
      }
    }
    if (!extension) {
      extension = 'pptx';
    }

    const extLower = extension.toLowerCase();
    const mimeType =
      doc.mime_type ||
      this.MIME_MAP[extLower] ||
      'application/octet-stream';

    const defaultName = this.DEFAULT_NAME_MAP[extLower] || 'Generated Document';
    const name = doc.generated_document_name || doc.document_name || doc.filename || defaultName;

    const url = typeof bytes === 'string' && bytes.startsWith('data:')
      ? bytes
      : `data:${mimeType};base64,${bytes}`;

    return {
      url,
      name,
      extension,
    };
  }

  cleanSystemTags(text: string): string {
    if (!text) return text;
    // Remove both standard and HTML-entity escaped tags
    let cleaned = text.replace(/<KUMARAN_GENERATED_IMAGE>.*?<\/KUMARAN_GENERATED_IMAGE>/gs, '');
    cleaned = cleaned.replace(/&lt;KUMARAN_GENERATED_IMAGE&gt;.*?&lt;\/KUMARAN_GENERATED_IMAGE&gt;/gs, '');
    cleaned = cleaned.replace(/<KUMARAN_GENERATED_DOCUMENT>.*?<\/KUMARAN_GENERATED_DOCUMENT>/gs, '');
    cleaned = cleaned.replace(/&lt;KUMARAN_GENERATED_DOCUMENT&gt;.*?&lt;\/KUMARAN_GENERATED_DOCUMENT&gt;/gs, '');
    cleaned = cleaned.replace(/<KUMARAN_CHAT_HISTORY_FAILED>.*?<\/KUMARAN_CHAT_HISTORY_FAILED>/gs, '');
    cleaned = cleaned.replace(/&lt;KUMARAN_CHAT_HISTORY_FAILED&gt;.*?&lt;\/KUMARAN_CHAT_HISTORY_FAILED&gt;/gs, '');
    return cleaned.trim();
  }

  async formatMessage(res: any, responseType: string): Promise<{ formattedMessage: string; finalText: string }> {
    let finalText = res.response || '';
    let formattedMessage = '';

    finalText = this.cleanSystemTags(finalText);

    if (responseType === 'kumaran-questions') {
      formattedMessage = await this.markdownService.formatMessage(res.response);
    } else if (this.isMappedResponseType(responseType)) {
      finalText = this.getMappedResponseText(responseType);
      formattedMessage = finalText;
    } else {
      formattedMessage = await this.markdownService.formatMessage(res.response);
    }

    formattedMessage = this.cleanSystemTags(formattedMessage);

    return { formattedMessage, finalText };
  }
}
