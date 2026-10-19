import { TestBed } from '@angular/core/testing';
import { SidenavLayoutBridgeService } from './sidenav-layout-bridge.service';

describe('SidenavLayoutBridgeService', () => {
  let service: SidenavLayoutBridgeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [SidenavLayoutBridgeService]
    });
    service = TestBed.inject(SidenavLayoutBridgeService);
  });

  it('should update and get user info signal', () => {
    service.setUserInfo({ name: 'John Doe' });
    expect(service.userInfo()).toEqual({ name: 'John Doe' });
  });

  it('should update models signal', () => {
    const models = [{ id: 'gpt-4', name: 'GPT-4' }];
    service.setModels(models);
    expect(service.models()).toEqual(models);
  });

  it('should notify and track sidenav collapsed state', () => {
    service.notifySidenavCollapsed(true);
    expect(service.sidenavCollapsed()).toBeTrue();

    service.notifySidenavCollapsed(false);
    expect(service.sidenavCollapsed()).toBeFalse();
  });
});
