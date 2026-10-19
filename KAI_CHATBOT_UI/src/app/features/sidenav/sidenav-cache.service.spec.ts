import { TestBed } from '@angular/core/testing';
import { SidenavCacheService, SidenavCacheState } from './sidenav-cache.service';

describe('SidenavCacheService', () => {
  let service: SidenavCacheService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SidenavCacheService]
    });

    service = TestBed.inject(SidenavCacheService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should get, set and clear state', () => {
    expect(service.get()).toBeNull();

    const mockState: SidenavCacheState = {
      userEmail: 'test@example.com',
      chats: [{ id: '1' }],
      activeConversationID: '1',
      currentPage: 1,
      totalPages: 5,
      showHistorySection: true,
      updatedAt: Date.now()
    };

    service.set(mockState);
    expect(service.get()).toEqual(mockState);

    service.clear();
    expect(service.get()).toBeNull();
  });
});
