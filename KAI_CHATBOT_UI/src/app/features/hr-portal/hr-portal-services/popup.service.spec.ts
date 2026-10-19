import { TestBed } from '@angular/core/testing';
import { PopupService } from '@features/hr-portal/hr-portal-services/popup.service';

describe('PopupService', () => {
  let service: PopupService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [PopupService]
    });
    service = TestBed.inject(PopupService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should manage popup state and active popup name', (done) => {
    service.openPopup();
    service.popupState$.subscribe(isOpen => {
      if (isOpen) {
        expect(isOpen).toBeTrue();
        done();
      }
    });
  });

  it('should set active popup name', (done) => {
    service.setActivePopup('test-popup');
    service.activePopup$.subscribe(name => {
      if (name === 'test-popup') {
        expect(name).toBe('test-popup');
        done();
      }
    });
  });
});
