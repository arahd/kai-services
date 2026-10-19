import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { VisaProcessService } from './visa-process.service';
import { ConfigService } from '@core/services/config.service';

describe('VisaProcessService', () => {
  let service: VisaProcessService;
  let httpMock: HttpTestingController;
  let mockConfigService: any;

  beforeEach(() => {
    mockConfigService = {
      getHrPortalUrl: () => 'https://hrportal.test'
    };

    TestBed.configureTestingModule({
      providers: [
        VisaProcessService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: mockConfigService }
      ]
    });

    service = TestBed.inject(VisaProcessService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should send POST request to process visa without format_rules', () => {
    const resume = new File(['test'], 'resume.pdf');
    const indianLetter = new File(['test'], 'indian.pdf');
    const canadaLetter = new File(['test'], 'canada.pdf');

    service.processVisa('ict', resume, indianLetter, canadaLetter).subscribe();

    const req = httpMock.expectOne('https://hrportal.test/visa/process');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.has('resume_file')).toBeTrue();
    expect(req.request.body.has('type_of_visa_process')).toBeTrue();
    expect(req.request.body.has('indian_letter_file')).toBeTrue();
    expect(req.request.body.has('canada_letter_file')).toBeTrue();
    expect(req.request.body.has('format_rules')).toBeFalse();
    req.flush({
      success: true,
      document_format_issues: [],
      document_content_issues: {
        document_inconsistency: [],
        missing_items: [],
        grammatical: [],
        miscellaneous: []
      }
    });
  });
});
