import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer } from '@angular/platform-browser';
import { HttpEventType, HttpResponse, HttpHeaderResponse } from '@angular/common/http';
import { of, throwError, Subject } from 'rxjs';
import { Component, Input, Output, EventEmitter } from '@angular/core';

import { ResumeStandardizerComponent } from './resume-standardizer.component';
import {
  ResumeStandardizerService,
  ResumeGenerateResponse,
} from '../../hr-portal-services/resume-standardizer.service';
import { FileDownloadService } from '@shared/services/file-download.service';
import { ToastService } from '@core/services/toast.service';
import { HrIconComponent } from '../../components/hr-icon/hr-icon.component';
import { HrLoaderComponent } from '../../components/hr-loader/hr-loader.component';

// ── Stub for FileDropzoneComponent ───────────────────────────────────────
@Component({
  selector: 'app-file-dropzone',
  standalone: true,
  template: '',
})
class FileDropzoneStubComponent {
  @Input() label = '';
  @Input() accept = '';
  @Input() file: File | null = null;
  @Input() files: File[] = [];
  @Input() maxFiles = 5;
  @Input() errorMessage = '';
  @Input() buttonText = '';
  @Input() helperText = '';
  @Input() uploading = false;
  @Input() progress = 0;
  @Input() uploadedLayout = false;
  @Input() multiple = false;
  @Output() fileSelected = new EventEmitter<File | null>();
  @Output() previewFile = new EventEmitter<File>();
  @Output() filesSelected = new EventEmitter<File[]>();
  @Output() removeFileAtIndex = new EventEmitter<number>();
}

// ── Helpers ──────────────────────────────────────────────────────────────
function createMockFile(
  name: string,
  sizeBytes: number,
  type: string,
): File {
  const content = new ArrayBuffer(sizeBytes);
  return new File([content], name, { type });
}

