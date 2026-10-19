import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '@core/services/toast.service';
import { HrAdminService } from '../../hr-portal-services/hr-admin.service';
import { HrPermissionService } from '../../hr-portal-services/hr-permission.service';
import {
  CreateHrUserDto,
  HrUserAccess,
  UpdateHrUserDto,
} from '../../models/hr-access.model';
import { UserFormModalComponent } from './components/user-form-modal/user-form-modal.component';

@Component({
  selector: 'app-hr-admin-control',
  standalone: true,
  imports: [CommonModule, FormsModule, UserFormModalComponent],
  templateUrl: './hr-admin-control.component.html',
  styleUrls: ['./hr-admin-control.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HrAdminControlComponent implements OnInit {
  private hrAdminService = inject(HrAdminService);
  private hrPermissionService = inject(HrPermissionService);
  private toastService = inject(ToastService);

  // State Signals
  readonly users = signal<HrUserAccess[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  // Filter Signals
  readonly searchTerm = signal<string>('');
  readonly roleFilter = signal<'all' | 'admin' | 'user'>('all');
  readonly permissionFilter = signal<'all' | 'resume' | 'visa'>('all');

  // Pagination Signals
  readonly currentPage = signal<number>(1);
  readonly pageSize = signal<number>(10);

  // Modal State Signals
  readonly isFormModalOpen = signal<boolean>(false);
  readonly isEditMode = signal<boolean>(true);
  readonly selectedUser = signal<HrUserAccess | null>(null);
  readonly isSubmitting = signal<boolean>(false);
  readonly formErrorMessage = signal<string>('');

  // Computed KPI Metrics
  readonly totalUsers = computed(() => this.users().length);
  readonly adminCount = computed(() => this.users().filter((u) => u.is_admin).length);
  readonly standardCount = computed(() => this.users().filter((u) => !u.is_admin).length);
  readonly resumeActiveCount = computed(
    () =>
      this.users().filter(
        (u) => u.resume_internal || u.resume_offshore || u.resume_onsite,
      ).length,
  );
  readonly visaActiveCount = computed(
    () =>
      this.users().filter(
        (u) => u.visa_business || u.visa_ict || u.visa_extension,
      ).length,
  );

  // Filtered User List
  readonly filteredUsers = computed(() => {
    const term = this.searchTerm().toLowerCase().trim();
    const role = this.roleFilter();
    const perm = this.permissionFilter();

    return this.users().filter((user) => {
      // 1. Search filter
      const matchesSearch =
        !term ||
        user.user_name?.toLowerCase().includes(term) ||
        user.email_id?.toLowerCase().includes(term);

      if (!matchesSearch) return false;

      // 2. Role filter
      if (role === 'admin' && !user.is_admin) return false;
      if (role === 'user' && user.is_admin) return false;

      // 3. Permission filter
      if (
        perm === 'resume' &&
        !user.resume_internal &&
        !user.resume_offshore &&
        !user.resume_onsite
      ) {
        return false;
      }
      if (
        perm === 'visa' &&
        !user.visa_business &&
        !user.visa_ict &&
        !user.visa_extension
      ) {
        return false;
      }

      return true;
    });
  });

  // Computed Pagination
  readonly totalPages = computed(() =>
    Math.max(1, Math.ceil(this.filteredUsers().length / this.pageSize())),
  );

  readonly paginatedUsers = computed(() => {
    const start = (this.currentPage() - 1) * this.pageSize();
    return this.filteredUsers().slice(start, start + this.pageSize());
  });

  readonly pages = computed(() => {
    const total = this.totalPages();
    const list: number[] = [];
    for (let i = 1; i <= total; i++) {
      list.push(i);
    }
    return list;
  });

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.isLoading.set(true);
    this.errorMessage.set('');

    this.hrAdminService.getUsers().subscribe({
      next: (response) => {
        if (response && response.success && Array.isArray(response.data)) {
          this.users.set(response.data);
        } else if (Array.isArray(response as any)) {
          this.users.set(response as any);
        } else {
          this.users.set([]);
        }
        this.isLoading.set(false);
      },
      error: (err) => {
        console.error('[HrAdminControl] Failed to load users:', err);
        this.errorMessage.set('Failed to load HR users list. Please try again.');
        this.isLoading.set(false);
      },
    });
  }

  // ── Search & Filter Handlers ───────────────────────────────────────────────

  onSearchChange(value: string) {
    this.searchTerm.set(value);
    this.currentPage.set(1);
  }

  onRoleFilterChange(value: 'all' | 'admin' | 'user') {
    this.roleFilter.set(value);
    this.currentPage.set(1);
  }

  onPermFilterChange(value: 'all' | 'resume' | 'visa') {
    this.permissionFilter.set(value);
    this.currentPage.set(1);
  }

  formatPermFilter(perm: string): string {
    if (perm === 'resume') return 'Resume Standardizer';
    if (perm === 'visa') return 'Visa Process';
    return 'All';
  }

  formatRoleFilter(role: string): string {
    if (role === 'admin') return 'Admin';
    if (role === 'user') return 'User';
    return 'All';
  }

  // ── Pagination Handlers ────────────────────────────────────────────────────

  goToPage(page: number) {
    if (page >= 1 && page <= this.totalPages()) {
      this.currentPage.set(page);
    }
  }

  prevPage() {
    if (this.currentPage() > 1) {
      this.currentPage.set(this.currentPage() - 1);
    }
  }

  nextPage() {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.set(this.currentPage() + 1);
    }
  }

  // ── Modal Actions ──────────────────────────────────────────────────────────

  openEditModal(user: HrUserAccess): void {
    this.selectedUser.set(user);
    this.isEditMode.set(true);
    this.formErrorMessage.set('');
    this.isFormModalOpen.set(true);
  }

  closeFormModal(): void {
    this.isFormModalOpen.set(false);
    this.selectedUser.set(null);
    this.formErrorMessage.set('');
  }

  // ── Save Handlers ──────────────────────────────────────────────────────────

  handleSaveUser(event: {
    isEdit: boolean;
    userId?: number;
    payload: CreateHrUserDto | UpdateHrUserDto;
  }): void {
    this.isSubmitting.set(true);
    this.formErrorMessage.set('');

    if (event.userId !== undefined) {
      this.hrAdminService
        .updateUser(event.userId, event.payload as UpdateHrUserDto)
        .subscribe({
          next: (res) => {
            this.isSubmitting.set(false);
            if (res && res.success === false) {
              this.formErrorMessage.set(res.message || 'Failed to update user.');
              return;
            }
            this.toastService.show(
              res?.message || 'User updated successfully',
              'success',
            );
            this.closeFormModal();
            this.loadUsers();
            // Also refresh permission service in case self was updated
            this.hrPermissionService.loadAccessControl(true).subscribe();
          },
          error: (err) => {
            this.isSubmitting.set(false);
            const msg =
              err?.error?.message || err?.message || 'Failed to update user.';
            this.formErrorMessage.set(msg);
          },
        });
    }
  }
}
