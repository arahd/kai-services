import { TestBed } from '@angular/core/testing';
import { ToastService } from './toast.service';

describe('ToastService', () => {
  let service: ToastService;
  let toastCompMock: any;

  beforeEach(() => {
    toastCompMock = {
      show: jasmine.createSpy('show')
    };

    TestBed.configureTestingModule({
      providers: [ToastService]
    });
    service = TestBed.inject(ToastService);
  });

  it('should register toast component and delegate show calls', () => {
    service.register(toastCompMock);
    service.show('Success message', 'success', 3000, 'default');

    expect(toastCompMock.show).toHaveBeenCalledWith('Success message', 'success', 3000, 'default');
  });

  it('should not throw if show is called before component registration', () => {
    expect(() => service.show('Unregistered toast')).not.toThrow();
  });
});
