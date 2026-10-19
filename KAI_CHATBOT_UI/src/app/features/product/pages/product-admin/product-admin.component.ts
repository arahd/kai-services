import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  HostListener,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { Subject, Subscription, of, forkJoin } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import type { SidenavLayoutHost } from '@core/layout/sidenav-layout-host';
import { SessionStorageService } from '@core/services/session-storage.service';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';
import { ConfigService } from '@core/services/config.service';
import {
  ProductGroupViewModel,
  ProductPermissionItem,
  ProductRoleOption,
  ProductSuite,
  ProductUserRow,
  UserProductRoleBadge,
} from '../../models/product-admin.model';
import { ProductAdminApiService } from '../../services/product-admin-api.service';

export const PRODUCT_SUITES: ProductSuite[] = [
  {
    id: 'docspec',
    name: 'Docspec',
    roles: [
      { key: 'is_docspec_admin', label: 'Admin', tier: 'admin' },
      { key: 'is_docspec_user', label: 'User', tier: 'user' },
    ],
  },
  {
    id: 'kplatform',
    name: 'K-Agent',
    roles: [
      { key: 'is_k_agent_admin', label: 'Admin', tier: 'admin' },
      { key: 'is_k_agent_simple', label: 'Simple', tier: 'simple' },
      { key: 'is_k_agent_user', label: 'User', tier: 'user' },
    ],
  },
  {
    id: 'kaf',
    name: 'KAF',
    roles: [
      { key: 'is_kaf_admin', label: 'Admin', tier: 'admin' },
      { key: 'is_kaf_dev', label: 'Developer', tier: 'dev' },
      { key: 'is_kaf_user', label: 'User', tier: 'user' },
    ],
  },
  {
    id: 'kspec',
    name: 'K-Spec',
    roles: [
      { key: 'is_k_spec_admin', label: 'Admin', tier: 'admin' },
    ],
  },
];

