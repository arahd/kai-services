import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { ResumeStandardizerService } from './resume-standardizer.service';
import { ConfigService } from '@core/services/config.service';

describe('ResumeStandardizerService', () => {
  let service: ResumeStandardizerService;
  let httpMock: HttpTestingController;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      getHrPortalUrl: () => 'https://hrportal.test'
    };

    TestBed.configureTestingModule({
      providers: [
        ResumeStandardizerService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: mockConfigService }
      ]
    });

    service = TestBed.inject(ResumeStandardizerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send POST request to generate resume', () => {
    const file = new File(['test'], 'resume.docx');
    service.generateResume(file).subscribe();

    const req = httpMock.expectOne('https://hrportal.test/generate/resume/db');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.has('resume_file')).toBeTrue();
    req.flush({ success: true });
  });

  it('should send POST request with template file when provided', () => {
    const file = new File(['test'], 'resume.docx');
    const template = new File(['template'], 'template.docx');
    service.generateResume(file, template).subscribe();

    const req = httpMock.expectOne('https://hrportal.test/generate/resume/db');
    expect(req.request.body.has('template_file')).toBeTrue();
    req.flush({ success: true });
  });

  it('should send GET request to download resume', () => {
    service.downloadResume('blob-123').subscribe();

    const req = httpMock.expectOne('https://hrportal.test/resume_db/download/blob-123');
    expect(req.request.method).toBe('GET');
    req.flush(new Blob());
  });
});
