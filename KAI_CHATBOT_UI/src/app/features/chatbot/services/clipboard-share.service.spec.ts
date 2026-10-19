import { TestBed } from '@angular/core/testing';
import { ClipboardShareService } from './clipboard-share.service';
import { ToastService } from '@core/services/toast.service';

describe('ClipboardShareService', () => {
  let service: ClipboardShareService;
  let mockToastService: any;

  beforeEach(() => {
    mockToastService = {
      show: jasmine.createSpy('show')
    };

    TestBed.configureTestingModule({
      providers: [
        ClipboardShareService,
        { provide: ToastService, useValue: mockToastService }
      ]
    });

    service = TestBed.inject(ClipboardShareService);
  });

  it('should strip HTML tags correctly', () => {
    const html = '<p>Hello <strong>World</strong></p>';
    expect(service.stripHtml(html)).toBe('Hello World');
  });

  it('should copy user message via writeText and show toast', (done) => {
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    const onCopiedSpy = jasmine.createSpy('onCopied');

    service.copyUserMessage({ message: 'User Question' }, 0, onCopiedSpy);

    setTimeout(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalledWith('User Question');
      expect(onCopiedSpy).toHaveBeenCalledWith(0);
      expect(mockToastService.show).toHaveBeenCalledWith('Copied to clipboard!', 'success');
      done();
    }, 50);
  });

  it('should handle error when copyUserMessage fails', (done) => {
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.reject('Permission denied'));
    const onCopiedSpy = jasmine.createSpy('onCopied');

    service.copyUserMessage({ message: 'User Question' }, 0, onCopiedSpy);

    setTimeout(() => {
      expect(mockToastService.show).toHaveBeenCalledWith('Failed to copy', 'error');
      done();
    }, 50);
  });

  it('should copy bot message falling back to plain text if rich copy unavailable', async () => {
    spyOn(navigator.clipboard, 'writeText').and.returnValue(Promise.resolve());
    const onCopiedSpy = jasmine.createSpy('onCopied');

    await service.copyBotMessage({ message: 'Bot Answer', html: '<p>Bot Answer</p>' }, 1, onCopiedSpy);

    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Bot Answer');
    expect(onCopiedSpy).toHaveBeenCalledWith(1, 'Copied text only!');
  });

  it('should share message using Web Share API if available', async () => {
    (navigator as any).share = jasmine.createSpy('share').and.returnValue(Promise.resolve());

    await service.shareMessage({ message: 'Share this response' });

    expect(navigator.share).toHaveBeenCalledWith(jasmine.objectContaining({
      title: 'Shared from Kumaran AI',
      text: 'Share this response'
    }));
  });
});