@Component({
  selector: 'app-product-admin',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule],
  templateUrl: './product-admin.component.html',
  styleUrls: ['./product-admin.component.scss'],
})
export class ProductAdminComponent implements OnInit, OnDestroy {
  private readonly productAdminApi = inject(ProductAdminApiService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly sidenavLayout = inject(SidenavLayoutBridgeService);
  private readonly storageService = inject(SessionStorageService);
  private readonly tokenService = inject(TokenService, { optional: true });
  private readonly configService = inject(ConfigService, { optional: true });
  private readonly cdr = inject(ChangeDetectorRef);

  readonly totalProductsCount = 5;

  readonly productSuites = computed<ProductSuite[]>(() => {
    const fromConfig = this.configService?.getProductSuites<ProductSuite>();
    if (fromConfig && Array.isArray(fromConfig) && fromConfig.length > 0) {
      return fromConfig;
    }
    return PRODUCT_SUITES;
  });

  get PRODUCT_SUITES(): ProductSuite[] {
    return this.productSuites();
  }

  // Main view tab ('users' | 'products')
  readonly activeMainTab = signal<'users' | 'products'>('users');

  // State Signals
  readonly users = signal<ProductUserRow[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly totalCount = signal<number>(0);
  readonly pageSize = signal<number>(20);
  readonly searchQuery = signal<string>('');
  readonly sortColumn = signal<'username' | null>(null);
  readonly sortOrder = signal<'asc' | 'desc'>('asc');

  // Filter Dropdown Options
  readonly productOptions = [
    { id: 'kplatform', label: 'K-Agent' },
    { id: 'kaf', label: 'KAF' },
    { id: 'docspec', label: 'DocSpec' },
    { id: 'kspec', label: 'K-Spec' },
  ];

  readonly roleOptions = [
    { id: 'admin', label: 'Admin' },
    { id: 'dev', label: 'Developer' },
    { id: 'user', label: 'User' },
    { id: 'simple', label: 'Simple' },
  ];

  readonly accessOptions = [
    { id: 'with_access', label: 'With Access' },
    { id: 'no_access', label: 'No Access' },
  ];

  // Multi-select State Signals
  readonly selectedProducts = signal<string[]>([]);
  readonly selectedRoles = signal<string[]>([]);
  readonly selectedAccess = signal<string[]>([]);

  // Logged-in user's admin access permissions (strictly initialized to empty until get_product_user resolves)
  readonly allowedProductIds = signal<string[]>([]);
  readonly canGrantProductAdmin = signal<boolean>(false);
  readonly isLoadingUserPermissions = signal<boolean>(false);

  // Computed options and suites filtered by current user's admin privileges
  readonly visibleProductOptions = computed(() => {
    const allowed = this.allowedProductIds();
    if (allowed.length > 0) {
      return this.productOptions.filter((opt) => allowed.includes(opt.id));
    }
    return this.productOptions;
  });

  readonly visibleProductGroups = computed(() => {
    const allowed = this.allowedProductIds();
    return this.productGroups().filter((group) => allowed.includes(group.suite.id));
  });

  readonly visibleProductSuites = computed(() => {
    const allowed = this.allowedProductIds();
    return this.productSuites().filter((suite) => allowed.includes(suite.id));
  });

  readonly visibleRoleGroups = computed<{ suite: ProductSuite; roles: ProductRoleOption[] }[]>(() => {
    const selectedProds = this.selectedProducts();
    const allowed = this.allowedProductIds();
    const suites = this.productSuites();

    let targetSuites: ProductSuite[] = [];
    if (selectedProds.length > 0) {
      targetSuites = suites.filter((s) => selectedProds.includes(s.id));
    } else if (allowed.length > 0) {
      targetSuites = suites.filter((s) => allowed.includes(s.id));
    } else {
      targetSuites = suites;
    }

    return targetSuites.map((suite) => ({
      suite,
      roles: suite.roles,
    }));
  });

  readonly visibleRoleOptions = computed(() => {
    const groups = this.visibleRoleGroups();
    const allRoles: { id: string; label: string; key: string }[] = [];
    for (const g of groups) {
      for (const r of g.roles) {
        allRoles.push({ id: r.key, label: `${g.suite.name} ${r.label}`, key: r.key });
      }
    }
    return allRoles;
  });

  // Open Dropdown State ('product' | 'role' | 'access' | null)
  readonly openDropdown = signal<'product' | 'role' | 'access' | null>(null);

  // Filter Dropdown Signals (preserved for backward compatibility with tests)
  readonly selectedProductFilter = signal<string>('all');
  readonly selectedRoleFilter = signal<string>('all');
  readonly selectedAccessFilter = signal<string>('all');

  // Slide-over Drawer State for selected user permissions
  readonly isDrawerOpen = signal<boolean>(false);
  readonly selectedUser = signal<ProductUserRow | null>(null);
  readonly isProductAdmin = signal<boolean>(false);
  readonly productGroups = signal<ProductGroupViewModel[]>([]);
  readonly userPermissions = signal<ProductPermissionItem[]>([]);
  readonly isUpdatingPermission = signal<boolean>(false);

  // Product Access Popup Modal State
  readonly isAccessModalOpen = signal<boolean>(false);
  readonly accessModalUser = signal<ProductUserRow | null>(null);
  readonly accessModalBadges = computed(() => {
    const user = this.accessModalUser();
    return user ? this.getUserBadges(user) : [];
  });

  // Accordion expanded product IDs for the drawer
  readonly expandedProductIds = signal<Set<string>>(new Set(['docspec']));

  // Draft permissions state for the drawer (supports multiple accesses per user)
  readonly draftPermissions = signal<Record<string, boolean>>({});
  private initialPermissions: Record<string, boolean> = {};

  private readonly searchSubject = new Subject<string>();
  private searchSubscription?: Subscription;
  private productSidenavStreaming = false;

  // Product Capability Filtering State (Preserved for compatibility and filter options)
  readonly filterTabs: { id: string; label: string; columnName?: string }[] = [
    { id: 'all', label: 'All Users' },
    { id: 'kplatform', label: 'K-Agent', columnName: 'is_k_agent_user' },
    { id: 'kaf', label: 'KAF', columnName: 'is_kaf_user' },
    { id: 'docspec', label: 'DocSpec', columnName: 'is_docspec_user' },
    { id: 'kspec', label: 'K-Spec', columnName: 'is_k_spec_admin' },
    { id: 'is_product_admin', label: 'Admins', columnName: 'is_product_admin' },
  ];

  private readonly tabCountsCache = signal<Record<string, number>>({
    all: 0,
    kplatform: 0,
    kaf: 0,
    docspec: 0,
    kspec: 0,
    is_product_admin: 0,
  });

  // Top Statistics
  readonly totalUsersCountStat = computed(() => {
    return this.totalCount() || this.users().length || 21;
  });

  readonly totalProductsCountStat = computed(() => {
    return 12;
  });

  readonly usersWithAccessCountStat = computed(() => {
    const list = this.users();
    if (list.length === 0) return 17;
    return list.filter((u) => this.getProductsCount(u) > 0).length;
  });

  readonly productFilterCounts = computed(() => {
    const list = this.users();
    return {
      all: this.totalCount() || list.length,
      kplatform: list.filter(
        (u) =>
          u.is_k_agent_user ||
          u.is_k_agent_admin ||
          u.is_k_agent_simple ||
          u.permissions?.['kplatform'] ||
          u.permissions?.['is_k_agent_user'] ||
          u.permissions?.['is_k_agent_admin'] ||
          u.permissions?.['is_k_agent_simple'],
      ).length,
      kaf: list.filter(
        (u) =>
          u.is_kaf_user ||
          u.is_kaf_admin ||
          u.is_kaf_dev ||
          u.permissions?.['kaf'] ||
          u.permissions?.['is_kaf_user'] ||
          u.permissions?.['is_kaf_admin'] ||
          u.permissions?.['is_kaf_dev'],
      ).length,
      docspec: list.filter(
        (u) =>
          u.is_docspec_user ||
          u.is_docspec_admin ||
          u.permissions?.['docspec'] ||
          u.permissions?.['is_docspec_user'] ||
          u.permissions?.['is_docspec_admin'],
      ).length,
      kspec: list.filter(
        (u) =>
          u.is_k_spec_admin ||
          u.permissions?.['kspec'] ||
          u.permissions?.['is_k_spec_admin'],
      ).length,
      is_product_admin: list.filter(
        (u) => u.is_product_admin || u.permissions?.['is_product_admin'],
      ).length,
    };
  });

  readonly filteredUsers = computed(() => {
    let list = this.users();
    const selectedProducts = this.selectedProducts();
    const selectedRoles = this.selectedRoles();
    const selectedAccess = this.selectedAccess();

    // 1. Filter by Products (Multi-select)
    const visibleOptions = this.visibleProductOptions();
    if (selectedProducts.length > 0 && selectedProducts.length < visibleOptions.length) {
      list = list.filter((u) => {
        return selectedProducts.some((p) => {
          if (p === 'kplatform') {
            return (
              u.is_k_agent_user ||
              u.is_k_agent_admin ||
              u.is_k_agent_simple ||
              u.permissions?.['kplatform'] ||
              u.permissions?.['is_k_agent_user'] ||
              u.permissions?.['is_k_agent_admin'] ||
              u.permissions?.['is_k_agent_simple']
            );
          }
          if (p === 'kaf') {
            return (
              u.is_kaf_user ||
              u.is_kaf_admin ||
              u.is_kaf_dev ||
              u.permissions?.['kaf'] ||
              u.permissions?.['is_kaf_user'] ||
              u.permissions?.['is_kaf_admin'] ||
              u.permissions?.['is_kaf_dev']
            );
          }
          if (p === 'docspec') {
            return (
              u.is_docspec_user ||
              u.is_docspec_admin ||
              u.permissions?.['docspec'] ||
              u.permissions?.['is_docspec_user'] ||
              u.permissions?.['is_docspec_admin']
            );
          }
          if (p === 'kspec') {
            return (
              u.is_k_spec_admin ||
              u.permissions?.['kspec'] ||
              u.permissions?.['is_k_spec_admin']
            );
          }
          if (p === 'is_product_admin') {
            return u.is_product_admin || u.permissions?.['is_product_admin'];
          }
          return false;
        });
      });
    }

    // 2. Filter by Roles (Multi-select)
    const visibleRoles = this.visibleRoleOptions();
    if (selectedRoles.length > 0 && selectedRoles.length < visibleRoles.length) {
      list = list.filter((u) => {
        const badges = this.getUserBadges(u);
        return selectedRoles.some((role) => {
          if (role === 'admin') {
            return badges.some((b) => b.tier === 'admin' || b.tier === 'global');
          }
          if (role === 'dev') {
            return badges.some((b) => b.tier === 'dev');
          }
          if (role === 'user') {
            return badges.some((b) => b.tier === 'user');
          }
          if (role === 'simple') {
            return badges.some((b) => b.tier === 'simple');
          }
          return false;
        });
      });
    }

    // 3. Filter by Access (Multi-select)
    if (selectedAccess.length === 1) {
      if (selectedAccess.includes('with_access') || selectedAccess.includes('has_access')) {
        list = list.filter((u) => this.getProductsCount(u) > 0);
      } else if (selectedAccess.includes('no_access')) {
        list = list.filter((u) => this.getProductsCount(u) === 0);
      }
    }

    // 4. Search query
    const q = this.searchQuery().trim().toLowerCase();
    if (q) {
      list = list.filter(
        (u) =>
          u.username.toLowerCase().includes(q) ||
          this.getDisplayName(u.username).toLowerCase().includes(q),
      );
    }

    // 5. Sort by column
    if (this.sortColumn() === 'username') {
      const order = this.sortOrder() === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => order * (a.username || '').localeCompare(b.username || ''));
    }

    return list;
  });

  // Client-side pagination slicing over filtered users
  readonly paginatedUsers = computed(() => {
    const list = this.filteredUsers();
    if (this.searchQuery().trim()) {
      const start = (this.currentPage() - 1) * this.pageSize();
      return list.slice(start, start + this.pageSize());
    }
    if (list.length <= this.pageSize()) {
      return list;
    }
    const start = (this.currentPage() - 1) * this.pageSize();
    return list.slice(start, start + this.pageSize());
  });

  readonly calculatedTotalPages = computed(() => {
    if (this.searchQuery().trim()) {
      return Math.ceil(this.filteredUsers().length / this.pageSize()) || 1;
    }
    return Math.max(this.totalPages(), Math.ceil(this.totalCount() / this.pageSize()) || 1);
  });

  readonly pageStartItem = computed(() => {
    if (this.filteredUsers().length === 0) return 0;
    return (this.currentPage() - 1) * this.pageSize() + 1;
  });

  readonly pageEndItem = computed(() => {
    return Math.min(this.currentPage() * this.pageSize(), this.filteredUsers().length);
  });

  setPageSize(size: any): void {
    this.pageSize.set(Number(size));
    this.currentPage.set(1);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    const target = event.target as HTMLElement;
    if (!target.closest('.pa-dropdown-container')) {
      this.openDropdown.set(null);
    }
  }

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    if (this.isAccessModalOpen()) {
      this.closeAccessModal();
    } else if (this.isDrawerOpen()) {
      this.closeUserDrawer();
    } else if (this.openDropdown()) {
      this.closeDropdown();
    }
  }

