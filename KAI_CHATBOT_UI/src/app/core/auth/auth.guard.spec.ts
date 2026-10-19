import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { TokenService } from '@core/services/token.service';
import { AuthGuard } from '@core/auth/auth.guard';

describe('AuthGuard', () => {
  let guard: AuthGuard;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AuthGuard,
        { provide: AzureAdService, useValue: {} },
        { provide: Router, useValue: { navigate: jasmine.createSpy('navigate') } },
        { provide: TokenService, useValue: { getToken: () => null } },
      ],
    });
    guard = TestBed.inject(AuthGuard);
  });

  it('should be created', () => {
    expect(guard).toBeTruthy();
  });
});
