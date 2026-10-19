import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { HrPortalComponent } from './hr-portal.component';
import { HrPermissionService } from './hr-portal-services/hr-permission.service';
import { PopupService } from './hr-portal-services/popup.service';
import { TokenService } from '@core/services/token.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';

describe('HrPortalComponent', () => {
  let component: HrPortalComponent;
  let fixture: ComponentFixture<HrPortalComponent>;

  const mockHrPermissionService = {
    loadAccessControl: jasmine.createSpy('loadAccessControl').and.returnValue(of(null)),
    isAdmin: () => true,
  };

  const mockTokenService = {
    isAdmin: () => true,
    isHrAdmin: () => true,
    isUser: () => false,
    getUserInfo: () => ({ name: 'Test User', email: 'test@kumaran.com' }),
  };

  const mockStorageService = {
    getItem: () => null,
    setItem: () => {},
    removeConversationId: () => {},
    removeLastActiveConversationId: () => {},
  };

  const mockSidenavLayoutBridge = {
    registerHost: jasmine.createSpy('registerHost'),
    unregisterHost: jasmine.createSpy('unregisterHost'),
  };

  const mockPopupService = {
    popupState$: of(false),
    activePopup$: of(''),
    activePopup: () => '',
    setActivePopup: () => {},
    openPopup: () => {},
    closePopup: () => {},
  };

  const mockRouter = {
    navigate: jasmine.createSpy('navigate'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HrPortalComponent],
      providers: [
        { provide: HrPermissionService, useValue: mockHrPermissionService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: SessionStorageService, useValue: mockStorageService },
        { provide: SidenavLayoutBridgeService, useValue: mockSidenavLayoutBridge },
        { provide: PopupService, useValue: mockPopupService },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HrPortalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load access control on init', () => {
    expect(component).toBeTruthy();
    expect(mockHrPermissionService.loadAccessControl).toHaveBeenCalled();
  });
});
