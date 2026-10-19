import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subject } from 'rxjs';
import { MobileHeaderComponent } from './mobile-header.component';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { TokenService } from '@core/services/token.service';
import { ChatModelService } from '@features/chatbot/services/chat-model.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';

describe('MobileHeaderComponent', () => {
  let component: MobileHeaderComponent;
  let fixture: ComponentFixture<MobileHeaderComponent>;
  let layoutBridgeMock: any;
  let chatModelMock: any;
  let tokenServiceMock: any;
  let routerEvents$: Subject<any>;
  let routerMock: any;

  beforeEach(async () => {
    layoutBridgeMock = {
      openMobileSidebar: jasmine.createSpy('openMobileSidebar'),
    };

    routerEvents$ = new Subject<any>();
    routerMock = {
      url: '/chatbot',
      events: routerEvents$.asObservable(),
    };

    chatModelMock = {
      selectedModel: signal('gpt-5.1'),
      getSelectedModelLabel: jasmine.createSpy('getSelectedModelLabel').and.returnValue('GPT-5.1'),
      models: signal([
        { value: 'gpt-5.1', label: 'GPT-5.1', description: 'Advanced model' },
        { value: 'gpt-4o', label: 'GPT-4o', description: 'Fast model' },
      ]),
      selectModel: jasmine.createSpy('selectModel').and.returnValue(true),
      loadModels: jasmine.createSpy('loadModels'),
      modelLocked: signal(false),
    };

    tokenServiceMock = {
      getUserInfo: jasmine.createSpy('getUserInfo').and.returnValue({ email: 'test@example.com' }),
    };

    await TestBed.configureTestingModule({
      imports: [MobileHeaderComponent],
      providers: [
        { provide: SidenavLayoutBridgeService, useValue: layoutBridgeMock },
        { provide: ChatModelService, useValue: chatModelMock },
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: ChatStateService, useValue: null },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MobileHeaderComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.showModelSelector()).toBeTrue();
  });

  it('should show model pill on project-detail page', () => {
    routerMock.url = '/projects/travel';
    component.ngOnInit();
    expect(component.showModelSelector()).toBeTrue();
  });

  it('should hide model pill when route is project list or other routes', () => {
    routerMock.url = '/projects';
    component.ngOnInit();
    expect(component.showModelSelector()).toBeFalse();

    routerMock.url = '/product';
    component.ngOnInit();
    expect(component.showModelSelector()).toBeFalse();
  });

  it('should call layoutBridge.openMobileSidebar when openSidebar is called', () => {
    component.openSidebar();
    expect(layoutBridgeMock.openMobileSidebar).toHaveBeenCalled();
  });

  it('should toggle model dropdown', () => {
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');

    expect(component.mobileModelDropdownOpen).toBeFalse();
    component.toggleModelDropdown(event);
    expect(event.stopPropagation).toHaveBeenCalled();
    expect(component.mobileModelDropdownOpen).toBeTrue();

    component.toggleModelDropdown(event);
    expect(component.mobileModelDropdownOpen).toBeFalse();
  });

  it('should not toggle model dropdown if model is locked', () => {
    chatModelMock.modelLocked.set(true);
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');

    component.toggleModelDropdown(event);
    expect(component.mobileModelDropdownOpen).toBeFalse();
  });

  it('should select model and close dropdown', () => {
    component.mobileModelDropdownOpen = true;
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');

    const modelToSelect = { value: 'gpt-4o', label: 'GPT-4o' };
    component.selectModel(modelToSelect, event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(chatModelMock.selectModel).toHaveBeenCalledWith('gpt-4o', 'test@example.com');
    expect(component.mobileModelDropdownOpen).toBeFalse();
  });

  it('should close dropdown on document click', () => {
    component.mobileModelDropdownOpen = true;
    component.onDocumentClick();
    expect(component.mobileModelDropdownOpen).toBeFalse();
  });
});