describe('ResumeStandardizerComponent', () => {
  let component: ResumeStandardizerComponent;
  let fixture: ComponentFixture<ResumeStandardizerComponent>;
  let resumeServiceMock: any;
  let fileDownloadServiceMock: any;
  let toastServiceMock: any;
  let sanitizerMock: any;

  beforeEach(async () => {
    resumeServiceMock = {
      generateResume: jasmine.createSpy('generateResume').and.returnValue(of()),
      downloadResume: jasmine.createSpy('downloadResume').and.returnValue(of()),
    };

    fileDownloadServiceMock = {
      downloadFile: jasmine.createSpy('downloadFile'),
      parseBlobError: jasmine.createSpy('parseBlobError').and.returnValue(Promise.resolve(null)),
    };

    toastServiceMock = {
      show: jasmine.createSpy('show'),
    };

    sanitizerMock = {
      bypassSecurityTrustResourceUrl: jasmine
        .createSpy('bypassSecurityTrustResourceUrl')
        .and.callFake((url: string) => `safe:${url}`),
    };

    await TestBed.configureTestingModule({
      imports: [
        ResumeStandardizerComponent,
        CommonModule,
        FormsModule,
        FileDropzoneStubComponent,
      ],
      providers: [
        { provide: ResumeStandardizerService, useValue: resumeServiceMock },
        { provide: FileDownloadService, useValue: fileDownloadServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: DomSanitizer, useValue: sanitizerMock },
      ],
    })
      .overrideComponent(ResumeStandardizerComponent, {
        set: {
          imports: [CommonModule, FormsModule, FileDropzoneStubComponent, HrIconComponent, HrLoaderComponent],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ResumeStandardizerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  // ── Creation ─────────────────────────────────────────────────────────
  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should initialise with upload view state', () => {
    expect(component.viewState()).toBe('upload');
  });

  it('should default activeTab to missing', () => {
    expect(component.activeTab()).toBe('missing');
  });

  // ── onResumeSelected ─────────────────────────────────────────────────
  describe('onResumeSelected', () => {
    it('should accept a valid PDF file', () => {
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      component.onResumeSelected(file);
      expect(component.resumeFile).toBe(file);
      expect(component.resumeError).toBe('');
    });

    it('should accept a valid DOCX file', () => {
      const file = createMockFile(
        'resume.docx',
        1024,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      component.onResumeSelected(file);
      expect(component.resumeFile).toBe(file);
    });

    it('should accept a PDF file by extension even if mime type is empty', () => {
      const file = createMockFile('resume.pdf', 1024, '');
      component.onResumeSelected(file);
      expect(component.resumeFile).toBe(file);
      expect(component.resumeError).toBe('');
    });

    it('should reject an unsupported file type', () => {
      const file = createMockFile('photo.png', 1024, 'image/png');
      component.onResumeSelected(file);
      expect(component.resumeFile).toBeNull();
      expect(component.resumeError).toBe('Please upload a PDF or DOCX file.');
    });

    it('should reject a file larger than 10 MB', () => {
      const file = createMockFile('large.pdf', 11 * 1024 * 1024, 'application/pdf');
      component.onResumeSelected(file);
      expect(component.resumeFile).toBeNull();
      expect(component.resumeError).toBe('File size must be under 10 MB.');
    });

    it('should clear resumeFile when null is passed', () => {
      component.resumeFile = createMockFile('r.pdf', 100, 'application/pdf');
      component.onResumeSelected(null);
      expect(component.resumeFile).toBeNull();
    });

    it('should clear previous error when a new file is selected', () => {
      component.resumeError = 'old error';
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      component.onResumeSelected(file);
      expect(component.resumeError).toBe('');
    });
  });

  // ── onTemplateSelected ───────────────────────────────────────────────
  describe('onTemplateSelected', () => {
    it('should accept a valid PDF template', () => {
      const file = createMockFile('template.pdf', 2048, 'application/pdf');
      component.onTemplateSelected(file);
      expect(component.templateFile).toBe(file);
      expect(component.templateError).toBe('');
    });

    it('should reject an unsupported template file type', () => {
      const file = createMockFile('template.xlsx', 2048, 'application/vnd.ms-excel');
      component.onTemplateSelected(file);
      expect(component.templateFile).toBeNull();
      expect(component.templateError).toBe('Please upload a PDF or DOCX file.');
    });

    it('should reject a template larger than 10 MB', () => {
      const file = createMockFile('big.pdf', 11 * 1024 * 1024, 'application/pdf');
      component.onTemplateSelected(file);
      expect(component.templateFile).toBeNull();
      expect(component.templateError).toBe('File size must be under 10 MB.');
    });

    it('should clear templateFile when null is passed', () => {
      component.templateFile = createMockFile('t.pdf', 100, 'application/pdf');
      component.onTemplateSelected(null);
      expect(component.templateFile).toBeNull();
    });
  });

  // ── File removal ─────────────────────────────────────────────────────
  describe('removeResume', () => {
    it('should clear resumeFile and resumeError', () => {
      component.resumeFile = createMockFile('r.pdf', 100, 'application/pdf');
      component.resumeError = 'something';
      component.removeResume();
      expect(component.resumeFile).toBeNull();
      expect(component.resumeError).toBe('');
    });
  });

  describe('removeTemplate', () => {
    it('should clear templateFile and templateError', () => {
      component.templateFile = createMockFile('t.pdf', 100, 'application/pdf');
      component.templateError = 'something';
      component.removeTemplate();
      expect(component.templateFile).toBeNull();
      expect(component.templateError).toBe('');
    });
  });

  // ── Preview getters ──────────────────────────────────────────────────
  describe('preview type getters', () => {
    it('isPreviewImage should return true for image files', () => {
      component.previewFile = { name: 'photo.jpg' };
      expect(component.isPreviewImage).toBeTrue();

      component.previewFile = { name: 'icon.svg' };
      expect(component.isPreviewImage).toBeTrue();
    });

    it('isPreviewImage should return false for non-image files', () => {
      component.previewFile = { name: 'doc.pdf' };
      expect(component.isPreviewImage).toBeFalse();
    });

    it('isPreviewPdf should return true for PDF files', () => {
      component.previewFile = { name: 'resume.pdf' };
      expect(component.isPreviewPdf).toBeTrue();
    });

    it('isPreviewPdf should return false for non-PDF files', () => {
      component.previewFile = { name: 'resume.docx' };
      expect(component.isPreviewPdf).toBeFalse();
    });

    it('isPreviewText should return true for text-like files', () => {
      component.previewFile = { name: 'notes.txt' };
      expect(component.isPreviewText).toBeTrue();

      component.previewFile = { name: 'data.json' };
      expect(component.isPreviewText).toBeTrue();

      component.previewFile = { name: 'script.py' };
      expect(component.isPreviewText).toBeTrue();
    });

    it('isPreviewText should return false for binary files', () => {
      component.previewFile = { name: 'app.exe' };
      expect(component.isPreviewText).toBeFalse();
    });

    it('all preview getters should return false when previewFile is null', () => {
      component.previewFile = null;
      expect(component.isPreviewImage).toBeFalse();
      expect(component.isPreviewPdf).toBeFalse();
      expect(component.isPreviewText).toBeFalse();
    });
  });

  // ── getFileExtension ─────────────────────────────────────────────────
  describe('getFileExtension', () => {
    it('should return uppercase extension', () => {
      expect(component.getFileExtension('resume.pdf')).toBe('PDF');
      expect(component.getFileExtension('data.json')).toBe('JSON');
    });

    it('should return empty string for name without extension', () => {
      expect(component.getFileExtension('')).toBe('');
    });
  });

  // ── getFileSize ──────────────────────────────────────────────────────
  describe('getFileSize', () => {
    it('should return "0 B" for zero', () => {
      expect(component.getFileSize(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(component.getFileSize(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(component.getFileSize(1024)).toBe('1 KB');
    });

    it('should format megabytes', () => {
      expect(component.getFileSize(1048576)).toBe('1 MB');
    });

    it('should format with decimals', () => {
      expect(component.getFileSize(1536)).toBe('1.5 KB');
    });
  });

  // ── submitResume ─────────────────────────────────────────────────────
  describe('submitResume', () => {
    it('should set resumeError when no file is selected', () => {
      component.resumeFile = null;
      component.submitResume();
      expect(component.resumeError).toBe('Please select a resume file.');
      expect(resumeServiceMock.generateResume).not.toHaveBeenCalled();
    });

    it('should call generateResume and track upload progress', () => {
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      component.resumeFile = file;

      const progressEvent = {
        type: HttpEventType.UploadProgress,
        loaded: 512,
        total: 1024,
      };

      resumeServiceMock.generateResume.and.returnValue(of(progressEvent));
      component.submitResume();

      expect(resumeServiceMock.generateResume).toHaveBeenCalledWith(file);
      expect(component.uploadProgress()).toBe(50);
      expect(component.isUploading()).toBeTrue();
      expect(component.viewState()).toBe('processing');
    });

    it('should handle successful response and load PDF preview', () => {
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      component.resumeFile = file;

      const responseBody: ResumeGenerateResponse = {
        success: true,
        blob_path: 'test/blob/path',
      };

      const responseEvent = new HttpResponse<ResumeGenerateResponse>({
        body: responseBody,
        status: 200,
      });

      // Mock the download for loadPdfPreview
      const pdfBlob = new Blob(['pdf content'], { type: 'application/pdf' });
      const downloadResponse = new HttpResponse<Blob>({
        body: pdfBlob,
        status: 200,
      });

      resumeServiceMock.generateResume.and.returnValue(of(responseEvent));
      resumeServiceMock.downloadResume.and.returnValue(of(downloadResponse));

      // Mock createObjectURL
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:mock-url');

      component.submitResume();

      expect(component.blobPath).toBe('test/blob/path');
      expect(component.blobPathPdf).toBe('test/blob/path');
      expect(component.pdfFileName).toBe('resume_standardized.pdf');
      expect(resumeServiceMock.downloadResume).toHaveBeenCalledWith('test/blob/path');
      expect(component.viewState()).toBe('results');
      expect(component.isUploading()).toBeFalse();
    });

    it('should handle dual blob_path_pdf and blob_path_docx response format', () => {
      const file = createMockFile('Priya_Sharma.pdf', 1024, 'application/pdf');
      component.resumeFile = file;

      const responseBody: ResumeGenerateResponse = {
        success: true,
        blob_path_pdf: 'resume-builder/2026-07-30/Priya_Sharma_pdf.pdf',
        blob_path_docx: 'resume-builder/2026-07-30/Priya_Sharma_docx.docx',
      };

      const responseEvent = new HttpResponse<ResumeGenerateResponse>({
        body: responseBody,
        status: 200,
      });

      const pdfBlob = new Blob(['pdf content'], { type: 'application/pdf' });
      const downloadResponse = new HttpResponse<Blob>({
        body: pdfBlob,
        status: 200,
      });

      resumeServiceMock.generateResume.and.returnValue(of(responseEvent));
      resumeServiceMock.downloadResume.and.returnValue(of(downloadResponse));
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:mock-url');

      component.submitResume();

      expect(component.blobPathPdf).toBe('resume-builder/2026-07-30/Priya_Sharma_pdf.pdf');
      expect(component.blobPathDocx).toBe('resume-builder/2026-07-30/Priya_Sharma_docx.docx');
      expect(component.pdfFileName).toBe('Priya_Sharma_standardized.pdf');
      expect(component.docxFileName).toBe('Priya_Sharma_standardized.docx');
      expect(resumeServiceMock.downloadResume).toHaveBeenCalledWith('resume-builder/2026-07-30/Priya_Sharma_pdf.pdf');
      expect(component.viewState()).toBe('results');
    });

    it('should filter out empty extra_details such as duplicate_records with empty arrays', () => {
      const file = createMockFile('Deep_Mehta.pdf', 1024, 'application/pdf');
      component.resumeFile = file;

      const responseBody: ResumeGenerateResponse = {
        success: true,
        blob_path_pdf: 'test.pdf',
        extra_details: {
          duplicate_records: {
            certifications: [],
            education: [],
            employment_history: [],
            projects: [],
            skills: [],
          },
          links: ['https://github.com/deep-mm'],
          portfolio: 'https://deepmehta.co.in/',
        },
        missing_details: {
          certification_years: 'Years not specified for listed certifications.',
          phone: '',
        },
      };

      const responseEvent = new HttpResponse<ResumeGenerateResponse>({
        body: responseBody,
        status: 200,
      });

      const pdfBlob = new Blob(['pdf content'], { type: 'application/pdf' });
      resumeServiceMock.generateResume.and.returnValue(of(responseEvent));
      resumeServiceMock.downloadResume.and.returnValue(
        of(new HttpResponse<Blob>({ body: pdfBlob })),
      );
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:mock-url');

      component.submitResume();

      expect(component.missingDetails.length).toBe(1);
      expect(component.missingDetails[0].heading).toBe('Certification Years');

      expect(component.extraDetails.length).toBe(2);
      const headings = component.extraDetails.map((d) => d.heading);
      expect(headings).toContain('Links');
      expect(headings).toContain('Portfolio');
      expect(headings).not.toContain('Duplicate Records');
    });

    it('should handle failed response (success=false)', () => {
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      component.resumeFile = file;

      const responseBody: ResumeGenerateResponse = {
        success: false,
        blob_path: '',
      };

      const responseEvent = new HttpResponse<ResumeGenerateResponse>({
        body: responseBody,
        status: 200,
      });

      resumeServiceMock.generateResume.and.returnValue(of(responseEvent));
      component.submitResume();

      expect(toastServiceMock.show).toHaveBeenCalledWith(
        'Resume generation failed. Please try again.',
        'error',
      );
      expect(component.viewState()).toBe('upload');
      expect(component.isUploading()).toBeFalse();
    });

    it('should handle HTTP error during generation', () => {
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      component.resumeFile = file;

      const httpError = {
        error: { message: 'Server is down' },
      };

      resumeServiceMock.generateResume.and.returnValue(throwError(() => httpError));
      component.submitResume();

      expect(toastServiceMock.show).toHaveBeenCalledWith('Server is down', 'error');
      expect(component.viewState()).toBe('upload');
      expect(component.isUploading()).toBeFalse();
    });

    it('should show default error message when API error has no message', () => {
      const file = createMockFile('resume.pdf', 1024, 'application/pdf');
      component.resumeFile = file;

      resumeServiceMock.generateResume.and.returnValue(throwError(() => ({})));
      component.submitResume();

      expect(toastServiceMock.show).toHaveBeenCalledWith(
        'An error occurred while generating the resume. Please try again.',
        'error',
      );
    });
  });

  // ── downloadPdf ──────────────────────────────────────────────────────
  describe('downloadPdf', () => {
    it('should do nothing when blobPath is empty', () => {
      component.blobPath = '';
      component.downloadPdf();
      expect(resumeServiceMock.downloadResume).not.toHaveBeenCalled();
    });

    it('should download and call fileDownloadService', () => {
      component.blobPath = 'some/path';
      component.pdfFileName = 'test.pdf';

      const downloadResponse = new HttpResponse<Blob>({
        body: new Blob(['pdf']),
        status: 200,
      });

      resumeServiceMock.downloadResume.and.returnValue(of(downloadResponse));
      component.downloadPdf();

      expect(component.isDownloading()).toBeFalse();
      expect(fileDownloadServiceMock.downloadFile).toHaveBeenCalledWith(
        downloadResponse,
        'test.pdf',
      );
    });

    it('should handle download error and show toast', fakeAsync(() => {
      component.blobPath = 'some/path';

      const httpError = { error: new Blob(['{"message":"Not found"}']) };
      fileDownloadServiceMock.parseBlobError.and.returnValue(
        Promise.resolve({ message: 'Not found' }),
      );

      resumeServiceMock.downloadResume.and.returnValue(throwError(() => httpError));
      component.downloadPdf();
      tick();

      expect(toastServiceMock.show).toHaveBeenCalledWith('Not found', 'error');
      expect(component.isDownloading()).toBeFalse();
    }));

    it('should show default download error message when parseBlobError returns null', fakeAsync(() => {
      component.blobPath = 'some/path';
      fileDownloadServiceMock.parseBlobError.and.returnValue(Promise.resolve(null));

      resumeServiceMock.downloadResume.and.returnValue(throwError(() => ({})));
      component.downloadPdf();
      tick();

      expect(toastServiceMock.show).toHaveBeenCalledWith(
        'Unable to download resume. Please try again.',
        'error',
      );
    }));
  });

  // ── downloadDocx ─────────────────────────────────────────────────────
  describe('downloadDocx', () => {
    it('should do nothing when blobPathDocx is empty', () => {
      component.blobPathDocx = '';
      component.downloadDocx();
      expect(resumeServiceMock.downloadResume).not.toHaveBeenCalled();
    });

    it('should download docx file and call fileDownloadService', () => {
      component.blobPathDocx = 'resume-builder/2026-07-30/Priya_Sharma_docx.docx';
      component.docxFileName = 'Priya_Sharma_standardized.docx';

      const downloadResponse = new HttpResponse<Blob>({
        body: new Blob(['docx content']),
        status: 200,
      });

      resumeServiceMock.downloadResume.and.returnValue(of(downloadResponse));
      component.downloadDocx();

      expect(resumeServiceMock.downloadResume).toHaveBeenCalledWith('resume-builder/2026-07-30/Priya_Sharma_docx.docx');
      expect(fileDownloadServiceMock.downloadFile).toHaveBeenCalledWith(
        downloadResponse,
        'Priya_Sharma_standardized.docx',
      );
    });
  });

  // ── toggleDownloadDropdown ───────────────────────────────────────────
  describe('toggleDownloadDropdown', () => {
    it('should toggle downloadDropdownOpen signal', () => {
      expect(component.downloadDropdownOpen()).toBeFalse();
      component.toggleDownloadDropdown();
      expect(component.downloadDropdownOpen()).toBeTrue();
      component.toggleDownloadDropdown();
      expect(component.downloadDropdownOpen()).toBeFalse();
    });

    it('should close dropdown when clicking outside', () => {
      component.downloadDropdownOpen.set(true);
      const dummyElement = document.createElement('div');
      document.body.appendChild(dummyElement);

      dummyElement.click();

      expect(component.downloadDropdownOpen()).toBeFalse();
      document.body.removeChild(dummyElement);
    });
  });

  // ── toggleFullscreen ─────────────────────────────────────────────────
  describe('toggleFullscreen', () => {
    it('should toggle fullscreen state', () => {
      expect(component.isFullscreen()).toBeFalse();
      component.toggleFullscreen();
      expect(component.isFullscreen()).toBeTrue();
      component.toggleFullscreen();
      expect(component.isFullscreen()).toBeFalse();
    });
  });

  // ── setTab ───────────────────────────────────────────────────────────
  describe('setTab', () => {
    it('should switch active tab', () => {
      component.setTab('additional');
      expect(component.activeTab()).toBe('additional');
      component.setTab('missing');
      expect(component.activeTab()).toBe('missing');
    });
  });

  // ── startOver ────────────────────────────────────────────────────────
  describe('startOver', () => {
    it('should reset all state back to upload', () => {
      // Set up dirty state
      component.resumeFile = createMockFile('r.pdf', 100, 'application/pdf');
      component.resumeError = 'err';
      component.templateFile = createMockFile('t.pdf', 100, 'application/pdf');
      component.templateError = 'err2';
      component.blobPath = 'path';
      component.pdfBlobUrl = 'blob:url';
      component.safePdfUrl = 'safe-url' as any;
      component.uploadProgress.set(75);
      component.isUploading.set(true);
      component.viewState.set('results');

      spyOn(window.URL, 'revokeObjectURL');

      component.startOver();

      expect(component.resumeFile).toBeNull();
      expect(component.resumeError).toBe('');
      expect(component.templateFile).toBeNull();
      expect(component.templateError).toBe('');
      expect(component.blobPath).toBe('');
      expect(component.pdfBlobUrl).toBeNull();
      expect(component.safePdfUrl).toBeNull();
      expect(component.uploadProgress()).toBe(0);
      expect(component.isUploading()).toBeFalse();
      expect(component.viewState()).toBe('upload');
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:url');
    });
  });

  // ── closeFilePreview ─────────────────────────────────────────────────
  describe('closeFilePreview', () => {
    it('should clear all preview state', () => {
      component.previewFile = { name: 'test.pdf' };
      component.previewFileUrl = 'blob:some-url';
      component.safePreviewUrl = 'safe-url' as any;
      component.previewTextContent = 'content';

      spyOn(window.URL, 'revokeObjectURL');

      component.closeFilePreview();

      expect(component.previewFile).toBeNull();
      expect(component.previewFileUrl).toBeNull();
      expect(component.safePreviewUrl).toBeNull();
      expect(component.previewTextContent).toBeNull();
      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:some-url');
    });

    it('should not revoke non-blob URLs', () => {
      component.previewFile = { name: 'test.txt' };
      component.previewFileUrl = null;

      spyOn(window.URL, 'revokeObjectURL');
      component.closeFilePreview();

      expect(window.URL.revokeObjectURL).not.toHaveBeenCalled();
    });
  });

  // ── onPreviewLocalFile ───────────────────────────────────────────────
  describe('onPreviewLocalFile', () => {
    it('should set previewFileUrl for image files', () => {
      const file = createMockFile('photo.jpg', 100, 'image/jpeg');
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:image-url');

      component.onPreviewLocalFile(file);

      expect(component.previewFile).toBe(file);
      expect(component.previewFileUrl).toBe('blob:image-url');
    });

    it('should set safePreviewUrl for PDF files', () => {
      const file = createMockFile('doc.pdf', 100, 'application/pdf');
      spyOn(window.URL, 'createObjectURL').and.returnValue('blob:pdf-url');

      component.onPreviewLocalFile(file);

      expect(component.previewFileUrl).toBe('blob:pdf-url');
      expect(sanitizerMock.bypassSecurityTrustResourceUrl).toHaveBeenCalledWith('blob:pdf-url');
    });

    it('should not do anything for null/falsy file', () => {
      component.onPreviewLocalFile(null as any);
      expect(component.previewFile).toBeNull();
    });
  });

  // ── ngOnDestroy ──────────────────────────────────────────────────────
  describe('ngOnDestroy', () => {
    it('should clean up blob URL on destroy', () => {
      component.pdfBlobUrl = 'blob:cleanup-url';
      spyOn(window.URL, 'revokeObjectURL');

      component.ngOnDestroy();

      expect(window.URL.revokeObjectURL).toHaveBeenCalledWith('blob:cleanup-url');
    });

    it('should not throw when no blob URL exists', () => {
      component.pdfBlobUrl = null;
      expect(() => component.ngOnDestroy()).not.toThrow();
    });
  });
});
