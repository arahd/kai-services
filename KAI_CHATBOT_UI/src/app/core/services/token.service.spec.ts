import { TestBed } from '@angular/core/testing';
import { TokenService } from './token.service';
import { SessionStorageService } from './session-storage.service';

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [TokenService, SessionStorageService],
    });
    service = TestBed.inject(TokenService);
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should set and get token', () => {
    service.setToken('sample-jwt-token');
    expect(service.getToken()).toBe('sample-jwt-token');
  });

  it('should clear token and session storage', () => {
    service.setToken('sample-jwt-token');
    service.setRoles(['kai_chatbot_dev_admin']);
    service.clearToken();
    expect(service.getToken()).toBeNull();
    expect(service.getRoles()).toEqual([]);
  });

  it('should set and get roles and verify admin/hr/user helper flags', () => {
    service.setRoles(['kai_chatbot_dev_admin', 'kai_chatbot_dev_hr', 'kai_chatbot_dev_user']);
    expect(service.getRoles()).toEqual(['kai_chatbot_dev_admin', 'kai_chatbot_dev_hr', 'kai_chatbot_dev_user']);
    expect(service.isAdmin()).toBeTrue();
    expect(service.isHrAdmin()).toBeTrue();
    expect(service.isUser()).toBeTrue();
  });

  it('should retrieve roles from sessionStorage if memory cache empty', () => {
    service.setRoles(['kai_chatbot_dev_user']);
    // Clear memory cache manually
    (service as any).userRoles = [];
    expect(service.getRoles()).toEqual(['kai_chatbot_dev_user']);
  });

  it('should return empty roles and clear storage if roles signature is tampered', () => {
    const invalidPayload = btoa(JSON.stringify({ roles: ['kai_chatbot_dev_admin'], sig: 'invalid_signature' }));
    sessionStorage.setItem('userRoles', invalidPayload);
    (service as any).userRoles = [];

    expect(service.getRoles()).toEqual([]);
    expect(sessionStorage.getItem('userRoles')).toBeNull();
  });

  it('should return empty roles if roles JSON is corrupted', () => {
    sessionStorage.setItem('userRoles', 'not_valid_b64_json');
    (service as any).userRoles = [];

    expect(service.getRoles()).toEqual([]);
  });

  it('should set and get user info', () => {
    const info = { name: 'John Doe', email: 'john@kumaran.world' };
    service.setUserInfo(info);
    expect(service.getUserInfo()).toEqual(info);

    service.setUserInfo(null);
    expect(service.getUserInfo()).toBeNull();
  });

  it('should return null if userInfo signature is tampered', () => {
    const invalidPayload = btoa(JSON.stringify({ info: { name: 'Fake' }, sig: 'bad_sig' }));
    sessionStorage.setItem('userInfo', invalidPayload);

    expect(service.getUserInfo()).toBeNull();
  });

  it('should return null if userInfo payload is invalid', () => {
    sessionStorage.setItem('userInfo', 'corrupt_b64');
    expect(service.getUserInfo()).toBeNull();
  });

  it('should set and get blocked status', () => {
    service.setBlocked(true);
    expect(service.isBlocked()).toBeTrue();

    service.setBlocked(false);
    expect(service.isBlocked()).toBeFalse();
  });

  it('should return true (default blocked) if blocked signature is tampered', () => {
    const invalidPayload = btoa(JSON.stringify({ blocked: false, sig: 'bad_sig' }));
    sessionStorage.setItem('kai_is_blocked', invalidPayload);

    expect(service.isBlocked()).toBeTrue();
  });

  it('should return true if blocked JSON payload is corrupt', () => {
    sessionStorage.setItem('kai_is_blocked', 'bad_b64');
    expect(service.isBlocked()).toBeTrue();
  });

  it('should set and get product roles and verify isProductAdmin', () => {
    service.setProductRoles(['is_product_admin', 'kai_kplatform_dev_admin']);
    expect(service.getProductRoles()).toEqual(['is_product_admin', 'kai_kplatform_dev_admin']);
    expect(service.isProductAdmin()).toBeTrue();

    // Clear product roles cache to test retrieval from session storage
    (service as any).productRoles = [];
    expect(service.getProductRoles()).toEqual(['is_product_admin', 'kai_kplatform_dev_admin']);
    expect(service.isProductAdmin()).toBeTrue();
  });

  it('should return false for isProductAdmin if role is not present', () => {
    service.setProductRoles(['kai_kplatform_user']);
    expect(service.isProductAdmin()).toBeFalse();
  });

  it('should verify hasAgentAccess and retain it from sessionStorage after cache reset (refresh)', () => {
    service.setProductRoles(['kai_kplatform_user']);
    expect(service.hasAgentAccess()).toBeTrue();

    // Clear in-memory product roles cache to simulate browser refresh
    (service as any).productRoles = [];
    expect(service.hasAgentAccess()).toBeTrue();
    expect(sessionStorage.getItem('kai_is_agents_accessible')).toBe('true');
  });

  it('should return false for hasAgentAccess when roles do not contain agent/platform keywords', () => {
    service.setProductRoles(['other_role_only']);
    expect(service.hasAgentAccess()).toBeFalse();
    expect(sessionStorage.getItem('kai_is_agents_accessible')).toBe('false');
  });

  it('should restore hasAgentAccess from sessionStorage fallback when productRoles are empty', () => {
    service.clearToken();
    sessionStorage.setItem('kai_is_agents_accessible', 'true');
    expect(service.hasAgentAccess()).toBeTrue();
  });

  it('should clear kai_is_agents_accessible on clearToken()', () => {
    service.setProductRoles(['k_agent_dev']);
    expect(sessionStorage.getItem('kai_is_agents_accessible')).toBe('true');

    service.clearToken();
    expect(sessionStorage.getItem('kai_is_agents_accessible')).toBeNull();
  });
});
