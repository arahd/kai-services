import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient, HttpErrorResponse, HttpEventType } from '@angular/common/http';
import { Subscription, Observable, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
import { ConfigService } from '@core/services/config.service';
import { ToastService } from '@core/services/toast.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';

export interface FilePreview {
  file: File;
  name: string;
  size: number;
  previewUrl?: string | null;
  uploading: boolean;
  progress: number; // 0 - 100
  uploaded: boolean;
  error?: string | null;
  docId?: string | number | null;
  exceeds_threshold?: boolean;
  uploadSub?: Subscription | null;
  originalName?: string;
  deleting?: boolean;
}

export type TUploadFilter = 'all' | 'uploading' | 'uploaded' | 'failed';

export interface ExistingDocItem {
  filename: string;
  doc_id: string;
  exceeds_threshold: boolean;
}

export interface ExistingDocumentsData {
  existing_filenames: string[];
  existing_doc_ids: string[];
  existing_threshold: boolean[];
}

@Injectable({
  providedIn: 'root'
})
export class AttachmentService {
  private readonly http = inject(HttpClient);
  private readonly configService = inject(ConfigService);
  private readonly toastService = inject(ToastService);
  private readonly chatModelService = inject(ChatModelService);

  readonly filePreviews = signal<FilePreview[]>([]);
  readonly pendingAttachments = signal<FilePreview[]>([]);
  readonly uploadFilter = signal<TUploadFilter>('all');
  readonly showAllUploads = signal<boolean>(false);
  readonly showLeftScroll = signal<boolean>(false);
  readonly showRightScroll = signal<boolean>(false);
  readonly activePreviewFile = signal<FilePreview | null>(null);

  readonly isFileUploading = computed(() => this.filePreviews().some((fp) => fp.uploading));
  readonly uploadedCount = computed(() => this.filePreviews().filter((fp) => fp.uploaded).length);
  readonly uploadingCount = computed(() => this.filePreviews().filter((fp) => fp.uploading).length);
  readonly failedCount = computed(() => this.filePreviews().filter((fp) => !!fp.error).length);

  readonly filteredFilePreviews = computed(() => {
    const filter = this.uploadFilter();
    const previews = this.filePreviews();
    switch (filter) {
      case 'uploading':
        return previews.filter((f) => f.uploading);
      case 'uploaded':
        return previews.filter((f) => f.uploaded);
      case 'failed':
        return previews.filter((f) => !!f.error);
      default:
        return previews;
    }
  });

  constructor() {}

  addFiles(files: FileList | File[], conversationId: string) {
    let rawFiles = Array.from(files);
    if (rawFiles.length === 0) return;

    if (this.chatModelService.isImageUploadRestricted()) {
      const imageFiles = rawFiles.filter(
        (f) => this.isImage(f) || this.isImageFile(f.name)
      );
      if (imageFiles.length > 0) {
        const modelLabel =
          this.chatModelService.getSelectedModelLabel() ||
          this.chatModelService.selectedModel() ||
          'This model';
        this.toastService.show(
          `${modelLabel} does not support image uploads.`,
          'error'
        );
        rawFiles = rawFiles.filter(
          (f) => !this.isImage(f) && !this.isImageFile(f.name)
        );
        if (rawFiles.length === 0) {
          return;
        }
      }
    }

    const allowedFiles = rawFiles;

    const currentPreviews = this.filePreviews();
    const uniqueAllowedFiles: { file: File; originalName: string }[] = [];
    const duplicateNames: string[] = [];

    for (const file of allowedFiles) {
      const isAlreadyAdded = currentPreviews.some(
        (fp) => (fp.originalName || fp.name) === file.name && fp.size === file.size
      );
      const isDuplicateInBatch = uniqueAllowedFiles.some(
        (item) => item.originalName === file.name && item.file.size === file.size
      );

      if (isAlreadyAdded || isDuplicateInBatch) {
        if (!duplicateNames.includes(file.name)) {
          duplicateNames.push(file.name);
        }
      } else {
        let finalName = file.name;
        const dotIndex = finalName.lastIndexOf('.');
        const baseName = dotIndex === -1 ? finalName : finalName.slice(0, dotIndex);
        const extension = dotIndex === -1 ? '' : finalName.slice(dotIndex);

        let counter = 1;
        const nameExists = (n: string) =>
          currentPreviews.some((fp) => fp.name === n) ||
          uniqueAllowedFiles.some((item) => item.file.name === n);

        while (nameExists(finalName)) {
          finalName = `${baseName} (${counter})${extension}`;
          counter++;
        }

        const renamedFile = new File([file], finalName, { type: file.type });
        uniqueAllowedFiles.push({ file: renamedFile, originalName: file.name });
      }
    }

    if (duplicateNames.length > 0) {
      const namesStr = duplicateNames.map((n) => `"${n}"`).join(', ');
      this.toastService.show(
        `${namesStr} ${duplicateNames.length === 1 ? 'has' : 'have'} already been added.`,
        'info'
      );
    }

    if (uniqueAllowedFiles.length === 0) return;

    const currentCount = currentPreviews.length;
    if (currentCount >= 3) {
      this.toastService.show('Maximum 3 files allowed per conversation.', 'error');
      return;
    }

    const remainingSlots = 3 - currentCount;
    const filesToProcess = uniqueAllowedFiles.slice(0, remainingSlots);

    if (uniqueAllowedFiles.length > remainingSlots) {
      this.toastService.show(
        `Only the first ${remainingSlots} files were added. Maximum 3 files allowed.`,
        'info'
      );
    }

    filesToProcess.forEach((item) => {
      const file = item.file;
      const fp: FilePreview = {
        file,
        name: file.name,
        size: file.size,
        originalName: item.originalName,
        previewUrl: null,
        uploading: false,
        progress: 0,
        uploaded: false,
        error: null,
        docId: null,
        uploadSub: null,
      };

      if (this.isImage(file)) {
        const reader = new FileReader();
        reader.onload = (e) => {
          fp.previewUrl = e.target?.result as string;
        };
        reader.readAsDataURL(file);
      }

      this.uploadFile(fp, conversationId);
    });
  }

  uploadFile(fp: FilePreview, conversationId: string) {
    if (!fp || !fp.file) return;

    const form = new FormData();
    form.append('files', fp.file);
    form.append('conversation_id', String(conversationId ?? ''));

    fp.uploading = true;
    fp.progress = 0;
    fp.error = null;

    const currentList = this.filePreviews();
    if (!currentList.includes(fp)) {
      this.filePreviews.set([...currentList, fp]);
    }

    const uploadUrl = `${this.configService.getAzureUrl()}/indexer/indexer`;
    const req = this.http.post<any>(uploadUrl, form, {
      reportProgress: true,
      observe: 'events',
    });

    const sub = req.subscribe({
      next: (event) => {
        if (event.type === HttpEventType.UploadProgress && event.total) {
          fp.progress = Math.round((100 * event.loaded) / event.total);
          this.filePreviews.set([...this.filePreviews()]);
        } else if (event.type === HttpEventType.Response) {
          const body = event.body;
          const indexedFile =
            body?.files_indexed?.find(
              (f: any) =>
                f.filename === fp.file?.name ||
                f.filename === fp.name ||
                f.filename === fp.originalName
            ) ?? body?.files_indexed?.[0];

          fp.docId = indexedFile?.doc_id ?? body?.doc_id ?? null;
          fp.exceeds_threshold =
            indexedFile?.exceeds_threshold ?? body?.exceeds_threshold ?? false;
          fp.uploading = false;
          fp.progress = 100;
          fp.uploaded = true;
          fp.error = null;
          fp.uploadSub = null;
          this.filePreviews.set([...this.filePreviews()]);
        }
      },
      error: (err: HttpErrorResponse) => {
        const fileName = fp.file?.name || 'Unknown file';
        const backendMsg = err?.error?.error || err?.error?.message || '';

        let message: string;
        if (
          backendMsg.toLowerCase().includes('exceeds') &&
          backendMsg.toLowerCase().includes('size')
        ) {
          const limitMatch = backendMsg.match(/(\d+(?:\.\d+)?\s*[KMGT]?B)/i);
          const limit = limitMatch ? limitMatch[1].replace('.00', '') : '10 MB';
          message = `"${fileName}" is too large. Maximum file size is ${limit}.`;
        } else if (backendMsg) {
          message = `"${fileName}" couldn't be uploaded — ${backendMsg}`;
        } else {
          message = `"${fileName}" couldn't be uploaded. Please try again.`;
        }

        this.toastService.show(message, 'error');

        fp.uploading = false;
        fp.progress = 0;
        fp.uploaded = false;
        fp.error = message;
        this.filePreviews.set([...this.filePreviews()]);

        // Auto-remove failed file after 2 seconds
        setTimeout(() => {
          this.filePreviews.set(this.filePreviews().filter((f) => f !== fp));
        }, 2000);
      },
    });

    fp.uploadSub = sub;
  }

  removeFile(index: number) {
    const fp = this.filePreviews()[index];
    if (!fp) return;

    if (fp.uploadSub) {
      fp.uploadSub.unsubscribe();
      fp.uploadSub = null;
      fp.uploading = false;
    }

    if (!fp.docId) {
      const newList = [...this.filePreviews()];
      newList.splice(index, 1);
      this.filePreviews.set(newList);
      return;
    }

    fp.deleting = true;
    fp.error = null;
    this.filePreviews.set([...this.filePreviews()]);

    const deleteUrl = `${this.configService.getAzureUrl()}/indexer/delete/${fp.docId}`;
    this.http.delete(deleteUrl).subscribe({
      next: () => {
        const newList = [...this.filePreviews()];
        newList.splice(index, 1);
        this.filePreviews.set(newList);
        this.toastService.show(`${fp.name} removed successfully`, 'success');
      },
      error: (err: HttpErrorResponse) => {
        fp.deleting = false;
        fp.error = err?.error?.message || 'Delete failed';
        this.filePreviews.set([...this.filePreviews()]);

        this.toastService.show(
          err?.error?.message
            ? `Delete failed for ${fp.name}: ${err.error.message}`
            : `Delete failed for ${fp.name}`,
          'error'
        );
      },
    });
  }

  retryUpload(fp: FilePreview, conversationId: string) {
    if (!fp || fp.uploading) return;
    this.uploadFile(fp, conversationId);
  }

  /**
   * Removes all image files from current previews and cleans them up.
   * Returns the number of image files removed.
   */
  removeImageFiles(): number {
    const current = this.filePreviews();
    const imageIndices: number[] = [];
    current.forEach((fp, index) => {
      if (this.isImage(fp.file) || this.isImageFile(fp.name)) {
        imageIndices.push(index);
      }
    });

    for (let i = imageIndices.length - 1; i >= 0; i--) {
      this.removeFile(imageIndices[i]);
    }
    return imageIndices.length;
  }

  clear() {
    this.filePreviews().forEach((fp) => {
      if (fp.uploadSub) {
        fp.uploadSub.unsubscribe();
      }
    });
    this.filePreviews.set([]);
  }

  setUploadFilter(filter: TUploadFilter) {
    this.uploadFilter.set(filter);
  }

  toggleAllUploadsPanel() {
    this.showAllUploads.set(!this.showAllUploads());
  }

  private readonly uploadedDocsCache = new Map<string, FilePreview[]>();
  private readonly uploadedDocsRawCache = new Map<string, any>();
  private readonly conversationDocsMap = new Map<string, ExistingDocItem[]>();

  /** Clear cached uploaded documents (e.g., when a file is uploaded or conversation is reset) */
  clearUploadedDocsCache(conversationId?: string) {
    if (conversationId) {
      this.uploadedDocsCache.delete(conversationId);
      this.uploadedDocsRawCache.delete(conversationId);
      this.conversationDocsMap.delete(conversationId);
    } else {
      this.uploadedDocsCache.clear();
      this.uploadedDocsRawCache.clear();
      this.conversationDocsMap.clear();
    }
  }

  /**
   * Record uploaded documents for a conversation so that subsequent queries include them in existing_* payload.
   */
  addUploadedDocuments(
    conversationKey: string,
    docs: Array<{
      filename?: string;
      name?: string;
      originalName?: string;
      doc_id?: string | number | null;
      docId?: string | number | null;
      exceeds_threshold?: boolean;
    }>
  ): void {
    if (!conversationKey || !docs || docs.length === 0) return;

    // 1. Update internal conversationDocsMap
    const currentList = this.conversationDocsMap.get(conversationKey) || [];
    const updated = [...currentList];

    for (const doc of docs) {
      const filename = doc.filename || doc.name || doc.originalName || '';
      const doc_id = String(doc.doc_id ?? doc.docId ?? filename);
      const exceeds_threshold = Boolean(doc.exceeds_threshold);

      if (!filename && !doc_id) continue;

      const alreadyExists = updated.some(
        (item) =>
          (item.doc_id && item.doc_id.trim() === doc_id.trim()) ||
          (item.filename && item.filename.trim().toLowerCase() === filename.trim().toLowerCase())
      );
      if (!alreadyExists) {
        updated.push({ filename, doc_id, exceeds_threshold });
      }
    }
    this.conversationDocsMap.set(conversationKey, updated);

    // 2. Also keep uploadedDocsRawCache updated so get_uploaded_document cache is consistent
    const raw = this.uploadedDocsRawCache.get(conversationKey) || { documents: [] };
    const rawDocs: any[] = Array.isArray(raw.documents) ? [...raw.documents] : [];
    for (const doc of docs) {
      const filename = doc.filename || doc.name || doc.originalName || '';
      const doc_id = String(doc.doc_id ?? doc.docId ?? filename);
      const exceeds_threshold = Boolean(doc.exceeds_threshold);
      if (!filename && !doc_id) continue;

      const exists = rawDocs.some(
        (rd: any) =>
          (rd.doc_id && String(rd.doc_id).trim() === doc_id.trim()) ||
          (rd.document_name && String(rd.document_name).trim() === doc_id.trim()) ||
          (rd.filename && String(rd.filename).trim().toLowerCase() === filename.trim().toLowerCase())
      );
      if (!exists) {
        rawDocs.push({
          filename,
          document_name: filename,
          doc_id,
          exceeds_threshold,
        });
      }
    }
    this.uploadedDocsRawCache.set(conversationKey, { ...raw, documents: rawDocs });
  }

  /**
   * Migrate cached documents from a temporary conversation ID to the permanent conversation ID.
   */
  migrateUploadedDocsCache(fromKey: string, toKey: string): void {
    if (!fromKey || !toKey || fromKey === toKey) return;

    // Migrate conversationDocsMap
    const fromDocs = this.conversationDocsMap.get(fromKey);
    if (fromDocs && fromDocs.length > 0) {
      this.addUploadedDocuments(toKey, fromDocs);
    }

    // Migrate uploadedDocsRawCache
    const fromRaw = this.uploadedDocsRawCache.get(fromKey);
    if (fromRaw && Array.isArray(fromRaw.documents) && fromRaw.documents.length > 0) {
      const toRaw = this.uploadedDocsRawCache.get(toKey) || { documents: [] };
      const merged = [...(toRaw.documents || [])];
      for (const d of fromRaw.documents) {
        const dId = String(d.doc_id ?? d.document_name ?? d.filename ?? '').trim();
        const dName = (d.filename || d.document_name || '').trim().toLowerCase();
        const exists = merged.some(
          (m: any) =>
            (m.doc_id && String(m.doc_id).trim() === dId) ||
            (m.filename && String(m.filename).trim().toLowerCase() === dName)
        );
        if (!exists) {
          merged.push(d);
        }
      }
      this.uploadedDocsRawCache.set(toKey, { ...toRaw, documents: merged });
    }

    // Migrate uploadedDocsCache
    const fromPreviews = this.uploadedDocsCache.get(fromKey);
    if (fromPreviews && fromPreviews.length > 0) {
      const toPreviews = this.uploadedDocsCache.get(toKey) || [];
      this.uploadedDocsCache.set(toKey, [...toPreviews, ...fromPreviews]);
    }
  }

  /**
   * Extract existing document metadata from:
   * 1. Cached get_uploaded_document response (uploadedDocsRawCache)
   * 2. Tracked uploaded documents for this conversation (conversationDocsMap)
   * 3. Target conversation message attachments (if provided)
   *
   * Excludes documents that are currently being uploaded in the active batch,
   * ensuring that new files are sent in uploaded_* and previous files in existing_*.
   * Returns { existing_filenames, existing_docs, existing_threshold } for the chat payload.
   */
  getExistingDocumentsData(
    conversationId?: string | null,
    tempId?: string | null,
    excludeDocIds: (string | number)[] = [],
    excludeFileNames: string[] = [],
    targetConv?: any
  ): ExistingDocumentsData {
    const empty: ExistingDocumentsData = { existing_filenames: [], existing_doc_ids: [],  existing_threshold: [] };
    if (!conversationId && !tempId && !targetConv) return empty;

    const excludedIds = new Set(excludeDocIds.filter((id) => id != null).map((id) => String(id).trim()));
    const excludedNames = new Set(excludeFileNames.filter((n) => !!n).map((n) => n.trim().toLowerCase()));

    const existing_filenames: string[] = [];
    const existing_doc_ids: string[] = [];
    const existing_threshold: boolean[] = [];

    const seenIds = new Set<string>();
    const seenNames = new Set<string>();

    const addDoc = (filename: string, docId: string, exceedsThreshold: boolean) => {
      const cleanName = (filename || '').trim();
      const cleanId = (docId || '').trim();
      if (!cleanName && !cleanId) return;

      const lowerName = cleanName.toLowerCase();

      // Skip if currently being uploaded in this specific query
      if (cleanId && excludedIds.has(cleanId)) return;
      if (cleanName && excludedNames.has(lowerName)) return;

      // Skip duplicates
      if (cleanId && seenIds.has(cleanId)) return;
      if (cleanName && seenNames.has(lowerName)) return;

      if (cleanId) seenIds.add(cleanId);
      if (cleanName) seenNames.add(lowerName);

      existing_filenames.push(cleanName || cleanId);
      existing_doc_ids.push(cleanId || cleanName);
      existing_threshold.push(Boolean(exceedsThreshold));
    };

    const keysToCheck = [conversationId, tempId].filter((k): k is string => !!k);

    // 1. Raw documents cache (from backend get_uploaded_document or addUploadedDocuments)
    for (const key of keysToCheck) {
      const raw = this.uploadedDocsRawCache.get(key);
      if (raw && Array.isArray(raw.documents)) {
        for (const doc of raw.documents) {
          const fn = doc.filename || doc.document_name || '';
          const did = String(doc.doc_id ?? doc.document_id ?? doc.docId ?? doc.document_name ?? fn ?? '');
          addDoc(fn, did, doc.exceeds_threshold);
        }
      }
    }

    // 2. Tracked conversation documents
    for (const key of keysToCheck) {
      const docs = this.conversationDocsMap.get(key);
      if (Array.isArray(docs)) {
        for (const doc of docs) {
          addDoc(doc.filename, doc.doc_id, doc.exceeds_threshold);
        }
      }
    }

    // 3. Conversation messages attachments (if provided)
    if (targetConv && Array.isArray(targetConv.messages)) {
      for (const msg of targetConv.messages) {
        if (msg.sender === 'user' && Array.isArray(msg.attachments)) {
          for (const att of msg.attachments) {
            const fn = att.name || att.originalName || '';
            const did = String(att.docId ?? att.name ?? '');
            addDoc(fn, did, att.exceeds_threshold);
          }
        }
      }
    }

    return {
      existing_filenames,
      existing_doc_ids,
      existing_threshold,
    };
  }

  /** Fetch uploaded documents from backend for a specific conversation with caching */
  fetchUploadedDocument(conversationId: string): Observable<any> {
    if (!conversationId) return of(null);

    if (this.uploadedDocsRawCache.has(conversationId)) {
      return of(this.uploadedDocsRawCache.get(conversationId));
    }

    const url = `${this.configService.getAzureUrl()}/transcript/chat/get_uploaded_document`;
    return this.http.post<any>(url, { conversation_id: conversationId }).pipe(
      map((res: any) => {
        if (res) {
          this.uploadedDocsRawCache.set(conversationId, res);
        }
        return res;
      }),
      catchError((err) => {
        console.warn('[AttachmentService] Failed to fetch uploaded document:', err);
        return of(null);
      })
    );
  }

  /** Fetch uploaded documents from backend and convert base64 bytes to FilePreview Data URLs */
  loadUploadedDocumentsForConversation(conversationId: string): Observable<FilePreview[]> {
    if (!conversationId) return of([]);

    if (this.uploadedDocsCache.has(conversationId)) {
      return of(this.uploadedDocsCache.get(conversationId)!);
    }

    return this.fetchUploadedDocument(conversationId).pipe(
      map((res: any) => {
        if (!res || !res.documents || !Array.isArray(res.documents) || res.documents.length === 0) {
          this.uploadedDocsCache.set(conversationId, []);
          return [];
        }

        const docs: FilePreview[] = res.documents.map((doc: any) => {
          const extension = doc.extension || this.getExtensionFromName(doc.filename || doc.document_name);
          const mime = doc.mime_type && doc.mime_type !== 'application/octet-stream'
            ? doc.mime_type
            : this.getMimeFromExtension(extension);

          const previewUrl = doc.file_bytes
            ? (typeof doc.file_bytes === 'string' && doc.file_bytes.startsWith('data:')
                ? doc.file_bytes
                : `data:${mime};base64,${doc.file_bytes}`)
            : null;

          const fileName = doc.filename || doc.document_name || 'attachment';

          return {
            name: fileName,
            size: 0,
            previewUrl: previewUrl,
            uploading: false,
            progress: 100,
            uploaded: true,
            docId: doc.document_name || null,
            file: null as any,
            originalName: fileName
          } as FilePreview;
        });

        this.uploadedDocsCache.set(conversationId, docs);
        return docs;
      }),
      catchError((err) => {
        console.warn('[AttachmentService] Failed to load uploaded documents:', err);
        return of([]);
      })
    );
  }

  private getExtensionFromName(name: string): string {
    if (!name) return '';
    return name.split('.').pop()?.toLowerCase() || '';
  }

  private getMimeFromExtension(ext: string): string {
    const e = (ext || '').toLowerCase();
    if (e === 'pdf') return 'application/pdf';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(e)) return `image/${e === 'jpg' ? 'jpeg' : e}`;
    if (['txt', 'csv', 'json', 'xml', 'log'].includes(e)) return `text/plain`;
    if (e === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (e === 'xls') return 'application/vnd.ms-excel';
    if (e === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    if (e === 'doc') return 'application/msword';
    if (e === 'pptx') return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    if (e === 'ppt') return 'application/vnd.ms-powerpoint';
    return 'application/octet-stream';
  }

  // Utilities
  isImage(file: File): boolean {
    return file.type.startsWith('image/');
  }

  isPdfFile(fileName: string): boolean {
    return !!fileName && fileName.toLowerCase().endsWith('.pdf');
  }

  isImageFile(fileName: string): boolean {
    if (!fileName) return false;
    const lower = fileName.toLowerCase();
    return (
      lower.endsWith('.png') ||
      lower.endsWith('.jpg') ||
      lower.endsWith('.jpeg') ||
      lower.endsWith('.webp') ||
      lower.endsWith('.gif') ||
      lower.endsWith('.bmp') ||
      lower.endsWith('.svg')
    );
  }

  getFileType(fileName: string): string {
    if (!fileName) return 'FILE';
    const ext = fileName.split('.').pop();
    return ext ? ext.toUpperCase() : 'FILE';
  }

  humanFileSize(bytes: number): string {
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
}
