import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { JdFitService } from './jd-fit.service';
import { ConfigService } from '@core/services/config.service';
import { Subject } from 'rxjs';

describe('JdFitService', () => {
  let service: JdFitService;
  let httpMock: HttpTestingController;
  let mockConfigService: any;
  let routerEvents$: Subject<any>;

  beforeEach(() => {
    routerEvents$ = new Subject();
    mockConfigService = {
      getHrPortalUrl: () => 'https://api.test/hr-portal'
    };

    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        JdFitService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: Router, useValue: { events: routerEvents$.asObservable(), url: '/hrportal' } }
      ]
    });

    service = TestBed.inject(JdFitService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should upload single resume and JD files', () => {
    const resume = new File(['resume content'], 'resume.pdf', { type: 'application/pdf' });
    const jd = new File(['jd content'], 'jd.pdf', { type: 'application/pdf' });

    service.uploadFiles(resume, jd, 'John Doe').subscribe();

    const req = httpMock.expectOne('https://api.test/hr-portal/assess/jd-fit');
    expect(req.request.method).toBe('POST');
    req.flush({ data: { score: 90 } });
  });

  it('should upload multiple resumes and JD file', () => {
    const resume1 = new File(['r1'], 'r1.pdf', { type: 'application/pdf' });
    const resume2 = new File(['r2'], 'r2.pdf', { type: 'application/pdf' });
    const jd = new File(['jd content'], 'jd.pdf', { type: 'application/pdf' });

    service.uploadMultipleFiles([resume1, resume2], jd).subscribe();

    const req = httpMock.expectOne('https://api.test/hr-portal/assess/jd-fit-multiple');
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'success' });
  });

  it('should set and reset state', (done) => {
    service.setResumeState({
      status: 'SUCCESS',
      data: { candidate: 'Jane' },
      blobKey: 'blob-123',
      viewMode: 'single-result',
      multiUploadSummary: null
    });

    service.resumeData$.subscribe((state) => {
      if (state.status === 'SUCCESS') {
        expect(state.blobKey).toBe('blob-123');
        expect(state.data).toEqual({ candidate: 'Jane' });

        service.reset();
      } else if (state.status === 'INITIAL') {
        expect(state.data).toBeNull();
        done();
      }
    });
  });

  it('should download fitment report blob and retrieve blob data', () => {
    service.downloadJdFit('blob-999').subscribe();
    const dlReq = httpMock.expectOne('https://api.test/hr-portal/fitment-report/download/blob-999');
    expect(dlReq.request.method).toBe('GET');
    dlReq.flush(new Blob(['pdf content']));

    service.retrieveBlobData('blob-999').subscribe((res) => {
      expect(res).toEqual({ candidate: 'Test' });
    });
    const getReq = httpMock.expectOne('https://api.test/hr-portal/assess/retrieve_blob_data/blob-999');
    expect(getReq.request.method).toBe('GET');
    getReq.flush({ candidate: 'Test' });
  });
});
