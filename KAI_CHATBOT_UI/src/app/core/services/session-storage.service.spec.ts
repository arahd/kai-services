import { TestBed } from '@angular/core/testing';
import { SessionStorageService, StorageKeys } from './session-storage.service';

describe('SessionStorageService', () => {
  let service: SessionStorageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SessionStorageService],
    });
    service = TestBed.inject(SessionStorageService);
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should set and get item using StorageKeys enum', () => {
    service.setItem(StorageKeys.CONVERSATION_ID, 'test-conv-id');
    expect(service.getItem(StorageKeys.CONVERSATION_ID)).toBe('test-conv-id');
  });

  it('should remove item', () => {
    service.setItem(StorageKeys.CONVERSATION_ID, 'test-conv-id');
    service.removeItem(StorageKeys.CONVERSATION_ID);
    expect(service.getItem(StorageKeys.CONVERSATION_ID)).toBeNull();
  });

  it('should clear all items', () => {
    service.setItem(StorageKeys.CONVERSATION_ID, 'test-conv-id');
    service.setItem(StorageKeys.JWT_TOKEN, 'test-jwt');
    service.clear();
    expect(service.getItem(StorageKeys.CONVERSATION_ID)).toBeNull();
    expect(service.getItem(StorageKeys.JWT_TOKEN)).toBeNull();
  });

  it('should handle convenience methods for conversationId', () => {
    service.setConversationId('cid-123');
    expect(service.getConversationId()).toBe('cid-123');
    service.removeConversationId();
    expect(service.getConversationId()).toBeNull();
  });

  it('should handle convenience methods for lastActiveConversationId', () => {
    service.setLastActiveConversationId('cid-456');
    expect(service.getLastActiveConversationId()).toBe('cid-456');
    service.removeLastActiveConversationId();
    expect(service.getLastActiveConversationId()).toBeNull();
  });

  it('should handle convenience methods for forceNewChat', () => {
    service.setForceNewChat(true);
    expect(service.getForceNewChat()).toBe(true);
    service.setForceNewChat(false);
    expect(service.getForceNewChat()).toBe(false);
    service.removeForceNewChat();
    expect(service.getForceNewChat()).toBe(false);
  });

  it('should handle convenience methods for jwtToken', () => {
    service.setJwtToken('token-abc');
    expect(service.getJwtToken()).toBe('token-abc');
    service.removeJwtToken();
    expect(service.getJwtToken()).toBeNull();
  });
});
