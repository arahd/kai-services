import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductComponent } from './product.component';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TokenService } from '@core/services/token.service';
import { ConfigService } from '@core/services/config.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { ProductAdminApiService } from './services/product-admin-api.service';

describe('ProductComponent', () => {
  let component: ProductComponent;
  let fixture: ComponentFixture<ProductComponent>;
  let productAdminApiMock: any;

  beforeEach(async () => {
    const tokenServiceMock = {
      getRoles: () => ['USER'],
      getProductRoles: () => ['is_kaf_user', 'is_k_agent_admin', 'is_k_spec_admin', 'docspec'],
      setProductRoles: jasmine.createSpy('setProductRoles'),
      setRoles: jasmine.createSpy('setRoles'),
      isProductAdmin: () => false,
      isAdmin: () => false,
    };

    const configServiceMock = {
      getKafUrl: () => 'http://kaf.test',
      getKPlatformUrl: () => 'http://kplatform.test',
      getDocSpecUrl: () => 'http://docspec.test',
      getSdduiUrl: () => 'http://sdd.test',
      getMainframeUrl: () => 'http://mainframe.test',
      isConfigLoaded: () => true,
    };

    const sidenavBridgeMock = {
      registerHost: jasmine.createSpy('registerHost'),
      unregisterHost: jasmine.createSpy('unregisterHost')
    };

    productAdminApiMock = {
      getAuth: jasmine.createSpy('getAuth').and.returnValue(
        of({
          allow_sensitive: false,
          current_user: 'sridhar.baskar@kumaran.world',
          groups: [],
          message: 'token authentication successfull.',
          product_roles: [
            'is_product_admin',
            'is_k_agent_admin',
            'is_kaf_user',
            'is_k_spec_admin',
          ],
          project_id: null,
          roles: ['kai_chatbot_dev_user', 'kai_kplatform_dev_admin'],
        })
      ),
    };

    await TestBed.configureTestingModule({
      imports: [ProductComponent],
      providers: [
        provideRouter([]),
        { provide: TokenService, useValue: tokenServiceMock },
        { provide: ConfigService, useValue: configServiceMock },
        { provide: SidenavLayoutBridgeService, useValue: sidenavBridgeMock },
        { provide: ProductAdminApiService, useValue: productAdminApiMock },
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ProductComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create product component', () => {
    expect(component).toBeTruthy();
  });

  it('should compute filtered capabilities with redirect URLs', () => {
    const caps = component.filteredCapabilities;
    expect(caps.length).toBeGreaterThan(0);
    expect(caps[0].redirectUrl).toBe('http://kaf.test');
    
    const kAgentCap = caps.find(c => c.title === 'K-Agent');
    expect(kAgentCap).toBeDefined();
    expect(kAgentCap?.redirectUrl).toBe('http://kplatform.test');
    expect(kAgentCap?.disabled).toBeFalse();

    const mainframeCap = caps.find(c => c.title === 'Mainframe - Spring Batch App');
    expect(mainframeCap).toBeDefined();
    expect(mainframeCap?.redirectUrl).toBe('http://mainframe.test');
    expect(mainframeCap?.disabled).toBeFalse();
  });

  it('should enable K-Agent for users with is_k_agent_admin in product_roles', () => {
    const tokenService = TestBed.inject(TokenService);
    spyOn(tokenService, 'getProductRoles').and.returnValue(['is_k_agent_admin']);

    const caps = component.filteredCapabilities;
    const kAgentCap = caps.find(c => c.title === 'K-Agent');
    expect(kAgentCap).toBeDefined();
    expect(kAgentCap?.disabled).toBeFalse();
  });

  it('should enable Kumaran Agent Flow for users with is_kaf_user in product_roles', () => {
    const tokenService = TestBed.inject(TokenService);
    spyOn(tokenService, 'getProductRoles').and.returnValue(['is_kaf_user']);

    const caps = component.filteredCapabilities;
    const kafCap = caps.find(c => c.title === 'Kumaran Agent Flow');
    expect(kafCap).toBeDefined();
    expect(kafCap?.disabled).toBeFalse();
  });

  it('should show admin access button when user has is_product_admin, but not automatically enable products without their specific roles', () => {
    const tokenService = TestBed.inject(TokenService);
    spyOn(tokenService, 'getProductRoles').and.returnValue(['is_product_admin']);

    expect(component.isProductAdmin).toBeTrue();

    const caps = component.filteredCapabilities;
    const kafCap = caps.find(c => c.title === 'Kumaran Agent Flow');
    const docSpecCap = caps.find(c => c.title === 'DocSpec');
    const kAgentCap = caps.find(c => c.title === 'K-Agent');
    const kSpecCap = caps.find(c => c.title === 'K-Spec');

    expect(kafCap?.disabled).toBeTrue();
    expect(docSpecCap?.disabled).toBeTrue();
    expect(kAgentCap?.disabled).toBeTrue();
    expect(kSpecCap?.disabled).toBeTrue();
  });

  it('should enable Launch only for KAF, K-Agent, K-Spec, and Mainframe when user has is_product_admin, is_k_agent_admin, is_kaf_user, is_k_spec_admin (DocSpec disabled)', () => {
    const tokenService = TestBed.inject(TokenService);
    spyOn(tokenService, 'getProductRoles').and.returnValue([
      'is_product_admin',
      'is_k_agent_admin',
      'is_kaf_user',
      'is_k_spec_admin',
    ]);

    const caps = component.filteredCapabilities;
    const kafCap = caps.find(c => c.title === 'Kumaran Agent Flow');
    const kAgentCap = caps.find(c => c.title === 'K-Agent');
    const kSpecCap = caps.find(c => c.title === 'K-Spec');
    const docSpecCap = caps.find(c => c.title === 'DocSpec');
    const mainframeCap = caps.find(c => c.title === 'Mainframe - Spring Batch App');

    expect(kafCap?.disabled).toBeFalse();
    expect(kAgentCap?.disabled).toBeFalse();
    expect(kSpecCap?.disabled).toBeFalse();
    expect(mainframeCap?.disabled).toBeFalse();
    expect(docSpecCap?.disabled).toBeTrue();
    expect(component.isProductAdmin).toBeTrue();
  });

  it('should strictly NOT enable capabilities when roles has kai_kplatform_dev_admin or kai_kaf_dev_admin but product_roles is empty', () => {
    const tokenService = TestBed.inject(TokenService);
    spyOn(tokenService, 'getRoles').and.returnValue(['kai_kplatform_dev_admin', 'kai_kaf_dev_admin']);
    spyOn(tokenService, 'getProductRoles').and.returnValue([]);

    const caps = component.filteredCapabilities;
    const kafCap = caps.find(c => c.title === 'Kumaran Agent Flow');
    const kAgentCap = caps.find(c => c.title === 'K-Agent');

    expect(kafCap?.disabled).toBeTrue();
    expect(kAgentCap?.disabled).toBeTrue();
  });

  it('should enable Mainframe for all users even with no roles', () => {
    const tokenService = TestBed.inject(TokenService);
    spyOn(tokenService, 'getProductRoles').and.returnValue([]);

    const caps = component.filteredCapabilities;
    const mainframeCap = caps.find(c => c.title === 'Mainframe - Spring Batch App');
    expect(mainframeCap).toBeDefined();
    expect(mainframeCap?.disabled).toBeFalse();

    const kafCap = caps.find(c => c.title === 'Kumaran Agent Flow');
    expect(kafCap?.disabled).toBeTrue();
  });

  it('should call productAdminApi.getAuth() on init and update token service product roles and roles', () => {
    expect(productAdminApiMock.getAuth).toHaveBeenCalled();
    const tokenService = TestBed.inject(TokenService);
    expect(tokenService.setProductRoles).toHaveBeenCalledWith([
      'is_product_admin',
      'is_k_agent_admin',
      'is_kaf_user',
      'is_k_spec_admin',
    ]);
    expect(tokenService.setRoles).toHaveBeenCalledWith([
      'kai_chatbot_dev_user',
      'kai_kplatform_dev_admin',
    ]);
  });

  it('should enable Launch only for Kumaran Agent Flow and Mainframe when user only has is_kaf_user', () => {
    const tokenService = TestBed.inject(TokenService);
    spyOn(tokenService, 'getProductRoles').and.returnValue(['is_kaf_user']);

    const caps = component.filteredCapabilities;
    const kafCap = caps.find(c => c.title === 'Kumaran Agent Flow');
    const kAgentCap = caps.find(c => c.title === 'K-Agent');
    const docSpecCap = caps.find(c => c.title === 'DocSpec');
    const kSpecCap = caps.find(c => c.title === 'K-Spec');
    const mainframeCap = caps.find(c => c.title === 'Mainframe - Spring Batch App');

    expect(kafCap?.disabled).toBeFalse();
    expect(mainframeCap?.disabled).toBeFalse();
    expect(kAgentCap?.disabled).toBeTrue();
    expect(docSpecCap?.disabled).toBeTrue();
    expect(kSpecCap?.disabled).toBeTrue();
  });
});
