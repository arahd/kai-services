import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AttachmentService, FilePreview } from './attachment.service';
import { ConfigService } from '@core/services/config.service';
import { ToastService } from '@core/services/toast.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { HttpEventType } from '@angular/common/http';

describe('AttachmentService', () => {
  let service: AttachmentService;
  let httpMock: HttpTestingController;
  let configServiceMock: any;
  let toastServiceMock: any;
  let chatModelServiceMock: any;

  beforeEach(() => {
    configServiceMock = {
      getAzureUrl: () => 'https://azure.test',
    };

    toastServiceMock = {
      show: jasmine.createSpy('show'),
    };

    chatModelServiceMock = {
      isImageUploadRestricted: jasmine.createSpy('isImageUploadRestricted').and.returnValue(false),
      selectedModel: jasmine.createSpy('selectedModel').and.returnValue('gpt-4o'),
      getSelectedModelLabel: jasmine.createSpy('getSelectedModelLabel').and.returnValue('GPT-4o'),
    };

    TestBed.configureTestingModule({
      providers: [
        AttachmentService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: configServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: ChatModelService, useValue: chatModelServiceMock },
      ],
    });

    service = TestBed.inject(AttachmentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created and have default signal states', () => {
    expect(service).toBeTruthy();
    expect(service.filePreviews()).toEqual([]);
    expect(service.uploadFilter()).toBe('all');
    expect(service.showAllUploads()).toBeFalse();
    expect(service.isFileUploading()).toBeFalse();
    expect(service.uploadedCount()).toBe(0);
    expect(service.uploadingCount()).toBe(0);
    expect(service.failedCount()).toBe(0);
    expect(service.filteredFilePreviews()).toEqual([]);
  });

  it('should format human readable file sizes correctly', () => {
    expect(service.humanFileSize(0)).toBe('0 B');
    expect(service.humanFileSize(500)).toBe('500.0 B');
    expect(service.humanFileSize(1024)).toBe('1.0 KB');
    expect(service.humanFileSize(1048576)).toBe('1.0 MB');
  });

  it('should identify file extensions and types accurately', () => {
    expect(service.isPdfFile('document.pdf')).toBeTrue();
    expect(service.isPdfFile('image.png')).toBeFalse();

    expect(service.isImageFile('photo.png')).toBeTrue();
    expect(service.isImageFile('photo.JPEG')).toBeTrue();
    expect(service.isImageFile('doc.pdf')).toBeFalse();
    expect(service.isImageFile('')).toBeFalse();

    expect(service.getFileType('doc.pdf')).toBe('PDF');
    expect(service.getFileType('archive.tar.gz')).toBe('GZ');
    expect(service.getFileType('noext')).toBe('NOEXT');
    expect(service.getFileType('')).toBe('FILE');
  });

  it('should toggle panels and filters', () => {
    service.setUploadFilter('uploaded');
    expect(service.uploadFilter()).toBe('uploaded');

    service.toggleAllUploadsPanel();
    expect(service.showAllUploads()).toBeTrue();
    service.toggleAllUploadsPanel();
    expect(service.showAllUploads()).toBeFalse();
  });

  it('should filter file previews by status', () => {
    const f1: FilePreview = { file: new File([], 'f1.pdf'), name: 'f1.pdf', size: 100, uploading: true, progress: 50, uploaded: false };
    const f2: FilePreview = { file: new File([], 'f2.pdf'), name: 'f2.pdf', size: 100, uploading: false, progress: 100, uploaded: true };
    const f3: FilePreview = { file: new File([], 'f3.pdf'), name: 'f3.pdf', size: 100, uploading: false, progress: 0, uploaded: false, error: 'Failed' };

    service.filePreviews.set([f1, f2, f3]);

    service.setUploadFilter('uploading');
    expect(service.filteredFilePreviews()).toEqual([f1]);

    service.setUploadFilter('uploaded');
    expect(service.filteredFilePreviews()).toEqual([f2]);

    service.setUploadFilter('failed');
    expect(service.filteredFilePreviews()).toEqual([f3]);

    service.setUploadFilter('all');
    expect(service.filteredFilePreviews()).toEqual([f1, f2, f3]);
  });

  it('should add files and upload them successfully', () => {
    const file1 = new File(['content1'], 'test1.txt', { type: 'text/plain' });
    service.addFiles([file1], 'conv-101');

    expect(service.filePreviews().length).toBe(1);
    expect(service.filePreviews()[0].uploading).toBeTrue();

    const req = httpMock.expectOne('https://azure.test/indexer/indexer');
    expect(req.request.method).toBe('POST');

    // Simulate upload progress
    req.event({ type: HttpEventType.UploadProgress, loaded: 50, total: 100 });
    expect(service.filePreviews()[0].progress).toBe(50);

    // Simulate completion with files_indexed response
    req.flush({
      files_indexed: [
        {
          chunks_count: 1,
          doc_id: 'doc-999',
          exceeds_threshold: true,
          filename: 'test1.txt',
          token_count: 10000
        }
      ],
      message: '1 file(s) indexed successfully',
      total_chunks: 1
    });
    expect(service.filePreviews()[0].uploaded).toBeTrue();
    expect(service.filePreviews()[0].docId).toBe('doc-999');
    expect(service.filePreviews()[0].exceeds_threshold).toBeTrue();
    expect(service.filePreviews()[0].progress).toBe(100);
  });

  it('should prevent adding duplicate files', () => {
    const file = new File(['content'], 'test.txt', { type: 'text/plain' });
    service.addFiles([file], 'conv-101');
    const req = httpMock.expectOne('https://azure.test/indexer/indexer');
    req.flush({ doc_id: '1' });

    // Add exact same file again
    service.addFiles([file], 'conv-101');
    expect(toastServiceMock.show).toHaveBeenCalledWith('"test.txt" has already been added.', 'info');
  });

  it('should enforce 3 files limit', () => {
    const f1 = new File(['1'], 'f1.txt', { type: 'text/plain' });
    const f2 = new File(['2'], 'f2.txt', { type: 'text/plain' });
    const f3 = new File(['3'], 'f3.txt', { type: 'text/plain' });
    const f4 = new File(['4'], 'f4.txt', { type: 'text/plain' });

    service.addFiles([f1, f2, f3, f4], 'conv-101');
    const reqs = httpMock.match('https://azure.test/indexer/indexer');
    expect(reqs.length).toBe(3);
    reqs.forEach((r) => r.flush({ doc_id: '1' }));

    expect(toastServiceMock.show).toHaveBeenCalledWith(
      'Only the first 3 files were added. Maximum 3 files allowed.',
      'info'
    );
  });

  it('should remove file and call backend delete endpoint if docId exists', () => {
    const f: FilePreview = {
      file: new File([], 'f1.pdf'),
      name: 'f1.pdf',
      size: 100,
      uploading: false,
      progress: 100,
      uploaded: true,
      docId: 'doc-123',
    };
    service.filePreviews.set([f]);

    service.removeFile(0);
    expect(service.filePreviews()[0].deleting).toBeTrue();

    const req = httpMock.expectOne('https://azure.test/indexer/delete/doc-123');
    expect(req.request.method).toBe('DELETE');
    req.flush({});

    expect(service.filePreviews().length).toBe(0);
    expect(toastServiceMock.show).toHaveBeenCalledWith('f1.pdf removed successfully', 'success');
  });

  it('should remove local file immediately if docId does not exist', () => {
    const f: FilePreview = {
      file: new File([], 'local.pdf'),
      name: 'local.pdf',
      size: 100,
      uploading: false,
      progress: 0,
      uploaded: false,
    };
    service.filePreviews.set([f]);

    service.removeFile(0);
    expect(service.filePreviews().length).toBe(0);
  });

  it('should fetch and cache uploaded documents', () => {
    service.fetchUploadedDocument('conv-202').subscribe(res => {
      expect(res).toEqual({ documents: [{ document_name: 'doc1' }] });
    });

    const req = httpMock.expectOne('https://azure.test/transcript/chat/get_uploaded_document');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ conversation_id: 'conv-202' });
    req.flush({ documents: [{ document_name: 'doc1' }] });

    // Second call should hit cache and not trigger HTTP request
    service.fetchUploadedDocument('conv-202').subscribe(res => {
      expect(res).toEqual({ documents: [{ document_name: 'doc1' }] });
    });
  });

  it('should load uploaded documents for conversation and map base64 bytes', () => {
    service.loadUploadedDocumentsForConversation('conv-303').subscribe(docs => {
      expect(docs.length).toBe(1);
      expect(docs[0].name).toBe('report.pdf');
      expect(docs[0].previewUrl).toBe('data:application/pdf;base64,AAA');
    });

    const req = httpMock.expectOne('https://azure.test/transcript/chat/get_uploaded_document');
    req.flush({
      documents: [
        { filename: 'report.pdf', extension: 'pdf', file_bytes: 'AAA' }
      ]
    });
  });

  it('should clear files and cache', () => {
    service.filePreviews.set([{ file: new File([], 'a'), name: 'a', size: 10, uploading: false, progress: 100, uploaded: true }]);
    service.clear();
    expect(service.filePreviews()).toEqual([]);

    service.clearUploadedDocsCache('conv-101');
    service.clearUploadedDocsCache();
  });

  describe('Existing documents tracking and payload generation', () => {
    it('should return empty existing documents when no conversation ID or docs exist', () => {
      const data = service.getExistingDocumentsData(null, null);
      expect(data).toEqual({ existing_filenames: [], existing_doc_ids: [],  existing_threshold: [] });
    });

    it('should extract existing documents from raw get_uploaded_document cache', () => {
      // Simulate raw get_uploaded_document cached response
      (service as any).uploadedDocsRawCache.set('conv-test-1', {
        documents: [
          { filename: 'docA.pdf', doc_id: 'docA-id', exceeds_threshold: false },
          { document_name: 'docB.docx', doc_id: 'docB-id', exceeds_threshold: true },
        ]
      });

      const result = service.getExistingDocumentsData('conv-test-1');
      expect(result.existing_filenames).toEqual(['docA.pdf', 'docB.docx']);
      expect(result.existing_doc_ids).toEqual(['docA-id', 'docB-id']);
      expect(result.existing_threshold).toEqual([false, true]);
    });

    it('should record uploaded documents via addUploadedDocuments and retrieve them in subsequent queries', () => {
      service.addUploadedDocuments('conv-test-2', [
        { name: 'file1.pdf', docId: 'id-1', exceeds_threshold: false } as any,
        { name: 'file2.xlsx', docId: 'id-2', exceeds_threshold: true } as any,
      ]);

      const result = service.getExistingDocumentsData('conv-test-2');
      expect(result.existing_filenames).toEqual(['file1.pdf', 'file2.xlsx']);
      expect(result.existing_doc_ids).toEqual(['id-1', 'id-2']);
      expect(result.existing_threshold).toEqual([false, true]);
    });

    it('should exclude currently uploading files from existing_* payload', () => {
      service.addUploadedDocuments('conv-test-3', [
        { name: 'previous.pdf', docId: 'prev-id', exceeds_threshold: false } as any,
      ]);

      // Query 2: user is uploading new_file.pdf (docId: 'new-id')
      const result = service.getExistingDocumentsData(
        'conv-test-3',
        null,
        ['new-id'],
        ['new_file.pdf']
      );

      expect(result.existing_filenames).toEqual(['previous.pdf']);
      expect(result.existing_doc_ids).toEqual(['prev-id']);
      expect(result.existing_threshold).toEqual([false]);

      // Also if previously uploaded file is retried or excluded
      const excludedResult = service.getExistingDocumentsData(
        'conv-test-3',
        null,
        ['prev-id'],
        ['previous.pdf']
      );
      expect(excludedResult.existing_filenames).toEqual([]);
      expect(excludedResult.existing_doc_ids).toEqual([]);
    });

    it('should migrate cached documents from tempId to permanent conversationID', () => {
      service.addUploadedDocuments('temp-999', [
        { name: 'initial.pdf', docId: 'init-1', exceeds_threshold: false } as any,
      ]);

      service.migrateUploadedDocsCache('temp-999', 'conv-real-999');

      const result = service.getExistingDocumentsData('conv-real-999');
      expect(result.existing_filenames).toEqual(['initial.pdf']);
      expect(result.existing_doc_ids).toEqual(['init-1']);
      expect(result.existing_threshold).toEqual([false]);
    });

    it('should deduplicate documents across cache, map, and conversation messages', () => {
      service.addUploadedDocuments('conv-dup', [
        { name: 'shared.pdf', docId: 'dup-1', exceeds_threshold: false } as any,
      ]);

      // Add duplicate in conversation messages
      const mockConv = {
        messages: [
          {
            sender: 'user',
            attachments: [{ name: 'shared.pdf', docId: 'dup-1', exceeds_threshold: false }]
          }
        ]
      };

      const result = service.getExistingDocumentsData('conv-dup', null, [], [], mockConv);
      expect(result.existing_filenames).toEqual(['shared.pdf']);
      expect(result.existing_doc_ids).toEqual(['dup-1']);
      expect(result.existing_threshold).toEqual([false]);
    });
  });

  describe('Image upload restrictions', () => {
    it('should reject image upload when model restricts images', () => {
      chatModelServiceMock.isImageUploadRestricted.and.returnValue(true);
      chatModelServiceMock.getSelectedModelLabel.and.returnValue('FW-Kimi-K3');

      const img = new File(['binary'], 'test.png', { type: 'image/png' });
      service.addFiles([img], 'conv-101');

      expect(toastServiceMock.show).toHaveBeenCalledWith(
        'FW-Kimi-K3 does not support image uploads.',
        'error'
      );
      expect(service.filePreviews().length).toBe(0);
      httpMock.expectNone('https://azure.test/indexer/indexer');
    });

    it('should filter out images but allow non-image files when mixed files are provided', () => {
      chatModelServiceMock.isImageUploadRestricted.and.returnValue(true);
      chatModelServiceMock.getSelectedModelLabel.and.returnValue('Kimi-K2.6');

      const img = new File(['binary'], 'test.png', { type: 'image/png' });
      const pdf = new File(['pdf data'], 'document.pdf', { type: 'application/pdf' });

      service.addFiles([img, pdf], 'conv-101');

      expect(toastServiceMock.show).toHaveBeenCalledWith(
        'Kimi-K2.6 does not support image uploads.',
        'error'
      );
      expect(service.filePreviews().length).toBe(1);
      expect(service.filePreviews()[0].name).toBe('document.pdf');

      const req = httpMock.expectOne('https://azure.test/indexer/indexer');
      req.flush({ doc_id: 'doc-pdf-1' });
      expect(service.filePreviews()[0].uploaded).toBeTrue();
    });

    it('should remove image files using removeImageFiles and return count', () => {
      const img1: FilePreview = {
        file: new File([], 'photo.jpg', { type: 'image/jpeg' }),
        name: 'photo.jpg',
        size: 100,
        uploading: false,
        progress: 100,
        uploaded: true,
      };
      const pdf1: FilePreview = {
        file: new File([], 'doc.pdf', { type: 'application/pdf' }),
        name: 'doc.pdf',
        size: 200,
        uploading: false,
        progress: 100,
        uploaded: true,
      };
      const img2: FilePreview = {
        file: new File([], 'diagram.png', { type: 'image/png' }),
        name: 'diagram.png',
        size: 300,
        uploading: false,
        progress: 100,
        uploaded: true,
      };

      service.filePreviews.set([img1, pdf1, img2]);

      const removed = service.removeImageFiles();
      expect(removed).toBe(2);
      expect(service.filePreviews().length).toBe(1);
      expect(service.filePreviews()[0].name).toBe('doc.pdf');
    });
  });
});
