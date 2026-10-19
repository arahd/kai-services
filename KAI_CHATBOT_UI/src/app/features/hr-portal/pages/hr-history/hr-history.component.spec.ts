import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpResponse } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { HrHistoryComponent } from './hr-history.component';
import { HrHistoryService, HistoryRecordUI } from './hr-history.service';
import { TokenService } from '@core/services/token.service';
import { ToastService } from '@core/services/toast.service';
import { FileDownloadService } from '@shared/services/file-download.service';

describe('HrHistoryComponent', () => {
  let component: HrHistoryComponent;
  let fixture: ComponentFixture<HrHistoryComponent>;
  let historyServiceMock: any;
  let tokenServiceMock: any;
  let fileDownloadServiceMock: any;
  let toastServiceMock: any;

  const mockRecordsUI: HistoryRecordUI[] = [
    {
      id: '1',
      date: '27 Aug 2026,',
      time: '03:45 PM',
      dateTime: '2026-08-27T15:45:49Z',
      user: 'raguraaman.v.m@company.com',
      userPrefix: 'raguraaman.v.m',
      userDomain: '@company.com',
      tokenUsed: 1200,
      module: 'Resume Standardizer',
      processType: 'Internal',
      uploadedFileName: 'Raguraaman_Resume.pdf',
      uploadedFiles: ['Raguraaman_Resume.pdf'],
      downloadedFileName: 'RAGURAAMAN_V_M_20260827_154549_0fdca7.pdf',
      downloadUrl: '/api/resume_db/download/resume-builder/2026-08-27/RAGURAAMAN_V_M_20260827_154549_0fdca7.pdf',
      uploadStatus: 'Success',
      downloadStatus: 'Success',
    },
    {
      id: '2',
      date: '28 Aug 2026,',
      time: '10:15 AM',
      dateTime: '2026-08-28T10:15:00Z',
      user: 'alice@company.com',
      userPrefix: 'alice',
      userDomain: '@company.com',
      tokenUsed: 800,
      module: 'Visa Process Check',
      processType: 'Business',
      uploadedFileName: 'Alice_Visa.pdf',
      uploadedFiles: ['Alice_Visa.pdf'],
      downloadedFileName: '-',
      downloadUrl: '',
      uploadStatus: 'Success',
      downloadStatus: '-',
    },
  ];

  beforeEach(async () => {
    historyServiceMock = {
      getUsers: jasmine.createSpy('getUsers').and.returnValue(of(['raguraaman.v.m@company.com', 'alice@company.com'])),
      getModules: jasmine.createSpy('getModules').and.returnValue(of(['Resume Standardizer', 'Visa Process Check'])),
      getProcessTypes: jasmine.createSpy('getProcessTypes').and.returnValue(of(['Internal', 'Business'])),
      getHistory: jasmine.createSpy('getHistory').and.returnValue(of({
        success: true,
        count: 2,
        total_count: 2,
        data: [{}, {}],
      })),
      transformToUIRecord: jasmine.createSpy('transformToUIRecord').and.callFake((item: any) => {
        return mockRecordsUI.find(r => r.id === item?.id) || mockRecordsUI[0];
      }),
      downloadFile: jasmine.createSpy('downloadFile').and.returnValue(
        of(new HttpResponse<Blob>({ body: new Blob(['file-content']) }))
      ),
    };

    tokenServiceMock = {
      getUserInfo: jasmine.createSpy('getUserInfo').and.returnValue({ email: 'admin@company.com' }),
    };

    fileDownloadServiceMock = {
      downloadFile: jasmine.createSpy('downloadFile'),
      parseBlobError: jasmine.createSpy('parseBlobError').and.returnValue(Promise.resolve({ message: 'Error from server' })),
    };

    toastServiceMock = {
      show: jasmine.createSpy('show'),
    };

    await TestBed.configureTestingModule({
      imports: [HrHistoryComponent],
      providers: [
        { provide: HrHistoryService, useValue: historyServiceMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: FileDownloadService, useValue: fileDownloadServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HrHistoryComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load initial history and filters', () => {
    expect(component).toBeTruthy();
    expect(historyServiceMock.getUsers).toHaveBeenCalled();
    expect(historyServiceMock.getModules).toHaveBeenCalled();
    expect(historyServiceMock.getProcessTypes).toHaveBeenCalled();
    expect(historyServiceMock.getHistory).toHaveBeenCalled();
  });

  describe('downloadRecord', () => {
    it('should not call downloadFile when downloadUrl is empty', () => {
      const recordWithoutUrl = mockRecordsUI[1];
      component.downloadRecord(recordWithoutUrl);
      expect(historyServiceMock.downloadFile).not.toHaveBeenCalled();
      expect(fileDownloadServiceMock.downloadFile).not.toHaveBeenCalled();
    });

    it('should call historyService.downloadFile and fileDownloadService.downloadFile on success', () => {
      const recordWithUrl = mockRecordsUI[0];
      const event = new MouseEvent('click');
      spyOn(event, 'preventDefault');
      spyOn(event, 'stopPropagation');

      component.downloadRecord(recordWithUrl, event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(historyServiceMock.downloadFile).toHaveBeenCalledWith(recordWithUrl.downloadUrl);
      expect(fileDownloadServiceMock.downloadFile).toHaveBeenCalledWith(
        jasmine.any(HttpResponse),
        'RAGURAAMAN_V_M_20260827_154549_0fdca7.pdf'
      );
      expect(component.downloadingRecordId()).toBeNull();
    });

    it('should handle download error and show toast', async () => {
      historyServiceMock.downloadFile.and.returnValue(throwError(() => new Error('Download failed')));
      const recordWithUrl = mockRecordsUI[0];

      component.downloadRecord(recordWithUrl);

      // wait for async error handling
      await Promise.resolve();

      expect(fileDownloadServiceMock.parseBlobError).toHaveBeenCalled();
      expect(toastServiceMock.show).toHaveBeenCalledWith('Error from server', 'error');
      expect(component.downloadingRecordId()).toBeNull();
    });
  });

  describe('Filters and Pagination', () => {
    it('should reset filters when resetFilters is called', () => {
      component.startDate.set('2026-01-01');
      component.endDate.set('2026-01-31');
      component.selectedModule.set('Resume Standardizer');
      component.selectedProcessType.set('Internal');
      component.selectedUser.set('alice@company.com');

      component.resetFilters();

      expect(component.startDate()).toBe('');
      expect(component.endDate()).toBe('');
      expect(component.selectedModule()).toBe('all');
      expect(component.selectedProcessType()).toBe('all');
      expect(component.selectedUser()).toBe('all');
      expect(component.currentPage()).toBe(1);
    });

    it('should change page and call loadHistory on nextPage and prevPage', () => {
      historyServiceMock.getHistory.calls.reset();
      component.totalCount.set(50);
      component.pageSize.set(20);
      component.currentPage.set(1);

      component.nextPage();
      expect(component.currentPage()).toBe(2);
      expect(historyServiceMock.getHistory).toHaveBeenCalledWith(2, 20, jasmine.any(Object));

      component.prevPage();
      expect(component.currentPage()).toBe(1);
      expect(historyServiceMock.getHistory).toHaveBeenCalledWith(1, 20, jasmine.any(Object));
    });

    it('should change page on goToPage', () => {
      historyServiceMock.getHistory.calls.reset();
      component.totalCount.set(60);
      component.pageSize.set(20);
      component.currentPage.set(1);

      component.goToPage(3);
      expect(component.currentPage()).toBe(3);
      expect(historyServiceMock.getHistory).toHaveBeenCalledWith(3, 20, jasmine.any(Object));
    });
  });
});