  toggleDropdown(type: 'product' | 'role' | 'access', event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.openDropdown.update((current) => (current === type ? null : type));
  }

  closeDropdown(): void {
    this.openDropdown.set(null);
  }

  // Toggle single product option
  toggleProductSelection(productId: string, event?: Event): void {
    if (event) event.stopPropagation();
    const current = this.selectedProducts();

    if (productId === 'all') {
      this.selectedProducts.set([]);
      this.selectedProductFilter.set('all');
    } else if (current.includes(productId)) {
      const next = current.filter((id) => id !== productId);
      this.selectedProducts.set(next);
      this.selectedProductFilter.set(next.length === 1 ? next[0] : next.length === 0 ? 'all' : 'multi');
    } else {
      const next = [...current, productId];
      this.selectedProducts.set(next);
      this.selectedProductFilter.set(next.length === 1 ? next[0] : 'multi');
    }

    this.cleanUpSelectedRolesForActiveProducts();
    this.currentPage.set(1);
    this.loadUsers(1);
  }

  isProductSelected(productId: string): boolean {
    return this.selectedProducts().includes(productId);
  }

  getProductButtonLabel(): string {
    const selected = this.selectedProducts();
    const visible = this.visibleProductOptions();
    if (selected.length === 0) {
      return 'Products';
    }
    if (selected.length === 1) {
      const match = visible.find((p) => p.id === selected[0]);
      return match ? match.label : '1 Product';
    }
    return `${selected.length} Products`;
  }

  // Toggle single role option
  toggleRoleSelection(roleKey: string, event?: Event): void {
    if (event) event.stopPropagation();
    const current = this.selectedRoles();
    if (current.includes(roleKey)) {
      this.selectedRoles.set(current.filter((k) => k !== roleKey));
    } else {
      this.selectedRoles.set([...current, roleKey]);
    }
    const updated = this.selectedRoles();
    this.selectedRoleFilter.set(updated.length === 1 ? updated[0] : (updated.length === 0 ? 'all' : 'multi'));
    this.currentPage.set(1);
    this.loadUsers(1);
  }

  isRoleSelected(roleKey: string): boolean {
    return this.selectedRoles().includes(roleKey);
  }

  getRoleButtonLabel(): string {
    const selected = this.selectedRoles();
    if (selected.length === 0) {
      return 'Roles';
    }
    if (selected.length === 1) {
      for (const suite of this.productSuites()) {
        const found = suite.roles.find((r) => r.key === selected[0]);
        if (found) {
          return `${suite.name} ${found.label}`;
        }
      }
      return '1 Role';
    }
    return `${selected.length} Roles`;
  }

  private cleanUpSelectedRolesForActiveProducts(): void {
    const validRoleKeys = new Set<string>();
    for (const group of this.visibleRoleGroups()) {
      for (const r of group.roles) {
        if (r.key) validRoleKeys.add(r.key);
      }
    }
    const current = this.selectedRoles();
    const filtered = current.filter((k) => validRoleKeys.has(k));
    if (filtered.length !== current.length) {
      this.selectedRoles.set(filtered);
      this.selectedRoleFilter.set(
        filtered.length === 1 ? filtered[0] : (filtered.length === 0 ? 'all' : 'multi'),
      );
    }
  }

  // Toggle single access option
  toggleAccessSelection(accessId: string, event?: Event): void {
    if (event) event.stopPropagation();
    const current = this.selectedAccess();
    if (accessId === 'all') {
      if (current.length === this.accessOptions.length) {
        this.selectedAccess.set([]);
      } else {
        this.selectedAccess.set(this.accessOptions.map((a) => a.id));
      }
    } else {
      if (current.includes(accessId)) {
        this.selectedAccess.set(current.filter((id) => id !== accessId));
      } else {
        this.selectedAccess.set([...current, accessId]);
      }
    }
    const updated = this.selectedAccess();
    this.selectedAccessFilter.set(updated.length === 1 ? updated[0] : (updated.length === 0 ? 'all' : 'multi'));
    this.currentPage.set(1);
  }

  isAccessSelected(accessId: string): boolean {
    if (accessId === 'all') {
      return this.selectedAccess().length === 0 || this.selectedAccess().length === this.accessOptions.length;
    }
    return this.selectedAccess().includes(accessId);
  }

  getAccessButtonLabel(): string {
    const selected = this.selectedAccess();
    if (selected.length === 0 || selected.length === this.accessOptions.length) {
      return 'All Access';
    }
    if (selected.length === 1) {
      const match = this.accessOptions.find((a) => a.id === selected[0]);
      return match ? match.label : '1 Access';
    }
    return `${selected.length} Selected`;
  }

  setProductFilter(filterId: string): void {
    if (filterId === 'all') {
      this.selectedProducts.set([]);
      this.selectedProductFilter.set('all');
    } else {
      this.selectedProducts.set([filterId]);
      this.selectedProductFilter.set(filterId);
    }
    this.cleanUpSelectedRolesForActiveProducts();
    this.currentPage.set(1);
    this.loadUsers(1);
  }

  setRoleFilter(role: string): void {
    if (role === 'all') {
      this.selectedRoles.set([]);
      this.selectedRoleFilter.set('all');
    } else {
      this.selectedRoles.set([role]);
      this.selectedRoleFilter.set(role);
    }
    this.currentPage.set(1);
  }

  setAccessFilter(access: string): void {
    if (access === 'all') {
      this.selectedAccess.set([]);
      this.selectedAccessFilter.set('all');
    } else {
      this.selectedAccess.set([access]);
      this.selectedAccessFilter.set(access);
    }
    this.currentPage.set(1);
  }

