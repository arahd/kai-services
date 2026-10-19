import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { ResumeDashboardComponent } from '@features/hr-portal/pages/resume-dashboard/resume-dashboard.component';
import { ConfigService } from '@core/services/config.service';

describe('ResumeDashboardComponent', () => {
  let component: ResumeDashboardComponent;
  let fixture: ComponentFixture<ResumeDashboardComponent>;
  let configServiceMock: any;

  beforeEach(async () => {
    configServiceMock = {
      getHrPortalUrl: () => 'https://test-url',
      loadConfig: () => Promise.resolve(),
    };

    await TestBed.configureTestingModule({
      imports: [ResumeDashboardComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        { provide: ConfigService, useValue: configServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ResumeDashboardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should compute file extension correctly', () => {
    expect(component.getFileExtension('sample.pdf')).toBe('PDF');
    expect(component.getFileExtension('test.DOCX')).toBe('DOCX');
    expect(component.getFileExtension('')).toBe('');
  });

  it('should handle previewing image, pdf, and text files', () => {
    const imgFile = new File([''], 'photo.png', { type: 'image/png' });
    component.onPreviewLocalFile(imgFile);
    expect(component.isPreviewImage).toBeTrue();
    expect(component.previewFile).toBe(imgFile);
    component.closeFilePreview();
    expect(component.previewFile).toBeNull();

    const pdfFile = new File([''], 'doc.pdf', { type: 'application/pdf' });
    component.onPreviewLocalFile(pdfFile);
    expect(component.isPreviewPdf).toBeTrue();
    component.closeFilePreview();

    const txtFile = new File(['hello text'], 'notes.txt', { type: 'text/plain' });
    component.onPreviewLocalFile(txtFile);
    expect(component.isPreviewText).toBeTrue();
    component.closeFilePreview();
  });

  it('should switch uploadTab correctly', () => {
    expect(component.uploadTab()).toBe('jd');
    component.uploadTab.set('linkedin');
    expect(component.uploadTab()).toBe('linkedin');
  });

  it('should format URLs and validate URLs correctly', () => {
    expect(component.ensureUrl('google.com')).toBe('https://google.com');
    expect(component.ensureUrl('http://example.com')).toBe('http://example.com');
    expect(component.ensureUrl('')).toBe('');

    expect(component.isUrl('https://github.com')).toBeTrue();
    expect(component.isUrl('linkedin.com/in/user')).toBeTrue();
    expect(component.isUrl('')).toBeFalse();
  });

  it('should compute initials and font sizes dynamically', () => {
    expect(component.candidateInitials()).toBe('C');
    expect(component.nameFontSize()).toBe('20px');
    expect(component.jobTitleFontSize()).toBe('16px');
    expect(component.contactFontSize()).toBe('14px');
  });
});
