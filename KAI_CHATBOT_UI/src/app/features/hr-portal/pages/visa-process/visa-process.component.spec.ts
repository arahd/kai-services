import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpEventType, HttpResponse } from '@angular/common/http';
import { Component, Input, Output, EventEmitter } from '@angular/core';
import { of, throwError } from 'rxjs';

import { VisaProcessComponent } from './visa-process.component';
import { VisaProcessService, VisaProcessResponse } from '../../hr-portal-services/visa-process.service';
import { ToastService } from '@core/services/toast.service';
import { HrIconComponent } from '../../components/hr-icon/hr-icon.component';
import { HrPermissionService } from '../../hr-portal-services/hr-permission.service';

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

// ── Helper to create mock File objects ──────────────────────────────────
function createMockFile(name: string, sizeBytes: number, type: string): File {
  const content = new ArrayBuffer(sizeBytes);
  return new File([content], name, { type });
}

describe('VisaProcessComponent', () => {
  let component: VisaProcessComponent;
  let fixture: ComponentFixture<VisaProcessComponent>;
  let visaServiceMock: jasmine.SpyObj<VisaProcessService>;
  let toastServiceMock: jasmine.SpyObj<ToastService>;

  const mockSuccessfulResponse: VisaProcessResponse = {
    success: true,
    email_id: 'adithya@kumaran.com',
    process: 'Visa',
    type_of_visa_process: 'ict',
    token_used: 7827,
    document_format_issues: [
      {
        document_name: 'exhaustive_letter_test.docx',
        document_type: 'letter',
        is_corupted: false,
        issues: [
          {
            type: 'alignment_issue',
            detected: '0',
            text_with_issue: 'This text is left-aligned instead of justified.',
          },
          {
            type: 'font_family',
            detected: 'Arial',
            text_with_issue: 'This sentence is written in Arial instead of Calibri.',
          },
        ],
      },
      {
        document_name: 'resume_clean.docx',
        document_type: 'resume',
        is_corupted: false,
        issues: [],
      },
    ],
    document_content_issues: {
      profile_type: 'developer',
      document_inconsistency: [
        {
          issue: 'Engagement date mismatch',
          inconsistency: 'The candidate initial engagement began in June 2019 while resume shows Aug 2018.',
          documents_involved: ['Resume/Profile', 'India Letter', 'Canada Letter'],
          description: 'Detailed analysis shows conflicting start dates between documents.',
        },
      ],
      missing_items: [
        {
          inconsistency: 'Proprietary tool DQV is absent from Canada letter.',
          present_in: ['India Letter'],
          missing_from: ['Canada Letter'],
          description: 'DQV experience is listed in the India letter but missing from Canada letter.',
        },
      ],
      grammatical: [
        {
          issue: 'Spelling error in Company Name',
          documents_involved: ['Canada Letter'],
          description: "Document contains 'Kumanran' instead of 'Kumaran'.",
        },
      ],
      miscellaneous: [
        {
          issue: 'Naming Convention Risk',
          documents_involved: ['India Letter', 'Canada Letter'],
          description: 'Letters refer to Whalmo Systems instead of Kumaran Systems.',
        },
      ],
    },
  };

  beforeEach(async () => {
    visaServiceMock = jasmine.createSpyObj('VisaProcessService', ['processVisa']);
    toastServiceMock = jasmine.createSpyObj('ToastService', ['show']);

    const hrPermissionServiceMock = {
      loadAccessControl: () =>
        of({
          is_admin: true,
          visa_business: true,
          visa_ict: true,
          visa_extension: true,
          resume_internal: true,
          resume_offshore: true,
          resume_onsite: true,
        }),
      hasVisaAccess: () => true,
      hasResumeAccess: () => true,
      isAdmin: () => true,
    };

    await TestBed.configureTestingModule({
      imports: [VisaProcessComponent, CommonModule, FormsModule, FileDropzoneStubComponent, HrIconComponent],
      providers: [
        { provide: VisaProcessService, useValue: visaServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
        { provide: HrPermissionService, useValue: hrPermissionServiceMock },
      ],
    })
      .overrideComponent(VisaProcessComponent, {
        set: {
          imports: [CommonModule, FormsModule, FileDropzoneStubComponent, HrIconComponent],
        },
      })
      .compileComponents();

    fixture = TestBed.createComponent(VisaProcessComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
    expect(component.viewState()).toBe('upload');
    expect(component.activeProcessTab()).toBe('business');
  });

  describe('File Validation and .doc restriction', () => {
    it('should accept valid PDF and DOCX files', () => {
      const pdfFile = createMockFile('resume.pdf', 1024, 'application/pdf');
      component.onResumeSelected(pdfFile);
      expect(component.resumeFile()).toBe(pdfFile);
      expect(component.resumeError()).toBe('');

      const docxFile = createMockFile(
        'letter.docx',
        1024,
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      );
      component.onIndianLetterSelected(docxFile);
      expect(component.indianLetterFile()).toBe(docxFile);
      expect(component.indianLetterError()).toBe('');
    });

    it('should reject legacy .doc files with explicit error', () => {
      const docFile = createMockFile('old_doc.doc', 1024, 'application/msword');
      component.onResumeSelected(docFile);
      expect(component.resumeFile()).toBeNull();
      expect(component.resumeError()).toContain('Deprecated document format (.doc)');

      component.onIndianLetterSelected(docFile);
      expect(component.indianLetterFile()).toBeNull();
      expect(component.indianLetterError()).toContain('Deprecated document format (.doc)');

      component.onCanadaLetterSelected(docFile);
      expect(component.canadaLetterFile()).toBeNull();
      expect(component.canadaLetterError()).toContain('Deprecated document format (.doc)');
    });

    it('should reject files exceeding 10MB', () => {
      const bigFile = createMockFile('large.pdf', 11 * 1024 * 1024, 'application/pdf');
      component.onResumeSelected(bigFile);
      expect(component.resumeFile()).toBeNull();
      expect(component.resumeError()).toContain('File size must be under 10 MB');
    });

    it('should handle clearing files gracefully', () => {
      component.onResumeSelected(null);
      expect(component.resumeFile()).toBeNull();
      expect(component.resumeError()).toBe('');

      component.onIndianLetterSelected(null);
      expect(component.indianLetterFile()).toBeNull();

      component.onCanadaLetterSelected(null);
      expect(component.canadaLetterFile()).toBeNull();
    });
  });

  describe('Process Tab switching and canSubmit()', () => {
    it('should switch tabs and clear unused files', () => {
      const resume = createMockFile('resume.pdf', 1024, 'application/pdf');
      const indian = createMockFile('indian.pdf', 1024, 'application/pdf');
      const canada = createMockFile('canada.pdf', 1024, 'application/pdf');

      component.onResumeSelected(resume);
      component.onIndianLetterSelected(indian);
      component.onCanadaLetterSelected(canada);

      expect(component.canSubmit()).toBeTrue();

      // Switch to ICT -> canada letter should be cleared
      component.selectProcessTab('ict');
      expect(component.activeProcessTab()).toBe('ict');
      expect(component.canadaLetterFile()).toBeNull();
      expect(component.canSubmit()).toBeTrue();

      // Switch to Extension -> indian letter should be cleared
      component.selectProcessTab('extension');
      expect(component.activeProcessTab()).toBe('extension');
      expect(component.indianLetterFile()).toBeNull();
      expect(component.canSubmit()).toBeFalse(); // because canadaLetterFile is null
    });
  });

  describe('submitVisaDocs()', () => {
    it('should submit files without format_rules and parse response into signals', () => {
      const resume = createMockFile('resume.pdf', 1024, 'application/pdf');
      const indian = createMockFile('indian.docx', 1024, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      const canada = createMockFile('canada.docx', 1024, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');

      component.onResumeSelected(resume);
      component.onIndianLetterSelected(indian);
      component.onCanadaLetterSelected(canada);

      const httpResponse = new HttpResponse<VisaProcessResponse>({
        body: mockSuccessfulResponse,
      });
      visaServiceMock.processVisa.and.returnValue(of(httpResponse));

      component.submitVisaDocs();

      expect(visaServiceMock.processVisa).toHaveBeenCalledWith(
        'business',
        resume,
        indian,
        canada,
      );

      expect(component.viewState()).toBe('results');
      expect(component.emailId()).toBe('adithya@kumaran.com');
      expect(component.tokenUsed()).toBe(7827);
      expect(component.documentFormatIssues().length).toBe(2);
      expect(component.totalFormatIssuesCount()).toBe(2);
      expect(component.totalInconsistenciesCount()).toBe(1);
      expect(component.totalMissingItemsCount()).toBe(1);
      expect(component.totalGrammaticalCount()).toBe(1);
      expect(component.totalMiscellaneousCount()).toBe(1);
      expect(component.totalIssuesCount()).toBe(6);
      expect(component.hasAnyIssues()).toBeTrue();
      expect(toastServiceMock.show).toHaveBeenCalledWith(
        'Analysis completed successfully!',
        'success',
        3000,
        'bottom-banner',
      );
    });

    it('should handle upload progress events', () => {
      const resume = createMockFile('resume.pdf', 1024, 'application/pdf');
      const indian = createMockFile('indian.pdf', 1024, 'application/pdf');
      const canada = createMockFile('canada.pdf', 1024, 'application/pdf');

      component.onResumeSelected(resume);
      component.onIndianLetterSelected(indian);
      component.onCanadaLetterSelected(canada);

      const progressEvent = {
        type: HttpEventType.UploadProgress,
        loaded: 50,
        total: 100,
      };
      visaServiceMock.processVisa.and.returnValue(of(progressEvent as any));

      component.submitVisaDocs();

      expect(component.uploadProgress()).toBe(50);
      expect(component.viewState()).toBe('processing');
    });

    it('should handle API error gracefully', () => {
      const resume = createMockFile('resume.pdf', 1024, 'application/pdf');
      const indian = createMockFile('indian.pdf', 1024, 'application/pdf');
      const canada = createMockFile('canada.pdf', 1024, 'application/pdf');

      component.onResumeSelected(resume);
      component.onIndianLetterSelected(indian);
      component.onCanadaLetterSelected(canada);

      visaServiceMock.processVisa.and.returnValue(
        throwError(() => ({ error: { message: 'Server processing failed' } })),
      );

      component.submitVisaDocs();

      expect(component.isUploading()).toBeFalse();
      expect(component.viewState()).toBe('upload');
      expect(toastServiceMock.show).toHaveBeenCalledWith(
        'Server processing failed',
        'error',
        4500,
        'bottom-banner',
      );
    });
  });

  describe('Results Navigation & Helpers', () => {
    it('should switch results category tab', () => {
      component.setResultsCategory('format');
      expect(component.activeResultsCategory()).toBe('format');
      component.setResultsCategory('missing');
      expect(component.activeResultsCategory()).toBe('missing');
    });

    it('should reset state completely', () => {
      component.viewState.set('results');
      component.emailId.set('test@test.com');
      component.profileType.set('QA tester');
      component.documentFormatIssues.set([mockSuccessfulResponse.document_format_issues![0]]);

      component.resetState();

      expect(component.viewState()).toBe('upload');
      expect(component.emailId()).toBe('');
      expect(component.profileType()).toBe('');
      expect(component.documentFormatIssues().length).toBe(0);
      expect(component.activeResultsCategory()).toBe('all');
    });

    it('should parse profile_type and display profile badge in results header', fakeAsync(() => {
      visaServiceMock.processVisa.and.returnValue(
        of(new HttpResponse({ status: 200, body: mockSuccessfulResponse }))
      );

      component.resumeFile.set(createMockFile('resume.pdf', 1024, 'application/pdf'));
      component.indianLetterFile.set(createMockFile('indian.pdf', 1024, 'application/pdf'));
      component.canadaLetterFile.set(createMockFile('canada.pdf', 1024, 'application/pdf'));
      component.selectProcessTab('business');

      component.submitVisaDocs();
      tick();
      fixture.detectChanges();

      expect(component.profileType()).toBe('developer');
      const badgeEl = fixture.nativeElement.querySelector('.vp-tag-pill--profile');
      expect(badgeEl).toBeTruthy();
      expect(badgeEl.textContent).toContain('DEVELOPER');
    }));

    it('should format issue types nicely', () => {
      expect(component.formatIssueType('alignment_issue')).toBe('Alignment Issue');
      expect(component.formatIssueType('Paragraph_Spacing_issue')).toBe('Paragraph Spacing Issue');
      expect(component.formatIssueType('font_family')).toBe('Font Family');
    });

    it('should return correct document badge classes', () => {
      expect(component.getDocumentBadgeClass('India Letter')).toBe('doc-tag--india');
      expect(component.getDocumentBadgeClass('Canada Letter')).toBe('doc-tag--canada');
      expect(component.getDocumentBadgeClass('Resume/Profile')).toBe('doc-tag--resume');
      expect(component.getDocumentBadgeClass('Other Document')).toBe('doc-tag--general');
    });

    it('should display format not supported for PDF when is_pdf is true', () => {
      component.viewState.set('results');
      component.documentFormatIssues.set([
        {
          document_name: 'test_passport.pdf',
          document_type: 'letter',
          is_pdf: true,
          issues: [],
        },
      ]);
      fixture.detectChanges();

      const badgeEl = fixture.nativeElement.querySelector('.vp-badge--unsupported');
      expect(badgeEl).toBeTruthy();
      expect(badgeEl.textContent).toContain('Document format not supported for PDF');

      const cleanMsgEl = fixture.nativeElement.querySelector('.vp-doc-card__clean-msg--unsupported');
      expect(cleanMsgEl).toBeTruthy();
      expect(cleanMsgEl.textContent).toContain('Document format analysis is not supported for PDF files');
    });
  });
});