  getTabCount(tabId: string): number {
    const counts = this.productFilterCounts();
    switch (tabId) {
      case 'kplatform':
        return counts.kplatform ?? this.tabCountsCache()[tabId] ?? 0;
      case 'kaf':
        return counts.kaf ?? this.tabCountsCache()[tabId] ?? 0;
      case 'docspec':
        return counts.docspec ?? this.tabCountsCache()[tabId] ?? 0;
      case 'kspec':
        return counts.kspec ?? this.tabCountsCache()[tabId] ?? 0;
      case 'is_product_admin':
        return counts.is_product_admin ?? this.tabCountsCache()[tabId] ?? 0;
      default:
        return counts.all ?? this.tabCountsCache()[tabId] ?? 0;
    }
  }

  getActiveFilterLabel(): string {
    const found = this.filterTabs.find((t) => t.id === this.selectedProductFilter());
    return found ? found.label : 'All';
  }

  getDisplayName(username: string): string {
    if (!username) return 'User';
    const emailPrefix = username.includes('@') ? username.split('@')[0] : username;
    const parts = emailPrefix.split(/[._-]/).filter(Boolean);
    if (parts.length === 0) return username;
    return parts.map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase()).join(' ');
  }

  getUserInitials(username: string): string {
    if (!username) return '?';
    const emailPrefix = username.includes('@') ? username.split('@')[0] : username;
    const parts = emailPrefix.split(/[._-]/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
    }
    return emailPrefix.slice(0, 2).toUpperCase();
  }

  getUserInitial(username: string): string {
    return this.getUserInitials(username);
  }

  getProductsCount(user: ProductUserRow): number {
    return this.calculateEnabledCount(user);
  }

  getProductsCountLabel(user: ProductUserRow): string {
    const count = this.getProductsCount(user);
    if (count === 1) return '1 Product';
    return `${count} Products`;
  }

  getVisibleBadges(user: ProductUserRow): UserProductRoleBadge[] {
    return this.getUserBadges(user).slice(0, 3);
  }

  getOverflowBadgesCount(user: ProductUserRow): number {
    return Math.max(0, this.getUserBadges(user).length - 3);
  }

  openAssignModal(): void {
    if (this.users().length > 0) {
      this.openUserDrawer(this.users()[0]);
    }
  }

  /**
   * Generates all active product role badges for a user row in the table
   */
  getUserBadges(user: ProductUserRow): UserProductRoleBadge[] {
    const badges: UserProductRoleBadge[] = [];

    if (user.is_product_admin) {
      badges.push({
        product: 'Product',
        role: 'Admin',
        tier: 'global',
      });
    }

    for (const suite of this.productSuites()) {
      // Find all active roles for this suite (supporting multiple access per user)
      const activeRoles = suite.roles.filter((r) => !!user[r.key]);
      if (activeRoles.length > 0) {
        for (const role of activeRoles) {
          badges.push({
            productId: suite.id,
            product: suite.name,
            role: role.label,
            tier: role.tier,
          });
        }
      } else if (
        (suite.id === 'kplatform' && user.kplatform) ||
        (suite.id === 'kaf' && user.kaf) ||
        (suite.id === 'docspec' && user.docspec) ||
        (suite.id === 'kspec' && user.kspec)
      ) {
        badges.push({
          productId: suite.id,
          product: suite.name,
          role: 'User',
          tier: 'user',
        });
      }
    }

    if (user['mainframe'] || user.permissions?.['mainframe']) {
      badges.push({
        productId: 'mainframe',
        product: 'Mainframe',
        role: 'User',
        tier: 'user',
      });
    }
    if (user['oracle_forms'] || user.permissions?.['oracle_forms']) {
      badges.push({
        productId: 'oracle_forms',
        product: 'Oracle Forms',
        role: 'Admin',
        tier: 'admin',
      });
    }
    if (user['performance_testing'] || user.permissions?.['performance_testing']) {
      badges.push({
        productId: 'performance_testing',
        product: 'Performance Testing',
        role: 'Developer',
        tier: 'dev',
      });
    }

    return badges;
  }

  /**
   * Preserved for backward compatibility with existing tests
   */
  getRoleBadge(user: ProductUserRow): { text: string; type: 'admin' | 'dev' | 'user' } | null {
    const filter = this.selectedProductFilter();
    if (filter === 'kplatform') {
      if (user.is_k_agent_admin) return { text: 'K-Agent Admin', type: 'admin' };
      if (user.is_k_agent_user) return { text: 'K-Agent User', type: 'user' };
      if (user.is_k_agent_simple) return { text: 'K-Agent Simple', type: 'user' };
      return { text: 'Has Access', type: 'user' };
    }
    if (filter === 'kaf') {
      if (user.is_kaf_admin) return { text: 'KAF Admin', type: 'admin' };
      if (user.is_kaf_dev) return { text: 'KAF Dev', type: 'dev' };
      if (user.is_kaf_user) return { text: 'KAF User', type: 'user' };
      return { text: 'Has Access', type: 'user' };
    }
    if (filter === 'docspec') {
      if (user.is_docspec_admin) return { text: 'DocSpec Admin', type: 'admin' };
      if (user.is_docspec_user) return { text: 'DocSpec User', type: 'user' };
      return { text: 'Has Access', type: 'user' };
    }
    if (filter === 'kspec') {
      if (user.is_k_spec_admin) return { text: 'K-Spec Admin', type: 'admin' };
      return { text: 'Has Access', type: 'user' };
    }
    if (filter === 'is_product_admin' || user.is_product_admin) {
      return { text: 'Product Admin', type: 'admin' };
    }
    return null;
  }

  readonly pageNumbers = computed<(number | string)[]>(() => {
    const total = this.calculatedTotalPages();
    const current = this.currentPage();

    if (total <= 7) {
      return Array.from({ length: total }, (_, index) => index + 1);
    }

    if (current <= 4) {
      return [1, 2, 3, 4, 5, '...', total];
    }

    if (current >= total - 3) {
      return [1, '...', total - 4, total - 3, total - 2, total - 1, total];
    }

    return [1, '...', current - 1, current, current + 1, '...', total];
  });

  ngOnInit(): void {
    this.registerSidenavHost();
    this.initSearchPipeline();
    this.loadCurrentUserAdminPermissions();
  }

  getCurrentUsername(): string {
    const userInfo = this.tokenService?.getUserInfo();
    if (userInfo?.email) return userInfo.email;
    if (userInfo?.username) return userInfo.username;

    // Decode from sessionStorage userInfo
    try {
      const rawUserInfo =
        this.storageService.getItem('userInfo') ||
        sessionStorage.getItem('userInfo');
      if (rawUserInfo) {
        let parsed: any;
        try {
          parsed = JSON.parse(atob(rawUserInfo));
        } catch {
          parsed = JSON.parse(rawUserInfo);
        }
        const email =
          parsed?.info?.email ||
          parsed?.email ||
          parsed?.info?.username ||
          parsed?.username;
        if (email) return email;
      }
    } catch {}

    // Decode from JWT token payload
    try {
      const token = this.tokenService?.getToken() || sessionStorage.getItem('jwt_token');
      if (token && token.includes('.')) {
        const payloadBase64 = token.split('.')[1];
        const tokenData = JSON.parse(atob(payloadBase64));
        const tokenEmail =
          tokenData.email ||
          tokenData.preferred_username ||
          tokenData.unique_name ||
          tokenData.upn ||
          tokenData.username ||
          tokenData.sub;
        if (tokenEmail && typeof tokenEmail === 'string' && tokenEmail.includes('@')) {
          return tokenEmail;
        }
      }
    } catch {}

    const sessionEmail =
      this.storageService.getItem('email') ||
      this.storageService.getItem('user_email') ||
      this.storageService.getItem('username') ||
      sessionStorage.getItem('email') ||
      sessionStorage.getItem('user_email') ||
      sessionStorage.getItem('username') ||
      sessionStorage.getItem('preferred_username');
    if (sessionEmail) return sessionEmail;

    return '';
  }

  loadCurrentUserAdminPermissions(): void {
    const username = this.getCurrentUsername();
    if (!username) {
      this.loadUsers(this.currentPage());
      return;
    }

    this.isLoadingUserPermissions.set(true);
    this.productAdminApi
      .getProductUser({ bot_type: 'kumaran', username })
      .pipe(
        catchError((err) => {
          console.error('[ProductAdmin] Failed to load current user admin access:', err);
          this.loadUsers(this.currentPage());
          return of(null);
        }),
      )
      .subscribe((res: any) => {
        this.isLoadingUserPermissions.set(false);
        if (res) {
          const raw = res?.data ?? res ?? {};
          this.applyCurrentUserAdminPermissions(raw);
        }
        if (this.selectedProductFilter() === 'all' && !this.sortColumn()) {
          this.loadUsers(this.currentPage());
        }
        this.cdr.markForCheck();
      });
  }

  applyCurrentUserAdminPermissions(raw: any): void {
    const isPermTrue = (key: string) =>
      !!(raw && (raw[key] === true || raw[key] === 'true' || raw.permissions?.[key] === true));

    // STRICTLY determined by individual product admin flags in get_product_user response.
    // Even if a user has is_product_admin, they cannot give access to a specific product unless they have that product's specific admin access.
    const isGlobalAdmin = isPermTrue('is_product_admin');
    const isKAgentAdmin = isPermTrue('is_k_agent_admin');
    const isKafAdmin = isPermTrue('is_kaf_admin');
    const isDocspecAdmin = isPermTrue('is_docspec_admin');
    const isKSpecAdmin = isPermTrue('is_k_spec_admin');

    const allowed: string[] = [];
    if (isKAgentAdmin) allowed.push('kplatform');
    if (isKafAdmin) allowed.push('kaf');
    if (isDocspecAdmin) allowed.push('docspec');
    if (isKSpecAdmin) allowed.push('kspec');

    this.allowedProductIds.set(allowed);
    this.canGrantProductAdmin.set(isGlobalAdmin);

    // Keep selectedProducts in sync with visible options
    const currentSelected = this.selectedProducts();
    const validSelected = currentSelected.filter((id) =>
      allowed.includes(id) || (id === 'is_product_admin' && isGlobalAdmin)
    );
    if (validSelected.length !== currentSelected.length) {
      this.selectedProducts.set(validSelected);
      this.selectedProductFilter.set(
        validSelected.length === 1 ? validSelected[0] : validSelected.length === 0 ? 'all' : 'multi',
      );
    }
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.searchSubscription?.unsubscribe();
    this.sidenavLayout.unregisterHost();
  }

  private registerSidenavHost(): void {
    const host: SidenavLayoutHost = {
      generatingStates: {},
      getStreaming: () => this.productSidenavStreaming,
      handleStreamingToggle: (next) => {
        this.productSidenavStreaming = next;
      },
      emitActiveChatOnInit: false,
      staticMode: false,
      onNewChat: () => {
        this.storageService.removeConversationId();
        this.storageService.removeLastActiveConversationId();
        this.router.navigate(['/chatbot']);
      },
      onChatSelected: (chat: any) => {
        const cid = chat?.conversationID;
        if (cid) {
          this.storageService.setConversationId(cid);
          this.storageService.setLastActiveConversationId(cid);
        }
        this.router.navigate(['/chatbot']);
      },
      onSearchModalToggle: () => {},
      onContextMenuToggled: () => {},
      onInvalidConversation: () => {},
    };
    this.sidenavLayout.registerHost(host);
  }

  private initSearchPipeline(): void {
    this.searchSubscription = this.searchSubject
      .pipe(
        debounceTime(400),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmed = query.trim();
          if (!trimmed) {
            return this.fetchUsers(this.currentPage());
          }
          this.isLoading.set(true);
          return this.productAdminApi.searchProductUsers(trimmed).pipe(
            catchError((err) => {
              console.error('[ProductAdmin] Search error:', err);
              this.toastService.show('Failed to search product users', 'error');
              return of({ data: [], total_count: 0, total_pages: 1 });
            }),
          );
        }),
      )
      .subscribe((res: any) => {
        this.handleUserResponse(res, 1);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      });
  }

  onSearchInput(event: Event): void {
    const target = event.target as HTMLInputElement;
    const value = target.value;
    this.searchQuery.set(value);
    this.searchSubject.next(value);
  }

  loadUsers(page: number = 1): void {
    this.isLoading.set(true);
    const query = this.searchQuery().trim();
    if (query) {
      this.productAdminApi.searchProductUsers(query).pipe(
        catchError((err) => {
          console.error('[ProductAdmin] searchProductUsers error:', err);
          this.toastService.show('Failed to search product users', 'error');
          return of({ data: [], total_count: 0, total_pages: 1 });
        }),
      ).subscribe((res: any) => {
        this.handleUserResponse(res, page);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      });
      return;
    }

    // Always call getProductDetails API with current active product roles and sort_by/order query params
    this.fetchUsers(page).subscribe((res: any) => {
      this.handleUserResponse(res, page);
      this.isLoading.set(false);
      this.cdr.markForCheck();
    });
  }

  getAllProductRoles(): string[] {
    const suites = this.productSuites();
    const roles: string[] = [];
    for (const suite of suites) {
      for (const role of suite.roles) {
        if (role.key) {
          roles.push(role.key);
        }
      }
    }
    if (this.canGrantProductAdmin() || this.tokenService?.isProductAdmin()) {
      roles.push('is_product_admin');
    }
    return Array.from(new Set(roles));
  }

  getRolesForActiveFilter(): string[] {
    const selectedProds = this.selectedProducts();
    const selectedRoles = this.selectedRoles();
    const suites = this.productSuites();
    const allowed = this.allowedProductIds();

    // 1. If user checked specific role(s) in the categorized Roles dropdown:
    if (selectedRoles.length > 0) {
      return Array.from(new Set(selectedRoles));
    }

    // 2. Otherwise (no specific roles checked in Roles dropdown):
    // Determine the active suites (selected products, or all allowed products)
    let targetSuites: ProductSuite[] = [];
    if (selectedProds.length > 0) {
      targetSuites = suites.filter((s) => selectedProds.includes(s.id));
    } else if (allowed.length > 0) {
      targetSuites = suites.filter((s) => allowed.includes(s.id));
    } else {
      targetSuites = suites;
    }

    const roles: string[] = [];
    for (const suite of targetSuites) {
      for (const role of suite.roles) {
        if (role.key) {
          roles.push(role.key);
        }
      }
    }

    if (roles.length > 0) {
      return Array.from(new Set(roles));
    }

    const fallback = this.getCurrentUserAdminRoles();
    if (fallback.length > 0) return fallback;
    return this.getAllProductRoles();
  }

  getCurrentUserAdminRoles(): string[] {
    const suites = this.productSuites();
    const allowed = this.allowedProductIds();
    const rolesSet = new Set<string>();

    // 1. If user has specific product admin permissions in allowedProductIds,
    // collect all roles defined for those products from productSuites (or config)
    if (allowed.length > 0) {
      for (const suite of suites) {
        if (allowed.includes(suite.id)) {
          for (const role of suite.roles) {
            if (role.key) {
              rolesSet.add(role.key);
            }
          }
        }
      }
    }

    // 2. Fallback: if allowedProductIds is not yet populated, inspect tokenService.getProductRoles()
    if (rolesSet.size === 0 && this.tokenService) {
      const tokenRoles = (this.tokenService.getProductRoles() || []).map((r) =>
        String(r).toLowerCase().trim(),
      );

      for (const suite of suites) {
        const hasAdminForSuite = tokenRoles.some((r) => {
          if (suite.id === 'kplatform' && (r.includes('k_agent') || r.includes('kplatform'))) return true;
          if (suite.id === 'kspec' && (r.includes('kspec') || r.includes('k_spec'))) return true;
          if (suite.id === 'kaf' && r.includes('kaf')) return true;
          if (suite.id === 'docspec' && r.includes('docspec')) return true;
          return false;
        });

        if (hasAdminForSuite) {
          for (const role of suite.roles) {
            if (role.key) {
              rolesSet.add(role.key);
            }
          }
        }
      }

      // If user has global product admin flag with no specific suites, include all roles from all suites
      if (rolesSet.size === 0 && (this.canGrantProductAdmin() || this.tokenService.isProductAdmin())) {
        for (const suite of suites) {
          for (const role of suite.roles) {
            if (role.key) {
              rolesSet.add(role.key);
            }
          }
        }
      }
    }

    return Array.from(rolesSet);
  }

  private fetchUsers(page: number) {
    const roles = this.getRolesForActiveFilter();
    return this.productAdminApi
      .getProductDetails(page, this.pageSize(), roles, this.sortColumn(), this.sortOrder())
      .pipe(
        catchError((err) => {
          console.error('[ProductAdmin] getProductDetails failed:', err);
          this.toastService.show('Failed to load product users', 'error');
          return of({
            data: [],
            total_count: 0,
            total_pages: 1,
            page,
            limit: this.pageSize(),
          });
        }),
      );
  }

  private handleUserResponse(res: any, requestedPage: number): void {
    let rows: ProductUserRow[] = [];
    if (Array.isArray(res)) {
      rows = res;
    } else if (res && typeof res === 'object') {
      rows = res.data ?? res.users ?? res.results ?? [];
    }

    // Normalizing each row
    const normalized = rows.map((item) => {
      const enabledCount = item.enabled_count ?? this.calculateEnabledCount(item);
      const totalCount = item.total_count ?? this.totalProductsCount;
      return {
        ...item,
        enabled_count: enabledCount,
        total_count: totalCount,
      };
    });

    this.users.set(normalized);
    this.currentPage.set(res?.page ?? requestedPage);
    const count = res?.total_count ?? (Array.isArray(res) ? res.length : rows.length);
    this.totalCount.set(count);
    const calculatedPages = Math.ceil(this.totalCount() / this.pageSize()) || 1;
    this.totalPages.set(res?.total_pages ?? calculatedPages);

    if (this.selectedProductFilter() === 'all') {
      this.tabCountsCache.set({
        all: count,
        kplatform: normalized.filter(
          (u) =>
            u.is_k_agent_user ||
            u.is_k_agent_admin ||
            u.is_k_agent_simple ||
            u.permissions?.['kplatform'] ||
            u.permissions?.['is_k_agent_user'] ||
            u.permissions?.['is_k_agent_admin'] ||
            u.permissions?.['is_k_agent_simple'],
        ).length,
        kaf: normalized.filter(
          (u) =>
            u.is_kaf_user ||
            u.is_kaf_admin ||
            u.is_kaf_dev ||
            u.permissions?.['kaf'] ||
            u.permissions?.['is_kaf_user'] ||
            u.permissions?.['is_kaf_admin'] ||
            u.permissions?.['is_kaf_dev'],
        ).length,
        docspec: normalized.filter(
          (u) =>
            u.is_docspec_user ||
            u.is_docspec_admin ||
            u.permissions?.['docspec'] ||
            u.permissions?.['is_docspec_user'] ||
            u.permissions?.['is_docspec_admin'],
        ).length,
        kspec: normalized.filter(
          (u) =>
            u.is_k_spec_admin ||
            u.permissions?.['kspec'] ||
            u.permissions?.['is_k_spec_admin'],
        ).length,
        is_product_admin: normalized.filter(
          (u) => u.is_product_admin || u.permissions?.['is_product_admin'],
        ).length,
      });
    } else {
      this.tabCountsCache.update((prev) => ({
        ...prev,
        [this.selectedProductFilter()]: count,
      }));
    }
  }

  private calculateEnabledCount(row: any): number {
    let count = 0;
    if (row.is_product_admin) count++;
    for (const suite of this.productSuites()) {
      const hasSuiteRole = suite.roles.some((r) => !!row[r.key]) || !!row[suite.id];
      if (hasSuiteRole) {
        count++;
      }
    }
    if (row['mainframe'] || row.permissions?.['mainframe']) count++;
    if (row['oracle_forms'] || row.permissions?.['oracle_forms']) count++;
    if (row['performance_testing'] || row.permissions?.['performance_testing']) count++;
    return count;
  }

  toggleSort(): void {
    if (!this.sortColumn()) {
      this.sortColumn.set('username');
      this.sortOrder.set('asc');
    } else if (this.sortOrder() === 'asc') {
      this.sortOrder.set('desc');
    } else {
      this.sortColumn.set(null);
      this.sortOrder.set('asc');
    }
    this.loadUsers(1);
  }

  goToPage(page: number | string): void {
    const total = this.calculatedTotalPages();
    if (typeof page === 'number' && page >= 1 && page <= total && page !== this.currentPage()) {
      this.currentPage.set(page);
      this.loadUsers(page);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.calculatedTotalPages()) {
      this.goToPage(this.currentPage() + 1);
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.goToPage(this.currentPage() - 1);
    }
  }

  // Accordion & Draft Permission Helpers
  isProductExpanded(productId: string): boolean {
    return this.expandedProductIds().has(productId);
  }

  toggleProductAccordion(productId: string): void {
    this.expandedProductIds.update((set) => {
      const next = new Set(set);
      if (next.has(productId)) {
        next.delete(productId);
      } else {
        next.add(productId);
      }
      return next;
    });
  }

  isRoleDraftChecked(roleKey: string): boolean {
    return !!this.draftPermissions()[roleKey];
  }

  toggleRoleDraft(roleKey: string): void {
    this.draftPermissions.update((draft) => ({
      ...draft,
      [roleKey]: !draft[roleKey],
    }));
  }

  // Manage individual user permissions
  openUserDrawer(user: ProductUserRow): void {
    this.selectedUser.set(user);
    this.isDrawerOpen.set(true);

    // Initial state from row
    const initial: Record<string, boolean> = {};
    for (const suite of this.productSuites()) {
      for (const role of suite.roles) {
        initial[role.key] = !!(user as any)[role.key];
      }
    }
    initial['is_product_admin'] = !!user.is_product_admin;
    this.initialPermissions = { ...initial };
    this.draftPermissions.set({ ...initial });

    // Initial expanded state: Docspec expanded, or first visible group
    const initialExpanded = new Set<string>();
    const visible = this.visibleProductGroups();
    if (visible.length > 0) {
      initialExpanded.add(visible[0].suite.id);
    } else {
      initialExpanded.add('docspec');
    }
    this.expandedProductIds.set(initialExpanded);

    this.isProductAdmin.set(!!user.is_product_admin);
    this.productGroups.set(this.buildProductGroups(user));

    // Call API 3: /get_product_user
    this.productAdminApi
      .getProductUser({ bot_type: 'kumaran', username: user.username })
      .pipe(
        catchError((err) => {
          console.error('[ProductAdmin] getProductUser failed:', err);
          this.toastService.show('Failed to load user permissions', 'error');
          return of(null);
        }),
      )
      .subscribe((details: any) => {
        if (!details) {
          return;
        }
        const rawPerms = details?.data ?? details ?? {};
        this.isProductAdmin.set(!!rawPerms.is_product_admin);
        this.productGroups.set(this.buildProductGroups(rawPerms));

        // Update draft permissions with server truth
        const fresh: Record<string, boolean> = {};
        for (const suite of this.productSuites()) {
          for (const role of suite.roles) {
            fresh[role.key] = !!rawPerms[role.key];
          }
        }
        fresh['is_product_admin'] = !!rawPerms.is_product_admin;
        this.initialPermissions = { ...fresh };
        this.draftPermissions.set({ ...fresh });

        // Expand products with active access, or keep first visible
        const toExpand = new Set<string>();
        for (const g of this.visibleProductGroups()) {
          if (g.suite.roles.some((r) => !!fresh[r.key])) {
            toExpand.add(g.suite.id);
          }
        }
        if (toExpand.size === 0 && this.visibleProductGroups().length > 0) {
          toExpand.add(this.visibleProductGroups()[0].suite.id);
        }
        this.expandedProductIds.set(toExpand);

        this.cdr.markForCheck();
      });
  }

  saveUserPermissions(): void {
    const user = this.selectedUser();
    if (!user) return;

    const draft = this.draftPermissions();
    const initial = this.initialPermissions;

    // Determine changed permission flags
    const changedKeys = Object.keys(draft).filter((k) => !!draft[k] !== !!initial[k]);

    if (changedKeys.length === 0) {
      this.toastService.show('No changes to save', 'info');
      this.closeUserDrawer();
      return;
    }

    this.isUpdatingPermission.set(true);

    const updateObservables = changedKeys.map((key) =>
      this.productAdminApi.updateProductUser({
        bot_type: 'kumaran',
        username: user.username,
        column_name: key,
        column_value: draft[key],
      }).pipe(
        catchError((err) => {
          console.error(`[ProductAdmin] updateProductUser failed for ${key}:`, err);
          return of({ error: true, key });
        }),
      ),
    );

    forkJoin(updateObservables).subscribe((results: any[]) => {
      this.isUpdatingPermission.set(false);
      const hasErrors = results.some((r) => r?.error);

      if (hasErrors) {
        this.toastService.show('Some permissions failed to update. Please try again.', 'error');
      } else {
        this.toastService.show(`Access permissions updated for ${user.username}`, 'success');
      }

      // Update user in memory
      for (const key of changedKeys) {
        (user as any)[key] = draft[key];
      }
      if (draft['is_product_admin'] !== undefined) {
        user.is_product_admin = draft['is_product_admin'];
      }

      this.syncUserRow(user);
      this.closeUserDrawer();
      this.cdr.markForCheck();
    });
  }

  closeUserDrawer(): void {
    this.isDrawerOpen.set(false);
    this.selectedUser.set(null);
    this.draftPermissions.set({});
  }

  // Product Access Details Modal Popup
  openAccessModal(user: ProductUserRow): void {
    this.accessModalUser.set(user);
    this.isAccessModalOpen.set(true);

    this.productAdminApi
      .getProductUser({ bot_type: 'kumaran', username: user.username })
      .pipe(catchError(() => of(null)))
      .subscribe((details: any) => {
        if (!details) return;
        const raw = details?.data ?? details ?? {};
        this.accessModalUser.update((curr) => (curr ? { ...curr, ...raw } : curr));
        this.cdr.markForCheck();
      });
  }

  closeAccessModal(): void {
    this.isAccessModalOpen.set(false);
    this.accessModalUser.set(null);
  }

  getFullProductName(productId?: string): string {
    if (!productId) return '';
    if (productId === 'is_product_admin') return 'Global Product Admin';
    if (productId === 'kplatform') return 'K-Agent Platform';
    if (productId === 'kaf') return 'Kumaran Agent Flow (KAF)';
    if (productId === 'docspec') return 'DocSpec';
    if (productId === 'kspec') return 'K-Spec (SDD)';
    const suite = PRODUCT_SUITES.find((s) => s.id === productId);
    return suite ? suite.name : productId;
  }

  private buildProductGroups(raw: any): ProductGroupViewModel[] {
    return this.productSuites().map((suite) => {
      // Find active role key (priority: admin > dev > user > simple)
      const activeRole = suite.roles.find((r) => !!raw[r.key]);
      const isEnabled =
        !!activeRole ||
        (suite.id === 'kplatform' && !!raw.kplatform) ||
        (suite.id === 'kaf' && !!raw.kaf) ||
        (suite.id === 'docspec' && !!raw.docspec) ||
        (suite.id === 'kspec' && !!raw.kspec);

      const effectiveRole = activeRole || (isEnabled ? suite.roles.find((r) => r.tier === 'user') || suite.roles[0] : null);

      return {
        suite,
        isEnabled,
        activeRoleKey: effectiveRole ? effectiveRole.key : null,
        activeRoleTier: effectiveRole ? effectiveRole.tier : 'none',
        activeRoleLabel: effectiveRole ? effectiveRole.label : 'No Access',
      };
    });
  }

  /**
   * Toggle Global System Product Admin Privilege
   */
  toggleGlobalAdmin(): void {
    const user = this.selectedUser();
    if (!user) return;

    if (!this.canGrantProductAdmin()) {
      this.toastService.show('You do not have permission to grant Global Product Admin access', 'error');
      return;
    }

    const newValue = !this.isProductAdmin();
    this.isProductAdmin.set(newValue);
    this.isUpdatingPermission.set(true);

    this.productAdminApi
      .updateProductUser({
        bot_type: 'kumaran',
        username: user.username,
        column_name: 'is_product_admin',
        column_value: newValue,
      })
      .pipe(
        catchError((err) => {
          console.error('[ProductAdmin] updateProductUser error:', err);
          this.toastService.show('Failed to update admin access', 'error');
          this.isProductAdmin.set(!newValue);
          this.isUpdatingPermission.set(false);
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this.isUpdatingPermission.set(false);
        this.toastService.show(`Admin access updated for ${user.username}`, 'success');

        user.is_product_admin = newValue;
        this.syncUserRow(user);
        this.cdr.markForCheck();
      });
  }

  /**
   * Toggle entire product suite access On/Off
   */
  toggleProductAccess(group: ProductGroupViewModel): void {
    const user = this.selectedUser();
    if (!user || !group?.suite) return;

    if (!this.allowedProductIds().includes(group.suite.id)) {
      this.toastService.show(`You do not have permission to grant access for ${group.suite.name}`, 'error');
      return;
    }

    const shouldEnable = !group.isEnabled;
    this.isUpdatingPermission.set(true);

    // When enabling, default to 'user' tier role (e.g. is_k_agent_user, is_kaf_user)
    const targetRole = group.suite.roles.find((r) => r.tier === 'user') || group.suite.roles[0];
    const targetColumn = shouldEnable ? targetRole.key : (group.activeRoleKey || targetRole.key);

    this.productAdminApi
      .updateProductUser({
        bot_type: 'kumaran',
        username: user.username,
        column_name: targetColumn,
        column_value: shouldEnable,
      })
      .pipe(
        catchError((err) => {
          console.error('[ProductAdmin] toggleProductAccess error:', err);
          this.toastService.show(`Failed to update ${group.suite.name} access`, 'error');
          this.isUpdatingPermission.set(false);
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this.isUpdatingPermission.set(false);
        this.toastService.show(
          `${group.suite.name} access ${shouldEnable ? 'granted' : 'revoked'} for ${user.username}`,
          'success',
        );

        // Update local group model
        this.productGroups.update((groups) =>
          groups.map((g) => {
            if (g.suite.id !== group.suite.id) return g;
            return {
              ...g,
              isEnabled: shouldEnable,
              activeRoleKey: shouldEnable ? targetRole.key : null,
              activeRoleTier: shouldEnable ? targetRole.tier : 'none',
              activeRoleLabel: shouldEnable ? targetRole.label : 'No Access',
            };
          }),
        );

        // Update user row fields
        group.suite.roles.forEach((r) => {
          user[r.key] = shouldEnable ? r.key === targetRole.key : false;
        });

        this.syncUserRow(user);
        this.cdr.markForCheck();
      });
  }

  /**
   * Select a specific role within a product (e.g., promote to Admin or switch to Simple)
   */
  selectProductRole(group: ProductGroupViewModel, role: ProductRoleOption): void {
    const user = this.selectedUser();
    if (!user || group.activeRoleKey === role.key) return;

    if (!this.allowedProductIds().includes(group.suite.id)) {
      this.toastService.show(`You do not have permission to modify roles for ${group.suite.name}`, 'error');
      return;
    }

    this.isUpdatingPermission.set(true);
    const prevRoleKey = group.activeRoleKey;

    // Activate selected role
    this.productAdminApi
      .updateProductUser({
        bot_type: 'kumaran',
        username: user.username,
        column_name: role.key,
        column_value: true,
      })
      .pipe(
        catchError((err) => {
          console.error('[ProductAdmin] selectProductRole error:', err);
          this.toastService.show(`Failed to set role to ${role.label}`, 'error');
          this.isUpdatingPermission.set(false);
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((res) => {
        if (!res) return;

        // If another role was previously set in this suite, deactivate it
        if (prevRoleKey && prevRoleKey !== role.key) {
          this.productAdminApi
            .updateProductUser({
              bot_type: 'kumaran',
              username: user.username,
              column_name: prevRoleKey,
              column_value: false,
            })
            .subscribe({
              error: (e) => console.warn('[ProductAdmin] Deactivating previous role:', e),
            });
          user[prevRoleKey] = false;
        }

        this.isUpdatingPermission.set(false);
        this.toastService.show(`${group.suite.name} role updated to ${role.label}`, 'success');

        // Update local group model
        this.productGroups.update((groups) =>
          groups.map((g) => {
            if (g.suite.id !== group.suite.id) return g;
            return {
              ...g,
              isEnabled: true,
              activeRoleKey: role.key,
              activeRoleTier: role.tier,
              activeRoleLabel: role.label,
            };
          }),
        );

        // Update user row fields
        group.suite.roles.forEach((r) => {
          user[r.key] = r.key === role.key;
        });

        this.syncUserRow(user);
        this.cdr.markForCheck();
      });
  }

  private syncUserRow(user: ProductUserRow): void {
    const enabledCount = this.calculateEnabledCount(user);
    user.enabled_count = enabledCount;

    this.users.update((current) =>
      current.map((u) => (u.username === user.username ? { ...u, ...user, enabled_count: enabledCount } : u)),
    );
  }

  /**
   * Backward-compatible togglePermission for legacy tests
   */
  togglePermission(item: ProductPermissionItem): void {
    const user = this.selectedUser();
    if (!user) return;

    const newValue = !item.enabled;
    item.enabled = newValue;
    this.isUpdatingPermission.set(true);

    let columnName = item.key;
    if (item.key === 'kaf') columnName = 'is_kaf_user';
    else if (item.key === 'kplatform') columnName = 'is_k_agent_user';
    else if (item.key === 'docspec') columnName = 'is_docspec_user';
    else if (item.key === 'kspec') columnName = 'is_k_spec_admin';

    this.productAdminApi
      .updateProductUser({
        bot_type: 'kumaran',
        username: user.username,
        column_name: columnName,
        column_value: newValue,
      })
      .pipe(
        catchError((err) => {
          console.error('[ProductAdmin] updateProductUser error:', err);
          this.toastService.show('Failed to update permission', 'error');
          item.enabled = !newValue;
          this.isUpdatingPermission.set(false);
          this.cdr.markForCheck();
          return of(null);
        }),
      )
      .subscribe((res) => {
        if (!res) return;
        this.isUpdatingPermission.set(false);
        this.toastService.show(`Access updated for ${user.username}`, 'success');

        const enabledCount = this.userPermissions().filter((p) => p.enabled).length;
        user.enabled_count = enabledCount;
        if (!user.permissions) user.permissions = {};
        user.permissions[item.key] = newValue;

        this.users.update((current) =>
          current.map((u) =>
            u.username === user.username
              ? { ...u, enabled_count: enabledCount, permissions: { ...u.permissions, [item.key]: newValue } }
              : u,
          ),
        );
        this.cdr.markForCheck();
      });
  }
}

