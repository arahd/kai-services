import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { SidenavProfileComponent } from '@features/sidenav/components/sidenav-profile/sidenav-profile.component';

describe('SidenavProfileComponent', () => {
  let component: SidenavProfileComponent;
  let fixture: ComponentFixture<SidenavProfileComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SidenavProfileComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])]
    }).compileComponents();

    fixture = TestBed.createComponent(SidenavProfileComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit logoutEvt when logout is triggered', () => {
    spyOn(component.logoutEvt, 'emit');
    component.logoutEvt.emit();
    expect(component.logoutEvt.emit).toHaveBeenCalled();
  });

  it('should emit streamingToggleEvt when streaming is toggled', () => {
    spyOn(component.streamingToggleEvt, 'emit');
    const mockEvent = { target: { checked: true } };
    component.onToggleStreaming(mockEvent);
    expect(component.streamingToggleEvt.emit).toHaveBeenCalledWith(true);
  });

  it('should toggle showHelpSubmenu when openHelp is called', () => {
    expect(component.showHelpSubmenu).toBeFalse();
    component.openHelp();
    expect(component.showHelpSubmenu).toBeTrue();
    component.openHelp();
    expect(component.showHelpSubmenu).toBeFalse();
  });

  it('should trigger walkthrough and close popover', () => {
    spyOn(component.helpMenu, 'startWalkthrough');
    spyOn(component.togglePopoverEvt, 'emit');
    component.triggerWalkthrough();
    expect(component.helpMenu.startWalkthrough).toHaveBeenCalled();
    expect(component.togglePopoverEvt.emit).toHaveBeenCalledWith(undefined);
  });

  it('should trigger user manual and close popover', () => {
    spyOn(component.helpMenu, 'openUserManual');
    spyOn(component.togglePopoverEvt, 'emit');
    component.triggerUserManual();
    expect(component.helpMenu.openUserManual).toHaveBeenCalled();
    expect(component.togglePopoverEvt.emit).toHaveBeenCalledWith(undefined);
  });

  it('should trigger help center and close popover', () => {
    spyOn(component.helpMenu, 'openHelpCenter');
    spyOn(component.togglePopoverEvt, 'emit');
    component.triggerHelpCenter();
    expect(component.helpMenu.openHelpCenter).toHaveBeenCalled();
    expect(component.togglePopoverEvt.emit).toHaveBeenCalledWith(undefined);
  });

  it('should trigger privacy policy and close popover', () => {
    spyOn(component.helpMenu, 'openPrivacyPolicy');
    spyOn(component.togglePopoverEvt, 'emit');
    component.triggerPrivacyPolicy();
    expect(component.helpMenu.openPrivacyPolicy).toHaveBeenCalled();
    expect(component.togglePopoverEvt.emit).toHaveBeenCalledWith(undefined);
  });

  it('should trigger raise bug and close popover', () => {
    spyOn(component.helpMenu, 'raiseBug');
    spyOn(component.togglePopoverEvt, 'emit');
    component.triggerRaiseBug();
    expect(component.helpMenu.raiseBug).toHaveBeenCalled();
    expect(component.togglePopoverEvt.emit).toHaveBeenCalledWith(undefined);
  });

  it('should trigger feature request and close popover', () => {
    spyOn(component.helpMenu, 'raiseFeatureRequest');
    spyOn(component.togglePopoverEvt, 'emit');
    component.triggerFeatureRequest();
    expect(component.helpMenu.raiseFeatureRequest).toHaveBeenCalled();
    expect(component.togglePopoverEvt.emit).toHaveBeenCalledWith(undefined);
  });

  describe('isSettingsSupportedPage', () => {
    let router: Router;

    beforeEach(() => {
      router = TestBed.inject(Router);
    });

    it('should return true for chatbot, product, and project pages', () => {
      const urlSpy = spyOnProperty(router, 'url', 'get');

      urlSpy.and.returnValue('/chatbot');
      expect(component.isSettingsSupportedPage).toBeTrue();

      urlSpy.and.returnValue('/chatbot/convo-123');
      expect(component.isSettingsSupportedPage).toBeTrue();

      urlSpy.and.returnValue('/product');
      expect(component.isSettingsSupportedPage).toBeTrue();

      urlSpy.and.returnValue('/product/admin');
      expect(component.isSettingsSupportedPage).toBeTrue();

      urlSpy.and.returnValue('/projects');
      expect(component.isSettingsSupportedPage).toBeTrue();

      urlSpy.and.returnValue('/projects/p1/c2');
      expect(component.isSettingsSupportedPage).toBeTrue();
    });

    it('should return false for other pages like hrportal, admin, login', () => {
      const urlSpy = spyOnProperty(router, 'url', 'get');

      urlSpy.and.returnValue('/hrportal');
      expect(component.isSettingsSupportedPage).toBeFalse();

      urlSpy.and.returnValue('/admin');
      expect(component.isSettingsSupportedPage).toBeFalse();

      urlSpy.and.returnValue('/login');
      expect(component.isSettingsSupportedPage).toBeFalse();
    });
  });
});
