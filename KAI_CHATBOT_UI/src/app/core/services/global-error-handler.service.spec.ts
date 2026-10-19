import { TestBed } from '@angular/core/testing';
import { GlobalErrorHandlerService } from './global-error-handler.service';
import { TelemetryLoggerService } from './telemetry-logger.service';

describe('GlobalErrorHandlerService', () => {
  let service: GlobalErrorHandlerService;
  let telemetryMock: jasmine.SpyObj<TelemetryLoggerService>;

  beforeEach(() => {
    telemetryMock = jasmine.createSpyObj('TelemetryLoggerService', ['logException']);

    TestBed.configureTestingModule({
      providers: [
        GlobalErrorHandlerService,
        { provide: TelemetryLoggerService, useValue: telemetryMock }
      ]
    });

    service = TestBed.inject(GlobalErrorHandlerService);
  });

  it('should log exception when handleError is called with an Error object', () => {
    const error = new Error('Global runtime crash');
    service.handleError(error);

    expect(telemetryMock.logException).toHaveBeenCalledWith(
      error,
      jasmine.any(Number),
      jasmine.objectContaining({ unhandled: true })
    );
  });

  it('should normalize string error into Error object', () => {
    service.handleError('String error message');

    expect(telemetryMock.logException).toHaveBeenCalledWith(
      jasmine.objectContaining({ message: 'String error message' }),
      jasmine.any(Number),
      jasmine.objectContaining({ unhandled: true })
    );
  });
});
