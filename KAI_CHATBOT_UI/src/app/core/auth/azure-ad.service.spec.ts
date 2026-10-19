import { TestBed } from '@angular/core/testing';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { ConfigService } from '@core/services/config.service';
import { TokenService } from '@core/services/token.service';
import { PublicClientApplication } from '@azure/msal-browser';

describe('AzureAdService', () => {
  let service: AzureAdService;
  let mockConfigService: any;
  let mockTokenService: any;

  beforeEach(() => {
    mockConfigService = {
      isConfigLoaded: () => true,
      loadConfig: jasmine.createSpy('loadConfig').and.returnValue(Promise.resolve({})),
      getConfig: () => ({
        azureAd: { clientId: 'client-123', tenantId: 'tenant-123', redirectUri: 'http://localhost', scopes: 'test-scope' }
      })
    };

    mockTokenService = {
      getUserInfo: jasmine.createSpy('getUserInfo').and.returnValue(null),
      setUserInfo: jasmine.createSpy('setUserInfo')
    };

    spyOn(PublicClientApplication.prototype, 'initialize').and.returnValue(Promise.resolve());
    spyOn(PublicClientApplication.prototype, 'handleRedirectPromise').and.returnValue(Promise.resolve(null));
    spyOn(PublicClientApplication.prototype, 'getAllAccounts').and.returnValue([]);
    spyOn(PublicClientApplication.prototype, 'loginRedirect').and.returnValue(Promise.resolve());
    spyOn(PublicClientApplication.prototype, 'logoutRedirect').and.returnValue(Promise.resolve());
    spyOn(PublicClientApplication.prototype, 'acquireTokenSilent').and.returnValue(Promise.resolve({ accessToken: 'test-access-token' } as any));
    spyOn(PublicClientApplication.prototype, 'acquireTokenPopup').and.returnValue(Promise.resolve({ accessToken: 'popup-access-token' } as any));

    TestBed.configureTestingModule({
      providers: [
        AzureAdService,
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TokenService, useValue: mockTokenService }
      ]
    });

    service = TestBed.inject(AzureAdService);
    (service as any).msalInstance = new PublicClientApplication({
      auth: { clientId: 'client-123', authority: 'https://login.microsoftonline.com/organizations', redirectUri: 'http://localhost' }
    });
  });

  it('should be created and return initial user null state', () => {
    expect(service).toBeTruthy();
    expect(service.isLoggedIn()).toBeFalse();
    expect(service.getUser()).toBeNull();
    expect(service.getUserInfo()).toBeNull();
  });

  it('should handle account in redirect promise and store user info', () => {
    const mockAccount = { homeAccountId: 'acc-1', username: 'user@kumaran.world', name: 'User Test', idTokenClaims: {} };
    (service as any).account = mockAccount;
    (service as any).setUserInfo(mockAccount);

    expect(service.getUser()).toEqual(mockAccount as any);
    expect(mockTokenService.setUserInfo).toHaveBeenCalledWith(jasmine.objectContaining({
      email: 'user@kumaran.world',
      name: 'User Test'
    }));
  });

  it('should load user from session fallback if no MSAL account present', () => {
    const sessionUser = { id: 'sess-1', email: 'session.user@kumaran.world', name: 'Session User', roles: ['user'] };
    mockTokenService.getUserInfo.and.returnValue(sessionUser);

    (service as any).loadUserFromSession();

    expect(service.isLoggedIn()).toBeTrue();
    expect(service.getUserInfo()?.email).toBe('session.user@kumaran.world');
  });

  it('should trigger MSAL login redirect when login() called', async () => {
    await service.login();
    expect(PublicClientApplication.prototype.loginRedirect).toHaveBeenCalledWith(jasmine.objectContaining({
      scopes: ['api://client-123/test-scope']
    }));
  });

  it('should trigger MSAL logout redirect and clear user info when logout() called', async () => {
    await service.logout();
    expect(mockTokenService.setUserInfo).toHaveBeenCalledWith(null);
    expect(PublicClientApplication.prototype.logoutRedirect).toHaveBeenCalled();
  });

  it('should acquire valid token silently', async () => {
    (service as any).account = { homeAccountId: 'acc-1' };
    const token = await service.getValidToken();
    expect(token).toBe('test-access-token');
    expect(PublicClientApplication.prototype.acquireTokenSilent).toHaveBeenCalled();
  });

  it('should fallback to acquireTokenPopup if silent token acquisition fails', async () => {
    (service as any).account = { homeAccountId: 'acc-1' };
    (PublicClientApplication.prototype.acquireTokenSilent as jasmine.Spy).and.returnValue(Promise.reject('Silent error'));

    const token = await service.getValidToken();
    expect(token).toBe('popup-access-token');
    expect(PublicClientApplication.prototype.acquireTokenPopup).toHaveBeenCalled();
  });

  it('should throw error if getValidToken called without account', async () => {
    (service as any).account = null;
    await expectAsync(service.getValidToken()).toBeRejectedWithError('No logged-in account');
  });
});
