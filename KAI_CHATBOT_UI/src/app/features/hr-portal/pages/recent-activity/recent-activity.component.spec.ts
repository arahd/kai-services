import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { RecentActivityComponent } from './recent-activity.component';
import { RecentActivityService } from './recent-activity.service';
import { RecentActivityUI } from './recent-activity.model';
import { ToastService } from '@core/services/toast.service';
import { FileDownloadService } from '@shared/services/file-download.service';

describe('RecentActivityComponent', () => {
  let component: RecentActivityComponent;
  let fixture: ComponentFixture<RecentActivityComponent>;
  let activityServiceMock: any;
  let fileDownloadServiceMock: any;
  let toastServiceMock: any;

  const mockRecords: RecentActivityUI[] = [
    {
      id: 1,
      date: '27 Aug 2026,',
      time: '03:45 PM',
      dateTimeRaw: '2026-08-27 15:45:49',
      module: 'Resume Standardizer',
      processType: 'Resume Formatter',
      uploadedFileName: 'Resume.pdf',
      uploadedFiles: ['Resume.pdf'],
      downloadedFileName: 'Standardized.pdf',
      downloadUrl: '/api/resume_db/download/resume-builder/2026-08-27/Standardized.pdf',
      status: 'Success',
      validationScore: '92%',
    },
  ];

  beforeEach(async () => {
    activityServiceMock = {
      getUserRecentActivity: jasmine.createSpy('getUserRecentActivity').and.returnValue(
        of({
          records: mockRecords,
          totalCount: 1,
          page: 1,
          pageSize: 20,
          totalPages: 1,
        }),
      ),
      downloadFile: jasmine.createSpy('downloadFile').and.returnValue(of(new Blob(['content']))),
    };

    fileDownloadServiceMock = {
      downloadFile: jasmine.createSpy('downloadFile'),
      parseBlobError: jasmine.createSpy('parseBlobError').and.returnValue(Promise.resolve({ message: 'Download error' })),
    };

    toastServiceMock = {
      show: jasmine.createSpy('show'),
    };

    await TestBed.configureTestingModule({
      imports: [RecentActivityComponent],
      providers: [
        { provide: RecentActivityService, useValue: activityServiceMock },
        { provide: FileDownloadService, useValue: fileDownloadServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RecentActivityComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load recent activity', () => {
    expect(component).toBeTruthy();
    expect(activityServiceMock.getUserRecentActivity).toHaveBeenCalled();
    expect(component.records().length).toBe(1);
  });

  it('should handle onDownloadClick with valid downloadUrl', () => {
    const event = new MouseEvent('click');
    spyOn(event, 'preventDefault');

    component.onDownloadClick(event, mockRecords[0]);

    expect(event.preventDefault).toHaveBeenCalled();
    expect(activityServiceMock.downloadFile).toHaveBeenCalledWith(mockRecords[0].downloadUrl);
    expect(fileDownloadServiceMock.downloadFile).toHaveBeenCalled();
  });

  it('should handle onDownloadClick error and show toast', async () => {
    activityServiceMock.downloadFile.and.returnValue(throwError(() => new Error('Server down')));
    const event = new MouseEvent('click');

    component.onDownloadClick(event, mockRecords[0]);

    await Promise.resolve();

    expect(fileDownloadServiceMock.parseBlobError).toHaveBeenCalled();
    expect(toastServiceMock.show).toHaveBeenCalledWith('Download error', 'error');
  });
});
