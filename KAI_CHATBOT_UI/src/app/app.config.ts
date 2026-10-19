import { ApplicationConfig, APP_INITIALIZER, ErrorHandler, provideZoneChangeDetection } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { routes } from './app.routes';
import { ConfigService } from '@core/services/config.service';
import { GlobalErrorHandlerService } from '@core/services/global-error-handler.service';

export function initConfig(configService: ConfigService) {
  return () => configService.loadConfig();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()), 
    provideHttpClient(withInterceptorsFromDi()),
    {
      provide: ErrorHandler,
      useClass: GlobalErrorHandlerService
    },
    // ✅ IMPORTANT
    {
      provide: APP_INITIALIZER,
      useFactory: initConfig,
      deps: [ConfigService],
      multi: true
    }
  ]
};