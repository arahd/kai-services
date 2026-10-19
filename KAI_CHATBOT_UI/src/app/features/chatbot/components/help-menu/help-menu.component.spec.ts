import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { HelpMenuComponent } from '@features/chatbot/components/help-menu/help-menu.component';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { TourService } from '@core/services/tour.service';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ToastService } from '@core/services/toast.service';
import { of, throwError } from 'rxjs';
import { ElementRef } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';

describe('HelpMenuComponent', () => {
  let component: HelpMenuComponent;
  let fixture: ComponentFixture<HelpMenuComponent>;
  let tourServiceMock: any;
  let chatServiceMock: any;
  let toastServiceMock: any;

  beforeEach(async () => {
    tourServiceMock = {
      startTour: jasmine.createSpy('startTour')
    };

    chatServiceMock = {
      createBugReport: jasmine.createSpy('createBugReport').and.returnValue(of({ success: true }))
    };

    toastServiceMock = {
      show: jasmine.createSpy('show')
    };

    await TestBed.configureTestingModule({
      imports: [HelpMenuComponent, CommonModule, ReactiveFormsModule],
      providers: [
        provideHttpClient(),
        provideRouter([]),
        { provide: TourService, useValue: tourServiceMock },
        { provide: ChatService, useValue: chatServiceMock },
        { provide: ToastService, useValue: toastServiceMock },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(HelpMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should toggle menu', () => {
    expect(component.isMenuOpen).toBeFalse();
    component.toggleMenu();
    expect(component.isMenuOpen).toBeTrue();
    component.toggleMenu();
    expect(component.isMenuOpen).toBeFalse();
  });

  it('should start walkthrough and close menu', () => {
    component.isMenuOpen = true;
    component.startWalkthrough();
    expect(tourServiceMock.startTour).toHaveBeenCalled();
    expect(component.isMenuOpen).toBeFalse();
  });

  it('should open help center modal', () => {
    component.isMenuOpen = true;
    component.openHelpCenter();
    expect(component.showHelpCenterModal).toBeTrue();
    expect(component.isMenuOpen).toBeFalse();
  });

  it('should open and close privacy policy modal', () => {
    component.isMenuOpen = true;
    component.openPrivacyPolicy();
    expect(component.showPrivacyPolicyModal).toBeTrue();
    expect(component.isMenuOpen).toBeFalse();

    component.closePrivacyPolicy();
    expect(component.showPrivacyPolicyModal).toBeFalse();
  });

  it('should initialize bug form with default values', () => {
    expect(component.bugReportForm).toBeDefined();
    expect(component.bugReportForm.get('bug_name')?.value).toBe('');
    expect(component.bugReportForm.get('category')?.value).toBe('UI/UX');
    expect(component.bugReportForm.get('severity')?.value).toBe('Low');
  });

  it('should validate bug form - bug_name is required', () => {
    const bugNameControl = component.bugReportForm.get('bug_name');
    bugNameControl?.setValue('');
    expect(bugNameControl?.valid).toBeFalse();
    bugNameControl?.setValue('Test Bug');
    expect(bugNameControl?.valid).toBeTrue();
  });

  it('should reject whitespace-only bug name and description', () => {
    component.bugReportForm.patchValue({
      bug_name: '     ',
      description: '                              ',
    });

    expect(component.bugReportForm.valid).toBeFalse();
    expect(component.bugReportForm.get('bug_name')?.errors?.['required']).toBeTrue();
    expect(component.bugReportForm.get('description')?.errors?.['required']).toBeTrue();

    component.submitBug();
    expect(chatServiceMock.createBugReport).not.toHaveBeenCalled();
  });

  it('should trim bug name and description before submit', () => {
    component.bugReportForm.patchValue({
      bug_name: '  Valid bug name  ',
      description: '  Valid description with enough characters for validation.  ',
    });

    component.submitBug();

    const formData = chatServiceMock.createBugReport.calls.mostRecent().args[0] as FormData;
    expect(formData.get('bug_name')).toBe('Valid bug name');
    expect(formData.get('description')).toBe(
      'Valid description with enough characters for validation.',
    );
  });

  it('should submit bug report successfully', fakeAsync(() => {
    component.bugReportForm.patchValue({
      bug_name: 'Test Bug Report',
      category: 'UI/UX',
      severity: 'Low',
      description: 'Test description with enough characters for validation.'
    });
    component.bugReportForm.updateValueAndValidity();
    
    component.submitBug();
    tick();
    
    expect(chatServiceMock.createBugReport).toHaveBeenCalled();
    expect(toastServiceMock.show).toHaveBeenCalledWith('Bug report submitted successfully!', 'success');
    expect(component.isBugSubmitted).toBeTrue();
    expect(component.isSubmittingBug).toBeFalse();
  }));

  it('should handle bug submission error', fakeAsync(() => {
    chatServiceMock.createBugReport.and.returnValue(throwError(() => new Error('Error')));
    
    component.bugReportForm.patchValue({
      bug_name: 'Test Bug Report',
      category: 'UI/UX',
      severity: 'Low',
      description: 'Test description with enough characters for validation.'
    });
    component.bugReportForm.updateValueAndValidity();
    
    component.submitBug();
    tick();
    
    expect(toastServiceMock.show).toHaveBeenCalledWith('Failed to submit bug report. Please try again.', 'error');
    expect(component.isSubmittingBug).toBeFalse();
  }));

  it('should add image files only', async () => {
    const mockFile = new File([''], 'test.png', { type: 'image/png' });
    await component['addRelatedFile'](mockFile);
    expect(component.relatedFiles.length).toBe(1);
    expect(component.relatedFiles[0].file).toBe(mockFile);
  });

  it('should add images dropped onto the screenshot upload area', async () => {
    component.showBugReportModal = true;
    component.isBugReportMinimized = false;
    component.isBugSubmitted = false;

    const mockFile = new File([''], 'dropped.png', { type: 'image/png' });
    const dataTransfer = {
      files: [mockFile],
      dropEffect: 'none',
    } as unknown as DataTransfer;

    await component.onScreenshotDrop({
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
      dataTransfer,
    } as unknown as DragEvent);

    expect(component.relatedFiles.length).toBe(1);
    expect(component.relatedFiles[0].file.name).toBe('dropped.png');
    expect(component.isScreenshotDragOver).toBeFalse();
  });

  it('should highlight screenshot upload area while dragging files over it', () => {
    component.showBugReportModal = true;
    component.isBugReportMinimized = false;
    component.isBugSubmitted = false;

    component.onScreenshotDragEnter({
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
      dataTransfer: { dropEffect: 'none' } as DataTransfer,
    } as unknown as DragEvent);

    expect(component.isScreenshotDragOver).toBeTrue();
  });

  it('should ignore dropped files when bug report modal is minimized', async () => {
    component.showBugReportModal = true;
    component.isBugReportMinimized = true;

    const mockFile = new File([''], 'dropped.png', { type: 'image/png' });
    await component.onScreenshotDrop({
      preventDefault: jasmine.createSpy('preventDefault'),
      stopPropagation: jasmine.createSpy('stopPropagation'),
      dataTransfer: { files: [mockFile] } as unknown as DataTransfer,
    } as unknown as DragEvent);

    expect(component.relatedFiles.length).toBe(0);
  });

  it('should reject non-image files', async () => {
    await component['addRelatedFile'](new File([''], 'notes.txt', { type: 'text/plain' }));
    expect(component.relatedFiles.length).toBe(0);
    expect(toastServiceMock.show).toHaveBeenCalledWith(
      'Only image files are allowed (JPG, PNG, GIF, BMP, WEBP, SVG).',
      'error',
    );
  });

  it('should reject files with double extensions', async () => {
    await component['addRelatedFile'](
      new File([''], 'image.docx.png', { type: 'image/png' }),
    );

    expect(component.relatedFiles.length).toBe(0);
    expect(toastServiceMock.show).toHaveBeenCalledWith(
      'Files with multiple extensions (e.g. image.docx.png) are not allowed.',
      'error',
    );
  });

  it('should send only bug_name, description, and related_files on submit', async () => {
    component.bugReportForm.patchValue({
      bug_name: 'Test Bug Report',
      category: 'UI/UX',
      severity: 'Low',
      description: 'Test description with enough characters for validation.',
    });
    component.bugReportForm.updateValueAndValidity();
    await component['addRelatedFile'](new File(['a'], 'one.png', { type: 'image/png' }));
    await component['addRelatedFile'](new File(['b'], 'two.png', { type: 'image/png' }));

    component.submitBug();

    const formData = chatServiceMock.createBugReport.calls.mostRecent().args[0] as FormData;
    expect(formData.get('bug_name')).toBe('Test Bug Report');
    expect(formData.get('description')).toBe(
      'Test description with enough characters for validation.',
    );
    expect(formData.get('bot_type')).toBeNull();
    expect(formData.get('category')).toBeNull();
    expect(formData.get('severity')).toBeNull();

    const relatedFiles = formData.getAll('related_files');
    expect(relatedFiles.length).toBe(2);
    expect(relatedFiles[0]).toBeInstanceOf(File);
    expect((relatedFiles[0] as File).name).toBe('one.png');
    expect((relatedFiles[1] as File).name).toBe('two.png');
  });

  it('should remove related file', async () => {
    await component['addRelatedFile'](new File(['a'], 'test.png', { type: 'image/png' }));
    await component['addRelatedFile'](new File(['b'], 'other.png', { type: 'image/png' }));

    const mockEvent = { stopPropagation: jasmine.createSpy('stopPropagation') } as any;
    component.removeRelatedFile(0, mockEvent);

    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    expect(component.relatedFiles.length).toBe(1);
    expect(component.relatedFiles[0].file.name).toBe('other.png');
  });

  it('should retain minimized bug draft when user declines discard confirmation', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.bugReportForm.patchValue({
      bug_name: 'Saved draft bug',
      description: 'This description is long enough to be considered valid input.',
    });
    component.showBugReportModal = true;
    component.minimizeBugReport();

    component.raiseBug();

    expect(window.confirm).toHaveBeenCalledWith(
      'Unsaved changes will be lost. Do you want to continue?',
    );
    expect(component.showBugReportModal).toBeTrue();
    expect(component.isBugReportMinimized).toBeFalse();
    expect(component.bugReportForm.get('bug_name')?.value).toBe('Saved draft bug');
    expect(component.bugReportForm.get('description')?.value).toBe(
      'This description is long enough to be considered valid input.',
    );
  });

  it('should purge minimized bug draft when user confirms discard', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.bugReportForm.patchValue({
      bug_name: 'Saved draft bug',
      description: 'This description is long enough to be considered valid input.',
    });
    component.showBugReportModal = true;
    component.minimizeBugReport();

    component.raiseBug();

    expect(component.showBugReportModal).toBeTrue();
    expect(component.isBugReportMinimized).toBeFalse();
    expect(component.bugReportForm.get('bug_name')?.value ?? '').toBe('');
    expect(component.bugReportForm.get('description')?.value ?? '').toBe('');
  });

  it('should confirm before discarding an unsaved bug draft', () => {
    spyOn(window, 'confirm').and.returnValue(false);
    component.bugReportForm.patchValue({
      bug_name: 'Draft bug name',
      description: 'Draft description with enough characters for validation.',
    });
    component.showBugReportModal = false;

    component.raiseBug();

    expect(window.confirm).toHaveBeenCalledWith(
      'Unsaved changes will be lost. Do you want to continue?',
    );
    expect(component.showBugReportModal).toBeTrue();
    expect(component.bugReportForm.get('bug_name')?.value).toBe('Draft bug name');
  });

  it('should discard unsaved bug draft when user confirms', () => {
    spyOn(window, 'confirm').and.returnValue(true);
    component.bugReportForm.patchValue({
      bug_name: 'Draft bug name',
      description: 'Draft description with enough characters for validation.',
    });
    component.showBugReportModal = false;

    component.raiseBug();

    expect(component.showBugReportModal).toBeTrue();
    expect(component.bugReportForm.get('bug_name')?.value ?? '').toBe('');
    expect(component.bugReportForm.get('description')?.value ?? '').toBe('');
  });

  it('should open feature request modal and set reportType to FEATURE_REQUEST', () => {
    component.raiseFeatureRequest();

    expect(component.showBugReportModal).toBeTrue();
    expect(component.isBugReportMinimized).toBeFalse();
    expect(component.reportType).toBe('FEATURE_REQUEST');
    expect(component.isFeatureRequest).toBeTrue();
  });

  it('should include request_type BUG_REPORT in payload for bug reports', () => {
    component.raiseBug();
    component.bugReportForm.patchValue({
      bug_name: 'Bug title here',
      description: 'Bug description with enough characters for validation.',
    });

    component.submitBug();

    const formData = chatServiceMock.createBugReport.calls.mostRecent().args[0] as FormData;
    expect(formData.get('request_type')).toBe('BUG_REPORT');
    expect(formData.get('bug_name')).toBe('Bug title here');
  });

  it('should include request_type FEATURE_REQUEST in payload and show success toast for feature requests', fakeAsync(() => {
    component.raiseFeatureRequest();
    component.bugReportForm.patchValue({
      bug_name: 'New Feature Idea',
      description: 'Feature description with enough characters for validation.',
    });

    component.submitBug();
    tick();

    const formData = chatServiceMock.createBugReport.calls.mostRecent().args[0] as FormData;
    expect(formData.get('request_type')).toBe('FEATURE_REQUEST');
    expect(formData.get('bug_name')).toBe('New Feature Idea');
    expect(toastServiceMock.show).toHaveBeenCalledWith(
      'Feature request submitted successfully!',
      'success',
    );
  }));

  it('should handle feature request submission error with proper toast', fakeAsync(() => {
    chatServiceMock.createBugReport.and.returnValue(throwError(() => new Error('Error')));
    component.raiseFeatureRequest();
    component.bugReportForm.patchValue({
      bug_name: 'New Feature Idea',
      description: 'Feature description with enough characters for validation.',
    });

    component.submitBug();
    tick();

    expect(toastServiceMock.show).toHaveBeenCalledWith(
      'Failed to submit feature request. Please try again.',
      'error',
    );
  }));
});
