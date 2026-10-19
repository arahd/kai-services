import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { LinkedInValidationService } from './linked-in-validation.service';
import { ConfigService } from '@core/services/config.service';
import { Subject } from 'rxjs';

describe('LinkedInValidationService', () => {
  let service: LinkedInValidationService;
  let httpMock: HttpTestingController;
  let mockConfigService: any;

  beforeEach(() => {
    sessionStorage.clear();
    mockConfigService = {
      getHrPortalUrl: () => 'https://api.test/hr-portal'
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        LinkedInValidationService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Router, useValue: { events: new Subject().asObservable(), url: '/hrportal' } }
      ]
    });

    service = TestBed.inject(LinkedInValidationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    sessionStorage.clear();
  });

  it('should validate LinkedIn URL with file payload', () => {
    const resume = new File(['r'], 'resume.pdf', { type: 'application/pdf' });
    service.validateLinkedInUrl(resume, null, 'https://linkedin.com/in/test').subscribe();

    const req = httpMock.expectOne('https://api.test/hr-portal/assess/linkedin');
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'SUCCESS', data: { matchScore: 95 } });
  });

  it('should persist and load state from sessionStorage', (done) => {
    service.setLinkedInState({
      status: 'SUCCESS',
      data: { score: 90 }
    });

    expect(sessionStorage.getItem('kai_hr_linkedin_state')).toContain('"status":"SUCCESS"');

    service.linkedInValData$.subscribe((state) => {
      if (state.status === 'SUCCESS') {
        expect(state.data).toEqual({ score: 90 });

        service.reset();
        expect(sessionStorage.getItem('kai_hr_linkedin_state')).toBeNull();
        done();
      }
    });
  });
});
