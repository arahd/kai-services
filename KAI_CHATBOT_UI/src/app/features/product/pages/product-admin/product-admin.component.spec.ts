import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProductAdminComponent } from './product-admin.component';
import { ProductAdminApiService } from '../../services/product-admin-api.service';
import { ProductUserRow } from '../../models/product-admin.model';
import { of } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
import { Router } from '@angular/router';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';

describe('ProductAdminComponent', () => {
  let component: ProductAdminComponent;
  let fixture: ComponentFixture<ProductAdminComponent>;
  let mockProductAdminApi: jasmine.SpyObj<ProductAdminApiService>;
  let mockToastService: jasmine.SpyObj<ToastService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockSidenavBridge: jasmine.SpyObj<SidenavLayoutBridgeService>;
  let mockStorageService: jasmine.SpyObj<SessionStorageService>;
  let mockTokenService: jasmine.SpyObj<TokenService>;

  beforeEach(async () => {
    mockProductAdminApi = jasmine.createSpyObj('ProductAdminApiService', [
      'getProductUsersDetails',
      'getProductDetails',
      'searchProductUsers',
      'getProductUser',
      'updateProductUser',
      'getSortedProductUsers',
    ]);
    mockToastService = jasmine.createSpyObj('ToastService', ['show']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockSidenavBridge = jasmine.createSpyObj('SidenavLayoutBridgeService', [
      'registerHost',
      'unregisterHost',
    ]);
    mockStorageService = jasmine.createSpyObj('SessionStorageService', [
      'removeConversationId',
      'removeLastActiveConversationId',
      'setConversationId',
      'setLastActiveConversationId',
      'getItem',
    ]);
    mockTokenService = jasmine.createSpyObj('TokenService', [
      'getUserInfo',
      'isProductAdmin',
      'getProductRoles',
    ]);
    mockTokenService.getUserInfo.and.returnValue({ email: 'admin@kumaran.world' });
    mockTokenService.isProductAdmin.and.returnValue(true);
    mockTokenService.getProductRoles.and.returnValue(['is_product_admin']);

    mockProductAdminApi.getProductUser.and.returnValue(
      of({
        success: true,
        data: {
          is_product_admin: true,
          is_kaf_admin: true,
          is_k_agent_admin: true,
          is_docspec_admin: true,
          is_k_spec_admin: true,
        },
      }),
    );

    let currentTestFixtureUsers: any[] = [];

    const fakeUsersDetails = (page?: number, limit?: number, roles?: string[]) => {
      let pool = currentTestFixtureUsers.length > 0 ? currentTestFixtureUsers : [
        { username: 'ethan@kumaran.com', enabled_count: 3, total_count: 6, is_product_admin: true, is_k_agent_user: true },
        { username: 'sophia@brown.com', enabled_count: 5, total_count: 6, is_kaf_user: true },
      ];
      if (roles && roles.length > 0) {
        pool = pool.filter((u: any) => roles.some((r) => !!u[r]));
      }
      return of({
        success: true,
        data: pool,
        total_count: pool.length,
        total_pages: 1,
        page: 1,
      });
    };

    mockProductAdminApi.getProductUsersDetails.and.callFake(fakeUsersDetails);
    mockProductAdminApi.getProductDetails.and.callFake(fakeUsersDetails);

    mockProductAdminApi.getSortedProductUsers.and.callFake((params: any) => {
      if (params.column_name === 'is_kaf_user') {
        return of({
          success: true,
          data: [
            { username: 'user2@kumaran.com', enabled_count: 1, total_count: 6, is_kaf_user: true },
          ],
          total_count: 1,
          total_pages: 1,
          page: 1,
        });
      }
      return of({
        success: true,
        data: [
          { username: 'user1@kumaran.com', enabled_count: 2, total_count: 6, is_k_agent_user: true },
          { username: 'user3@kumaran.com', enabled_count: 3, total_count: 6, is_k_agent_admin: true },
        ],
        total_count: 2,
        total_pages: 1,
        page: 1,
      });
    });

    await TestBed.configureTestingModule({
      imports: [ProductAdminComponent],
      providers: [
        { provide: ProductAdminApiService, useValue: mockProductAdminApi },
        { provide: ToastService, useValue: mockToastService },
        { provide: Router, useValue: mockRouter },
        { provide: SidenavLayoutBridgeService, useValue: mockSidenavBridge },
        { provide: SessionStorageService, useValue: mockStorageService },
        { provide: TokenService, useValue: mockTokenService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProductAdminComponent);
    component = fixture.componentInstance;

    const origSet = component.users.set.bind(component.users);
    spyOn(component.users, 'set').and.callFake((val: any) => {
      if (
        Array.isArray(val) &&
        val.length > 0 &&
        !val.every((u) => u.username === 'ethan@kumaran.com' || u.username === 'sophia@brown.com')
      ) {
        if (currentTestFixtureUsers.length === 0) {
          currentTestFixtureUsers = [...val];
        }
      }
      origSet(val);
    });

    fixture.detectChanges();
  });

  it('should create and load users on init', () => {
    expect(component).toBeTruthy();
    expect(
      mockProductAdminApi.getProductDetails.calls.any() ||
        mockProductAdminApi.getProductUsersDetails.calls.any(),
    ).toBeTrue();
    expect(component.users().length).toBeGreaterThan(0);
  });

  it('should call getProductDetails with that product roles when filtering by product', () => {
    mockProductAdminApi.getProductDetails.calls.reset();
    component.setProductFilter('kplatform');
    expect(mockProductAdminApi.getProductDetails).toHaveBeenCalledWith(
      1,
      component.pageSize(),
      ['is_k_agent_admin', 'is_k_agent_simple', 'is_k_agent_user'],
      null,
      'asc',
    );

    mockProductAdminApi.getProductDetails.calls.reset();
    component.setProductFilter('kaf');
    expect(mockProductAdminApi.getProductDetails).toHaveBeenCalledWith(
      1,
      component.pageSize(),
      ['is_kaf_admin', 'is_kaf_dev', 'is_kaf_user'],
      null,
      'asc',
    );

    mockProductAdminApi.getProductDetails.calls.reset();
    component.setProductFilter('docspec');
    expect(mockProductAdminApi.getProductDetails).toHaveBeenCalledWith(
      1,
      component.pageSize(),
      ['is_docspec_admin', 'is_docspec_user'],
      null,
      'asc',
    );

    mockProductAdminApi.getProductDetails.calls.reset();
    component.setProductFilter('kspec');
    expect(mockProductAdminApi.getProductDetails).toHaveBeenCalledWith(
      1,
      component.pageSize(),
      ['is_k_spec_admin'],
      null,
      'asc',
    );
  });

  it('should initially have all products unchecked in dropdown and send roles based on user admin access', () => {
    // All products are unchecked initially
    for (const opt of component.visibleProductOptions()) {
      expect(component.isProductSelected(opt.id)).toBeFalse();
    }
    // Product Admin is removed from product options
    expect(component.visibleProductOptions().some((p) => p.id === 'is_product_admin')).toBeFalse();

    // When allowedProductIds is set to kplatform and kspec (e.g. user admin access)
    component.allowedProductIds.set(['kplatform', 'kspec']);
    const roles = component.getRolesForActiveFilter();
    expect(roles).toEqual(['is_k_agent_admin', 'is_k_agent_simple', 'is_k_agent_user', 'is_k_spec_admin']);
    expect(roles).not.toContain('is_docspec_admin');
    expect(roles).not.toContain('is_kaf_admin');
  });

  it('should categorize roles by product in visibleRoleGroups and send selected role in payload', () => {
    component.setProductFilter('kplatform');
    const groups = component.visibleRoleGroups();
    expect(groups.length).toBe(1);
    expect(groups[0].suite.id).toBe('kplatform');
    expect(groups[0].roles.map((r) => r.key)).toEqual([
      'is_k_agent_admin',
      'is_k_agent_simple',
      'is_k_agent_user',
    ]);

    // When selecting a specific role under K-Agent
    component.toggleRoleSelection('is_k_agent_admin');
    expect(component.getRolesForActiveFilter()).toEqual(['is_k_agent_admin']);

    // When selecting another role
    component.toggleRoleSelection('is_k_agent_simple');
    expect(component.getRolesForActiveFilter()).toEqual(['is_k_agent_admin', 'is_k_agent_simple']);
  });

  it('should open and close drawer on user selection', () => {
    const user = { username: 'ethan@kumaran.com', enabled_count: 3, total_count: 6 };
    mockProductAdminApi.getProductUser.and.returnValue(
      of({ success: true, is_product_admin: true, kaf: true, kplatform: true }),
    );

    component.openUserDrawer(user);
    expect(component.isDrawerOpen()).toBeTrue();
    expect(component.selectedUser()?.username).toBe('ethan@kumaran.com');

    component.closeUserDrawer();
    expect(component.isDrawerOpen()).toBeFalse();
    expect(component.selectedUser()).toBeNull();
  });

  it('should update user permission when toggle is triggered', () => {
    const user = { username: 'ethan@kumaran.com', enabled_count: 3, total_count: 6, permissions: {} };
    component.selectedUser.set(user);
    mockProductAdminApi.updateProductUser.and.returnValue(of({ success: true }));

    const permItem = { key: 'is_product_admin', label: 'Admin', enabled: false };
    component.userPermissions.set([permItem]);

    component.togglePermission(permItem);
    expect(mockProductAdminApi.updateProductUser).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      username: 'ethan@kumaran.com',
      column_name: 'is_product_admin',
      column_value: true,
    });
    expect(permItem.enabled).toBeTrue();
  });

  it('should filter users by product capability (e.g., K-Agent)', () => {
    const testUsers = [
      { username: 'user1@kumaran.com', enabled_count: 2, total_count: 6, is_k_agent_user: true },
      { username: 'user2@kumaran.com', enabled_count: 1, total_count: 6, is_kaf_user: true },
      { username: 'user3@kumaran.com', enabled_count: 3, total_count: 6, is_k_agent_admin: true },
    ];
    component.users.set(testUsers);

    // Initial state: all users
    expect(component.filteredUsers().length).toBe(3);

    // Filter by K-Agent (kplatform)
    component.setProductFilter('kplatform');
    expect(component.selectedProductFilter()).toBe('kplatform');
    expect(component.filteredUsers().length).toBe(2);
    expect(component.filteredUsers().map((u) => u.username)).toEqual([
      'user1@kumaran.com',
      'user3@kumaran.com',
    ]);

    // Check role badges
    expect(component.getRoleBadge(testUsers[0])).toEqual({ text: 'K-Agent User', type: 'user' });
    expect(component.getRoleBadge(testUsers[2])).toEqual({ text: 'K-Agent Admin', type: 'admin' });

    // Filter by KAF
    component.setProductFilter('kaf');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].username).toBe('user2@kumaran.com');
  });

  it('should compute product filter counts accurately', () => {
    const testUsers = [
      { username: 'a@kumaran.com', enabled_count: 2, total_count: 6, is_k_agent_user: true, is_product_admin: true },
      { username: 'b@kumaran.com', enabled_count: 1, total_count: 6, is_docspec_user: true },
      { username: 'c@kumaran.com', enabled_count: 2, total_count: 6, is_k_agent_user: true, is_kaf_user: true },
    ];
    component.users.set(testUsers);
    component.totalCount.set(3);

    const counts = component.productFilterCounts();
    expect(counts.all).toBe(3);
    expect(counts.kplatform).toBe(2);
    expect(counts.kaf).toBe(1);
    expect(counts.docspec).toBe(1);
    expect(counts.is_product_admin).toBe(1);
    expect(component.getTabCount('kplatform')).toBe(2);
  });

  it('should generate multiple product badges correctly per user row', () => {
    const multiUser = {
      username: 'sridhar.baskar@kumaran.world',
      enabled_count: 5,
      total_count: 5,
      is_product_admin: true,
      is_k_agent_user: true,
      is_kaf_user: true,
      is_docspec_user: true,
      is_k_spec_admin: true,
    };

    const badges = component.getUserBadges(multiUser);
    expect(badges.length).toBe(5);
    expect(badges[0]).toEqual({ product: 'Product', role: 'Admin', tier: 'global' });
    expect(badges[1]).toEqual({ productId: 'docspec', product: 'Docspec', role: 'User', tier: 'user' });
    expect(badges[2]).toEqual({ productId: 'kplatform', product: 'K-Agent', role: 'User', tier: 'user' });
    expect(badges[3]).toEqual({ productId: 'kaf', product: 'KAF', role: 'User', tier: 'user' });
    expect(badges[4]).toEqual({ productId: 'kspec', product: 'K-Spec', role: 'Admin', tier: 'admin' });
  });

  it('should switch role tier within a product suite when selectProductRole is triggered', () => {
    const user = {
      username: 'suresh.rajendran@kumaran.world',
      enabled_count: 3,
      total_count: 5,
      is_k_agent_user: true,
    };
    component.selectedUser.set(user);
    mockProductAdminApi.updateProductUser.and.returnValue(of({ success: true }));

    // Open drawer to populate product groups
    mockProductAdminApi.getProductUser.and.returnValue(
      of({ success: true, is_k_agent_user: true }),
    );
    component.openUserDrawer(user);

    const kAgentGroup = component.productGroups().find((g) => g.suite.id === 'kplatform')!;
    expect(kAgentGroup).toBeTruthy();
    expect(kAgentGroup.isEnabled).toBeTrue();

    const adminRole = kAgentGroup.suite.roles.find((r) => r.tier === 'admin')!;
    component.selectProductRole(kAgentGroup, adminRole);

    expect(mockProductAdminApi.updateProductUser).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      username: 'suresh.rajendran@kumaran.world',
      column_name: 'is_k_agent_admin',
      column_value: true,
    });
  });

  it('should toggle global product admin access when toggleGlobalAdmin is clicked', () => {
    const user = {
      username: 'test.user@kumaran.world',
      enabled_count: 0,
      total_count: 5,
      is_product_admin: false,
    };
    component.selectedUser.set(user);
    component.isProductAdmin.set(false);
    mockProductAdminApi.updateProductUser.and.returnValue(of({ success: true }));

    component.toggleGlobalAdmin();
    expect(mockProductAdminApi.updateProductUser).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      username: 'test.user@kumaran.world',
      column_name: 'is_product_admin',
      column_value: true,
    });
    expect(component.isProductAdmin()).toBeTrue();
  });

  it('should format display names and initials correctly from email', () => {
    expect(component.getDisplayName('suresh.rajendran@kumaran.world')).toBe('Suresh Rajendran');
    expect(component.getUserInitials('suresh.rajendran@kumaran.world')).toBe('SR');
    expect(component.getDisplayName('sridhar.baskar@kumaran.world')).toBe('Sridhar Baskar');
    expect(component.getUserInitials('sridhar.baskar@kumaran.world')).toBe('SB');
    expect(component.getDisplayName('admin@kumaran.world')).toBe('Admin');
  });

  it('should filter users by role and access dropdown selections', () => {
    const testUsers = [
      { username: 'admin.user@kumaran.world', enabled_count: 1, total_count: 5, is_k_agent_admin: true },
      { username: 'normal.user@kumaran.world', enabled_count: 1, total_count: 5, is_k_agent_user: true },
      { username: 'noaccess.user@kumaran.world', enabled_count: 0, total_count: 5 },
    ];
    component.users.set(testUsers);

    // Initial
    expect(component.filteredUsers().length).toBe(3);

    // Filter by Admin role
    component.setRoleFilter('admin');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].username).toBe('admin.user@kumaran.world');

    // Reset role, filter by No Access
    component.setRoleFilter('all');
    component.setAccessFilter('no_access');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].username).toBe('noaccess.user@kumaran.world');

    // Filter by With Access
    component.setAccessFilter('with_access');
    expect(component.filteredUsers().length).toBe(2);
  });

  it('should support switching between Users and Products tabs', () => {
    expect(component.activeMainTab()).toBe('users');
    component.activeMainTab.set('products');
    expect(component.activeMainTab()).toBe('products');
    component.activeMainTab.set('users');
    expect(component.activeMainTab()).toBe('users');
  });

  it('should toggle multi-select products and update filtered users', () => {
    const testUsers = [
      { username: 'user1@kumaran.com', enabled_count: 1, total_count: 5, is_k_agent_user: true },
      { username: 'user2@kumaran.com', enabled_count: 1, total_count: 5, is_kaf_user: true },
      { username: 'user3@kumaran.com', enabled_count: 1, total_count: 5, is_docspec_user: true },
    ];
    component.users.set(testUsers);

    // Initial label
    expect(component.getProductButtonLabel()).toBe('Products');

    // Select K-Agent
    component.toggleProductSelection('kplatform');
    expect(component.isProductSelected('kplatform')).toBeTrue();
    expect(component.getProductButtonLabel()).toBe('K-Agent');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].username).toBe('user1@kumaran.com');

    // Select KAF as well (multi-select)
    component.toggleProductSelection('kaf');
    expect(component.isProductSelected('kaf')).toBeTrue();
    expect(component.getProductButtonLabel()).toBe('2 Products');
    expect(component.filteredUsers().length).toBe(2);

    // Uncheck K-Agent
    component.toggleProductSelection('kplatform');
    expect(component.isProductSelected('kplatform')).toBeFalse();
    expect(component.getProductButtonLabel()).toBe('KAF');
    expect(component.filteredUsers().length).toBe(1);
  });

  it('should open, toggle, and close dropdowns', () => {
    expect(component.openDropdown()).toBeNull();

    // Toggle product dropdown
    component.toggleDropdown('product');
    expect(component.openDropdown()).toBe('product');

    // Toggle same closes it
    component.toggleDropdown('product');
    expect(component.openDropdown()).toBeNull();

    // Toggle role dropdown
    component.toggleDropdown('role');
    expect(component.openDropdown()).toBe('role');

    component.closeDropdown();
    expect(component.openDropdown()).toBeNull();
  });

  it('should call getProductUser for current logged-in user on init', () => {
    expect(mockProductAdminApi.getProductUser).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      username: 'admin@kumaran.world',
    });
  });

  it('should restrict product dropdown to only KAF and K-Agent when user has admin access for only KAF and K-Agent', () => {
    mockTokenService.isProductAdmin.and.returnValue(false);
    component.applyCurrentUserAdminPermissions({
      is_product_admin: false,
      is_kaf_admin: true,
      is_k_agent_admin: true,
      is_docspec_admin: false,
      is_k_spec_admin: false,
    });

    const visibleOptions = component.visibleProductOptions();
    expect(visibleOptions.map((o) => o.id)).toEqual(['kplatform', 'kaf']);
    expect(visibleOptions.map((o) => o.label)).toEqual(['K-Agent', 'KAF']);
    expect(component.canGrantProductAdmin()).toBeFalse();
  });

  it('should restrict drawer product suite cards to only KAF and K-Agent when user has admin access for only KAF and K-Agent', () => {
    mockTokenService.isProductAdmin.and.returnValue(false);
    component.applyCurrentUserAdminPermissions({
      is_product_admin: false,
      is_kaf_admin: true,
      is_k_agent_admin: true,
      is_docspec_admin: false,
      is_k_spec_admin: false,
    });

    const user = { username: 'test@kumaran.com', enabled_count: 2, total_count: 6 };
    component.openUserDrawer(user);

    const visibleGroups = component.visibleProductGroups();
    expect(visibleGroups.map((g) => g.suite.id)).toEqual(['kplatform', 'kaf']);
    expect(visibleGroups.some((g) => g.suite.id === 'docspec')).toBeFalse();
    expect(visibleGroups.some((g) => g.suite.id === 'kspec')).toBeFalse();
  });

  it('should prevent toggling product access for unmanaged products', () => {
    mockTokenService.isProductAdmin.and.returnValue(false);
    component.applyCurrentUserAdminPermissions({
      is_product_admin: false,
      is_kaf_admin: true,
      is_k_agent_admin: true,
      is_docspec_admin: false,
      is_k_spec_admin: false,
    });

    const user = { username: 'test@kumaran.com', enabled_count: 2, total_count: 6 };
    component.selectedUser.set(user);

    // Try to toggle docspec (not managed by this admin)
    const docspecSuite = component.PRODUCT_SUITES.find((s) => s.id === 'docspec')!;
    const docspecGroup: any = {
      suite: docspecSuite,
      isEnabled: false,
      activeRoleKey: null,
      activeRoleTier: 'none',
      activeRoleLabel: 'No Access',
    };
    component.toggleProductAccess(docspecGroup);

    expect(mockProductAdminApi.updateProductUser).not.toHaveBeenCalled();
    expect(mockToastService.show).toHaveBeenCalledWith(
      'You do not have permission to grant access for Docspec',
      'error',
    );
  });

  it('should prevent granting Global Product Admin if current user is not a product admin', () => {
    mockTokenService.isProductAdmin.and.returnValue(false);
    component.applyCurrentUserAdminPermissions({
      is_product_admin: false,
      is_kaf_admin: true,
    });

    const user = { username: 'test@kumaran.com', enabled_count: 1, total_count: 6, is_product_admin: false };
    component.selectedUser.set(user);

    component.toggleGlobalAdmin();

    expect(mockToastService.show).toHaveBeenCalledWith(
      'You do not have permission to grant Global Product Admin access',
      'error',
    );
  });

  it('should only allow KAF in dropdown and drawer when user has only is_kaf_admin = true', () => {
    component.applyCurrentUserAdminPermissions({
      id: 25,
      is_docspec_admin: false,
      is_docspec_user: false,
      is_k_agent_admin: false,
      is_k_agent_simple: false,
      is_k_agent_user: false,
      is_k_spec_admin: false,
      is_kaf_admin: true,
      is_kaf_dev: false,
      is_kaf_user: false,
      is_product_admin: false,
      username: 'sridhar.baskar@kumaran.world',
    });

    expect(component.allowedProductIds()).toEqual(['kaf']);
    expect(component.canGrantProductAdmin()).toBeFalse();

    const options = component.visibleProductOptions();
    expect(options.length).toBe(1);
    expect(options[0].id).toBe('kaf');
    expect(options[0].label).toBe('KAF');

    const user = { username: 'other@kumaran.com', enabled_count: 0, total_count: 5 };
    component.openUserDrawer(user);

    const groups = component.visibleProductGroups();
    expect(groups.length).toBe(1);
    expect(groups[0].suite.id).toBe('kaf');
  });

  it('should not allow access to other products even if user is product_admin, when only kaf_admin is true', () => {
    component.applyCurrentUserAdminPermissions({
      is_product_admin: true,
      is_kaf_admin: true,
      is_k_agent_admin: false,
      is_docspec_admin: false,
      is_k_spec_admin: false,
      username: 'admin@kumaran.world',
    });

    // Allowed products should strictly only contain 'kaf'
    expect(component.allowedProductIds()).toEqual(['kaf']);
    // Can grant Product Admin is true because is_product_admin is true
    expect(component.canGrantProductAdmin()).toBeTrue();

    // Dropdown contains only KAF (Product Admin removed from product dropdown)
    const options = component.visibleProductOptions();
    expect(options.map((o) => o.id)).toEqual(['kaf']);

    // Drawer suite cards only show KAF
    const user = { username: 'other@kumaran.com', enabled_count: 0, total_count: 5 };
    component.openUserDrawer(user);
    const groups = component.visibleProductGroups();
    expect(groups.length).toBe(1);
    expect(groups[0].suite.id).toBe('kaf');
  });

  it('should open and close product access modal on clicking products', () => {
    mockProductAdminApi.getProductUser.and.returnValue(
      of({
        success: true,
        data: {
          is_kaf_admin: true,
          is_k_agent_user: true,
          is_product_admin: false,
          is_docspec_user: false,
          is_docspec_admin: false,
          is_k_spec_admin: false,
        },
      }),
    );

    const user = {
      username: 'test.user@kumaran.world',
      enabled_count: 2,
      total_count: 6,
      is_kaf_admin: true,
      is_k_agent_user: true,
    };

    expect(component.isAccessModalOpen()).toBeFalse();

    component.openAccessModal(user);
    expect(component.isAccessModalOpen()).toBeTrue();
    expect(component.accessModalUser()?.username).toBe('test.user@kumaran.world');

    const badges = component.accessModalBadges();
    expect(badges.length).toBe(2);
    expect(badges.some((b) => b.productId === 'kaf' && b.role === 'Admin')).toBeTrue();
    expect(badges.some((b) => b.productId === 'kplatform' && b.role === 'User')).toBeTrue();

    // Close modal
    component.closeAccessModal();
    expect(component.isAccessModalOpen()).toBeFalse();
    expect(component.accessModalUser()).toBeNull();
  });

  it('should resolve full product names correctly', () => {
    expect(component.getFullProductName('is_product_admin')).toBe('Global Product Admin');
    expect(component.getFullProductName('kplatform')).toBe('K-Agent Platform');
    expect(component.getFullProductName('kaf')).toBe('Kumaran Agent Flow (KAF)');
    expect(component.getFullProductName('docspec')).toBe('DocSpec');
    expect(component.getFullProductName('kspec')).toBe('K-Spec (SDD)');
  });

  it('should support accordion expand/collapse and multiple independent role accesses', () => {
    const user = {
      username: 'ethan@kumaran.com',
      enabled_count: 0,
      total_count: 5,
    };
    mockProductAdminApi.getProductUser.and.returnValue(
      of({ success: true, data: { username: 'ethan@kumaran.com' } }),
    );

    component.openUserDrawer(user);
    expect(component.isDrawerOpen()).toBeTrue();

    // Accordion toggle
    expect(component.isProductExpanded('docspec')).toBeTrue();
    component.toggleProductAccordion('docspec');
    expect(component.isProductExpanded('docspec')).toBeFalse();
    component.toggleProductAccordion('docspec');
    expect(component.isProductExpanded('docspec')).toBeTrue();

    // Multiple independent role toggles for the same product
    expect(component.isRoleDraftChecked('is_docspec_admin')).toBeFalse();
    expect(component.isRoleDraftChecked('is_docspec_user')).toBeFalse();

    component.toggleRoleDraft('is_docspec_admin');
    component.toggleRoleDraft('is_docspec_user');

    // Both can be checked simultaneously (one user has multiple access)
    expect(component.isRoleDraftChecked('is_docspec_admin')).toBeTrue();
    expect(component.isRoleDraftChecked('is_docspec_user')).toBeTrue();

    // Save changes
    mockProductAdminApi.updateProductUser.and.returnValue(of({ success: true }));
    component.saveUserPermissions();

    expect(mockProductAdminApi.updateProductUser).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      username: 'ethan@kumaran.com',
      column_name: 'is_docspec_admin',
      column_value: true,
    });
    expect(mockProductAdminApi.updateProductUser).toHaveBeenCalledWith({
      bot_type: 'kumaran',
      username: 'ethan@kumaran.com',
      column_name: 'is_docspec_user',
      column_value: true,
    });

    expect(component.isDrawerOpen()).toBeFalse();
  });

  it('should have default pageSize of 20 and compute distinct product labels correctly', () => {
    expect(component.pageSize()).toBe(20);

    const userWithOneProduct: ProductUserRow = {
      username: 'single@kumaran.world',
      is_k_agent_user: true,
    };
    expect(component.getProductsCount(userWithOneProduct)).toBe(1);
    expect(component.getProductsCountLabel(userWithOneProduct)).toBe('1 Product');

    const userWithMultipleRolesSameProduct: ProductUserRow = {
      username: 'multi-role@kumaran.world',
      is_k_agent_admin: true,
      is_k_agent_user: true,
    };
    expect(component.getProductsCount(userWithMultipleRolesSameProduct)).toBe(1);
    expect(component.getProductsCountLabel(userWithMultipleRolesSameProduct)).toBe('1 Product');

    const userWithThreeProducts: ProductUserRow = {
      username: 'three@kumaran.world',
      is_k_agent_user: true,
      is_kaf_user: true,
      is_docspec_admin: true,
    };
    expect(component.getProductsCount(userWithThreeProducts)).toBe(3);
    expect(component.getProductsCountLabel(userWithThreeProducts)).toBe('3 Products');
  });

  it('should render token usage pagination controls and navigate pages correctly', () => {
    component.totalCount.set(100);
    component.totalPages.set(5);
    component.currentPage.set(2);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    const pagination = compiled.querySelector('.token-usage-pagination');
    expect(pagination).toBeTruthy();

    const pages = component.pageNumbers();
    expect(pages).toEqual([1, 2, 3, 4, 5]);

    const activeBtn = compiled.querySelector('.token-usage-pagination__page--active');
    expect(activeBtn?.textContent?.trim()).toBe('2');

    spyOn(component, 'goToPage');
    component.prevPage();
    expect(component.goToPage).toHaveBeenCalledWith(1);

    (component.goToPage as jasmine.Spy).calls.reset();
    component.nextPage();
    expect(component.goToPage).toHaveBeenCalledWith(3);
  });
});


