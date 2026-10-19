import { TestBed } from '@angular/core/testing';
import { HttpErrorResponse } from '@angular/common/http';
import { ChatErrorHandlerService } from './error-handler.service';
import { ToastService } from '@core/services/toast.service';
import { TelemetryLoggerService } from './telemetry-logger.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';

describe('ChatErrorHandlerService', () => {
  let service: ChatErrorHandlerService;
  let toastServiceMock: jasmine.SpyObj<ToastService>;
  let telemetryMock: jasmine.SpyObj<TelemetryLoggerService>;
  let chatStateMock: any;

  beforeEach(() => {
    toastServiceMock = jasmine.createSpyObj('ToastService', ['show']);
    telemetryMock = jasmine.createSpyObj('TelemetryLoggerService', ['logException', 'logTrace']);
    chatStateMock = {
      showSessionExpiredPopup: { set: jasmine.createSpy('setExpired') },
      showLimitPopup: { set: jasmine.createSpy('setLimit') }
    };

    TestBed.configureTestingModule({
      providers: [
        ChatErrorHandlerService,
        { provide: ToastService, useValue: toastServiceMock },
        { provide: TelemetryLoggerService, useValue: telemetryMock },
        { provide: ChatStateService, useValue: chatStateMock }
      ]
    });

    service = TestBed.inject(ChatErrorHandlerService);
    service.registerDelegate(chatStateMock);
  });

  it('should handle 419 error status by triggering session expired popup', () => {
    const error = new HttpErrorResponse({ status: 419 });
    service.handleApiError(error);

    expect(chatStateMock.showSessionExpiredPopup.set).toHaveBeenCalledWith(true);
    expect(telemetryMock.logException).toHaveBeenCalled();
  });

  it('should handle 519 error status by triggering limit popup', () => {
    const error = new HttpErrorResponse({ status: 519 });
    service.handleApiError(error);

    expect(chatStateMock.showLimitPopup.set).toHaveBeenCalledWith(true);
    expect(telemetryMock.logException).toHaveBeenCalled();
  });

  it('should process general HTTP error responses without showing toast', () => {
    const error = new HttpErrorResponse({
      status: 500,
      error: { message: 'Internal Server Error' }
    });
    service.handleApiError(error);

    expect(toastServiceMock.show).not.toHaveBeenCalled();
  });

  it('should log generic error message without showing toast', () => {
    service.handleGenericError('Network unreachable');
    expect(telemetryMock.logTrace).toHaveBeenCalledWith('Network unreachable', jasmine.any(Number));
    expect(toastServiceMock.show).not.toHaveBeenCalled();
  });
});
