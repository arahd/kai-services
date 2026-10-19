import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  OnDestroy,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { of, Subject, Subscription } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, finalize, switchMap } from 'rxjs/operators';
import { AdminApiService } from '../../services/admin-api.service';
import { ReportingApiService } from '../../services/reporting-api.service';
import { ToastService } from '@core/services/toast.service';
import {
  UserManagementUser,
  UserManagementSummaryResponse,
  UserRole,
  UserAccess,
  UpdateUserPayload,
  TeamRecord,
  TeamMember,
  CreateTeamPayload,
  UpdateTeamPayload,
  TeamMembersMutationPayload,
} from '@shared/models';

export type UserRecord = UserManagementUser;
export interface ConfirmModalConfig {
  title: string;
  message: string;
  confirmText: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  onConfirm: () => void;
}

export type ActiveTab = 'users' | 'teams';

export interface ManageUserState {
  user: UserManagementUser;
  kaiAccess: boolean;
  sensitiveQuestions: boolean;
  role: UserRole;
  inputTokenLimit: number;
  outputTokenLimit: number;
  maxTokenLimit: number;
  inputTokensUsed: number;
  outputTokensUsed: number;
  totalDailyUsage: number;
}

export interface TeamFormData {
  group_name: string;
  input_token_limit: number;
  output_token_limit: number;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-user-management',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-management.component.html',
  styleUrl: './user-management.component.scss',
})
export class UserManagementComponent implements OnInit, OnDestroy {
  private readonly adminApiService = inject(AdminApiService);
  private readonly reportingApiService = inject(ReportingApiService);
  private readonly toastService = inject(ToastService);

  // ── Navigation Tabs ────────────────────────────────────────────────
  activeTab = signal<ActiveTab>('users');

  // ── Confirmation Modal State ────────────────────────────────────────
  readonly confirmModal = signal<ConfirmModalConfig | null>(null);

  openConfirmModal(config: ConfirmModalConfig): void {
    this.confirmModal.set(config);
  }

  closeConfirmModal(): void {
    this.confirmModal.set(null);
  }

  handleModalConfirm(): void {
    const config = this.confirmModal();
    if (config) {
      const action = config.onConfirm;
      this.closeConfirmModal();
      action();
    }
  }

  // ── User Management State ──────────────────────────────────────────
  users = signal<UserManagementUser[]>([]);
  loading = signal(false);
  isSaving = signal(false);
  isResetting = signal(false);

  searchTerm = signal('');
  roleFilter = signal<'All roles' | UserRole>('All roles');
  accessFilter = signal<'All access' | UserAccess>('All access');

  private readonly searchSubject$ = new Subject<string>();
  private searchSub?: Subscription;

  readonly pageSize = signal(10);
  currentPage = signal(1);
  totalRecords = signal(0);

  totalPages = computed(() =>
    Math.max(1, Math.ceil(this.totalRecords() / this.pageSize()))
  );

  filteredUsers = computed(() => {
    let list = this.users();
    const role = this.roleFilter();
    if (role !== 'All roles') {
      list = list.filter((u) => u.role === role);
    }
    return list;
  });

  pagedUsers = computed(() => this.filteredUsers());

  paginationPages = computed(() => {
    const total = this.totalPages();
    const current = this.currentPage();
    const pages: (number | '...')[] = [];

    if (total <= 7) {
      for (let i = 1; i <= total; i++) pages.push(i);
    } else {
      pages.push(1);
      if (current > 3) pages.push('...');
      const start = Math.max(2, current - 1);
      const end = Math.min(total - 1, current + 1);
      for (let i = start; i <= end; i++) pages.push(i);
      if (current < total - 2) pages.push('...');
      pages.push(total);
    }
    return pages;
  });

  // ── Manage User Side-Panel ─────────────────────────────────────────
  manageState = signal<ManageUserState | null>(null);
  panelOpen = signal(false);

  // ── Teams State (Task 915) ─────────────────────────────────────────
  teams = signal<TeamRecord[]>([]);
  teamsLoading = signal(false);
  teamsSearchTerm = signal('');

  filteredTeams = computed(() => {
    const term = this.teamsSearchTerm().toLowerCase().trim();
    if (!term) return this.teams();
    return this.teams().filter(
      (t) =>
        t.group_name.toLowerCase().includes(term) ||
        String(t.group_id).includes(term)
    );
  });

  // Team Modal (Create / Edit)
  teamModalOpen = signal(false);
  teamModalMode = signal<'create' | 'edit'>('create');
  editingTeam = signal<TeamRecord | null>(null);
  teamForm = signal<TeamFormData>({
    group_name: '',
    input_token_limit: 100000,
    output_token_limit: 100000,
  });
  isSavingTeam = signal(false);
  isDeletingTeam = signal(false);

  // Team Members Modal
  membersModalOpen = signal(false);
  selectedTeam = signal<TeamRecord | null>(null);
  teamMembers = signal<TeamMember[]>([]);
  membersLoading = signal(false);
  newMemberEmail = signal('');
  selectedMembersToAdd = signal<string[]>([]);
  memberSuggestions = signal<string[]>([]);
  memberSuggestionsLoading = signal(false);
  showMemberSuggestions = signal(false);
  private readonly newMemberInputSubject$ = new Subject<string>();
  private newMemberSearchSub?: Subscription;
  memberSearchTerm = signal('');
  isAddingMember = signal(false);
  isRemovingMember = signal<string | null>(null);

  filteredMembers = computed(() => {
    const term = this.memberSearchTerm().toLowerCase().trim();
    if (!term) return this.teamMembers();
    return this.teamMembers().filter((m) =>
      m.email.toLowerCase().includes(term)
    );
  });

  // ── KPI Metrics (Summary API) ──────────────────────────────────────
  userSummary = signal<UserManagementSummaryResponse | null>(null);
  summaryLoading = signal(false);

  totalUsersCount = computed(() => {
    const summary = this.userSummary();
    if (summary && typeof summary.total_users === 'number') {
      return summary.total_users;
    }
    return this.totalRecords() || this.users().length;
  });

  disabledUsersCount = computed(() => {
    const summary = this.userSummary();
    if (summary && typeof summary.disabled_access === 'number') {
      return summary.disabled_access;
    }
    return this.users().filter((u) => u.access === 'Disabled').length;
  });

  activeUsersCount = computed(() => this.disabledUsersCount());

  totalDailyTokensUsed = computed(() => {
    const summary = this.userSummary();
    if (summary && typeof summary.daily_tokens_consumed === 'number') {
      return summary.daily_tokens_consumed;
    }
    return this.users().reduce(
      (acc, u) =>
        acc +
        (u.total_daily_usage ??
          (u.input_tokens_used || 0) + (u.output_tokens_used || 0)),
      0
    );
  });

  totalTeamsCount = computed(() => this.teams().length);

  totalTeamMembersCount = computed(() =>
    this.teams().reduce((acc, t) => acc + (t.member_count || 0), 0)
  );

  ngOnInit(): void {
    this.searchSub = this.searchSubject$
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.currentPage.set(1);
        this.loadUsers();
      });

    this.newMemberSearchSub = this.newMemberInputSubject$
      .pipe(
        debounceTime(250),
        distinctUntilChanged(),
        switchMap((query) => {
          const trimmed = query.trim();
          if (!trimmed || trimmed.length < 2) {
            this.memberSuggestionsLoading.set(false);
            return of<string[]>([]);
          }
          this.memberSuggestionsLoading.set(true);
          return this.reportingApiService
            .searchReportingUsers({ username: trimmed, bot_type: 'kumaran' })
            .pipe(
              switchMap((res: any) => {
                let list: string[] = [];
                if (Array.isArray(res?.username)) {
                  list = res.username;
                } else if (Array.isArray(res?.data)) {
                  list = res.data;
                } else if (Array.isArray(res)) {
                  list = res;
                }
                const existingEmails = new Set(
                  this.teamMembers().map((m) => m.email.toLowerCase())
                );
                return of(
                  list.filter((email) => !existingEmails.has(email.toLowerCase()))
                );
              }),
              catchError((err) => {
                console.error('Failed to search reporting users:', err);
                return of<string[]>([]);
              }),
              finalize(() => this.memberSuggestionsLoading.set(false))
            );
        })
      )
      .subscribe((suggestions) => {
        this.memberSuggestions.set(suggestions);
        this.showMemberSuggestions.set(suggestions.length > 0);
      });

    this.loadUsers();
    this.loadSummary();
    // Safely attempt pre-fetching teams if method exists
    if (typeof (this.adminApiService as any).getTeams === 'function') {
      this.loadTeams();
    }
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
    this.newMemberSearchSub?.unsubscribe();
  }

  // ── Tab Management ─────────────────────────────────────────────────
  setActiveTab(tab: ActiveTab): void {
    this.activeTab.set(tab);
    if (tab === 'teams' && this.teams().length === 0 && !this.teamsLoading()) {
      this.loadTeams();
    }
  }

  // ── Summary KPI API ────────────────────────────────────────────────
  loadSummary(): void {
    if (typeof (this.adminApiService as any).getUserManagementSummary !== 'function') return;

    this.summaryLoading.set(true);
    this.adminApiService
      .getUserManagementSummary()
      .pipe(finalize(() => this.summaryLoading.set(false)))
      .subscribe({
        next: (summary) => {
          if (summary) {
            this.userSummary.set(summary);
          }
        },
        error: (err) => {
          console.error('Failed to load user management summary:', err);
        },
      });
  }

  // ── Users Operations ───────────────────────────────────────────────
  loadUsers(): void {
    this.loading.set(true);
    const accessParam =
      this.accessFilter() !== 'All access'
        ? (this.accessFilter() as UserAccess)
        : undefined;
    const roleParam =
      this.roleFilter() !== 'All roles' ? this.roleFilter() : undefined;

    this.adminApiService
      .getUserManagementUsers({
        page: this.currentPage(),
        page_size: this.pageSize(),
        search: this.searchTerm() || undefined,
        access: accessParam,
        role: roleParam,
      })
      .pipe(finalize(() => this.loading.set(false)))
      .subscribe({
        next: (res) => {
          this.users.set(res?.users || []);
          this.totalRecords.set(res?.total_records || 0);
        },
        error: (err) => {
          console.error('Failed to load users:', err);
          this.toastService.show('Failed to load users', 'error');
          this.users.set([]);
          this.totalRecords.set(0);
        },
      });
  }

  goToPage(page: number | '...'): void {
    if (page === '...' || page === this.currentPage()) return;
    this.currentPage.set(page);
    this.loadUsers();
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.currentPage.update((p) => p - 1);
      this.loadUsers();
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.currentPage.update((p) => p + 1);
      this.loadUsers();
    }
  }

  onSearchChange(value: string): void {
    this.searchSubject$.next(value);
  }

  onRoleFilterChange(value: string): void {
    this.roleFilter.set(value as 'All roles' | UserRole);
    this.currentPage.set(1);
    this.loadUsers();
  }

  onAccessFilterChange(value: string): void {
    this.accessFilter.set(value as 'All access' | UserAccess);
    this.currentPage.set(1);
    this.loadUsers();
  }

  // ── Manage User Slide-Over Panel ───────────────────────────────────
  openManagePanel(user: UserManagementUser): void {
    const inputLimit = user.input_token_limit ?? 0;
    const outputLimit = user.output_token_limit ?? 0;
    const maxLimit = user.maximum_token_limit || (inputLimit + outputLimit);
    const inputUsed = user.input_tokens_used ?? 0;
    const outputUsed = user.output_tokens_used ?? 0;
    const totalDaily = user.total_daily_usage || (inputUsed + outputUsed);

    this.manageState.set({
      user,
      kaiAccess: user.access === 'Enabled',
      sensitiveQuestions: user.allow_sensitive_search ?? false,
      role: user.role,
      inputTokenLimit: inputLimit,
      outputTokenLimit: outputLimit,
      maxTokenLimit: maxLimit,
      inputTokensUsed: inputUsed,
      outputTokensUsed: outputUsed,
      totalDailyUsage: totalDaily,
    });
    setTimeout(() => this.panelOpen.set(true), 10);
  }

  closeManagePanel(): void {
    this.panelOpen.set(false);
    setTimeout(() => this.manageState.set(null), 300);
  }

  onOverlayClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('manage-overlay')) {
      this.closeManagePanel();
    }
  }

  get usagePercent(): number {
    const state = this.manageState();
    if (!state || !state.maxTokenLimit || state.maxTokenLimit <= 0) return 0;
    return Math.min(
      100,
      Math.round((state.totalDailyUsage / state.maxTokenLimit) * 100)
    );
  }

  updateManageField(field: keyof ManageUserState, value: unknown): void {
    const state = this.manageState();
    if (!state) return;

    const updated: ManageUserState = { ...state, [field]: value };
    if (field === 'inputTokenLimit' || field === 'outputTokenLimit') {
      const input =
        Number(field === 'inputTokenLimit' ? value : updated.inputTokenLimit) || 0;
      const output =
        Number(field === 'outputTokenLimit' ? value : updated.outputTokenLimit) || 0;
      updated.maxTokenLimit = input + output;
    }
    this.manageState.set(updated);
  }

  saveChanges(): void {
    const state = this.manageState();
    if (!state || this.isSaving()) return;

    this.isSaving.set(true);
    const payload: UpdateUserPayload = {
      email: state.user.email,
      allow_sensitive_search: state.sensitiveQuestions,
      input_token_limit: Number(state.inputTokenLimit) || 0,
      output_token_limit: Number(state.outputTokenLimit) || 0,
    };

    this.adminApiService
      .updateUserManagement(payload)
      .pipe(finalize(() => this.isSaving.set(false)))
      .subscribe({
        next: (res) => {
          this.toastService.show(
            res?.message || 'User updated successfully',
            'success'
          );
          const newMax = payload.input_token_limit + payload.output_token_limit;

          this.users.update((list) =>
            list.map((u) =>
              u.email === payload.email
                ? {
                    ...u,
                    allow_sensitive_search: payload.allow_sensitive_search,
                    input_token_limit: payload.input_token_limit,
                    output_token_limit: payload.output_token_limit,
                    maximum_token_limit: newMax,
                  }
                : u
            )
          );
          this.closeManagePanel();
          this.loadSummary();
        },
        error: (err) => {
          console.error('Failed to update user:', err);
          this.toastService.show(
            'Failed to update user. Please try again.',
            'error'
          );
        },
      });
  }

  resetTokens(): void {
    const state = this.manageState();
    if (!state || this.isResetting()) return;

    this.openConfirmModal({
      title: 'Reset Token Usage',
      message: `Are you sure you want to reset token usage for ${state.user.email}? This will set usage to 0.`,
      confirmText: 'Reset Usage',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: () => {
        this.executeResetTokens(state);
      },
    });
  }

  private executeResetTokens(state: ManageUserState): void {
    this.isResetting.set(true);
    this.adminApiService
      .resetUserTokens({ email: state.user.email })
      .pipe(finalize(() => this.isResetting.set(false)))
      .subscribe({
        next: (res) => {
          this.toastService.show(
            res?.message || 'Token usage reset successfully',
            'success'
          );
          this.manageState.set({
            ...state,
            inputTokensUsed: 0,
            outputTokensUsed: 0,
            totalDailyUsage: 0,
          });
          this.users.update((list) =>
            list.map((u) =>
              u.email === state.user.email
                ? {
                    ...u,
                    input_tokens_used: 0,
                    output_tokens_used: 0,
                    total_daily_usage: 0,
                    total_tokens: 0,
                  }
                : u
            )
          );
          this.loadSummary();
        },
        error: (err) => {
          console.error('Failed to reset tokens:', err);
          this.toastService.show(
            'Failed to reset token usage. Please try again.',
            'error'
          );
        },
      });
  }

  // ── Teams Operations (Task 915) ────────────────────────────────────
  loadTeams(): void {
    if (typeof (this.adminApiService as any).getTeams !== 'function') return;

    this.teamsLoading.set(true);
    this.adminApiService
      .getTeams()
      .pipe(finalize(() => this.teamsLoading.set(false)))
      .subscribe({
        next: (res) => {
          this.teams.set(res?.teams || []);
        },
        error: (err) => {
          console.error('Failed to load teams:', err);
          this.toastService.show('Failed to load teams', 'error');
          this.teams.set([]);
        },
      });
  }

  openCreateTeamModal(): void {
    this.teamModalMode.set('create');
    this.editingTeam.set(null);
    this.teamForm.set({
      group_name: '',
      input_token_limit: 100000,
      output_token_limit: 100000,
    });
    this.teamModalOpen.set(true);
  }

  openEditTeamModal(team: TeamRecord): void {
    this.teamModalMode.set('edit');
    this.editingTeam.set(team);
    this.teamForm.set({
      group_name: team.group_name,
      input_token_limit: team.input_token_limit,
      output_token_limit: team.output_token_limit,
    });
    this.teamModalOpen.set(true);
  }

  closeTeamModal(): void {
    this.teamModalOpen.set(false);
    this.editingTeam.set(null);
  }

  updateTeamFormField(
    field: keyof TeamFormData,
    value: string | number
  ): void {
    this.teamForm.update((f) => ({
      ...f,
      [field]: field === 'group_name' ? String(value) : Number(value) || 0,
    }));
  }

  saveTeam(): void {
    const form = this.teamForm();
    if (!form.group_name.trim()) {
      this.toastService.show('Team name is required', 'error');
      return;
    }
    if (this.isSavingTeam()) return;

    this.isSavingTeam.set(true);

    if (this.teamModalMode() === 'create') {
      const payload: CreateTeamPayload = {
        group_name: form.group_name.trim(),
        input_token_limit: Number(form.input_token_limit) || 0,
        output_token_limit: Number(form.output_token_limit) || 0,
      };

      this.adminApiService
        .createTeam(payload)
        .pipe(finalize(() => this.isSavingTeam.set(false)))
        .subscribe({
          next: (res) => {
            this.toastService.show(
              res?.message || 'Team created successfully',
              'success'
            );
            if (res?.team) {
              const newTeam: TeamRecord = {
                group_id: res.team.group_id,
                group_name: res.team.group_name,
                member_count: 0,
                input_token_limit: res.team.input_token_limit,
                output_token_limit: res.team.output_token_limit,
                overall_input_token_usage: 0,
                overall_output_token_usage: 0,
                daily_input_token_usage: 0,
                daily_output_token_usage: 0,
              };
              this.teams.update((list) => [newTeam, ...list]);
            } else {
              this.loadTeams();
            }
            this.closeTeamModal();
          },
          error: (err) => {
            console.error('Failed to create team:', err);
            this.toastService.show('Failed to create team', 'error');
          },
        });
    } else {
      const current = this.editingTeam();
      if (!current) {
        this.isSavingTeam.set(false);
        return;
      }

      const payload: UpdateTeamPayload = {
        group_id: current.group_id,
        input_token_limit: Number(form.input_token_limit) || 0,
        output_token_limit: Number(form.output_token_limit) || 0,
      };

      this.adminApiService
        .updateTeam(payload)
        .pipe(finalize(() => this.isSavingTeam.set(false)))
        .subscribe({
          next: (res) => {
            this.toastService.show(
              res?.message || 'Team updated successfully',
              'success'
            );
            this.teams.update((list) =>
              list.map((t) =>
                t.group_id === current.group_id
                  ? {
                      ...t,
                      input_token_limit: payload.input_token_limit,
                      output_token_limit: payload.output_token_limit,
                    }
                  : t
              )
            );
            this.closeTeamModal();
          },
          error: (err) => {
            console.error('Failed to update team:', err);
            this.toastService.show('Failed to update team', 'error');
          },
        });
    }
  }

  deleteTeam(team: TeamRecord): void {
    this.openConfirmModal({
      title: 'Delete Team',
      message: `Are you sure you want to delete team "${team.group_name}"? This action cannot be undone.`,
      confirmText: 'Delete Team',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: () => {
        this.executeDeleteTeam(team);
      },
    });
  }

  private executeDeleteTeam(team: TeamRecord): void {
    this.isDeletingTeam.set(true);
    this.adminApiService
      .deleteTeam(team.group_id)
      .pipe(finalize(() => this.isDeletingTeam.set(false)))
      .subscribe({
        next: (res) => {
          this.toastService.show(
            res?.message || 'Team deleted successfully',
            'success'
          );
          this.teams.update((list) =>
            list.filter((t) => t.group_id !== team.group_id)
          );
        },
        error: (err) => {
          console.error('Failed to delete team:', err);
          this.toastService.show('Failed to delete team', 'error');
        },
      });
  }

  // ── Team Members Management (Task 915) ─────────────────────────────
  openMembersModal(team: TeamRecord): void {
    this.selectedTeam.set(team);
    this.newMemberEmail.set('');
    this.selectedMembersToAdd.set([]);
    this.memberSuggestions.set([]);
    this.showMemberSuggestions.set(false);
    this.memberSearchTerm.set('');
    this.membersModalOpen.set(true);
    this.loadTeamMembers(team.group_id);
  }

  closeMembersModal(): void {
    this.membersModalOpen.set(false);
    this.selectedTeam.set(null);
    this.teamMembers.set([]);
    this.selectedMembersToAdd.set([]);
    this.memberSuggestions.set([]);
    this.showMemberSuggestions.set(false);
  }

  onNewMemberEmailInput(value: string): void {
    this.newMemberEmail.set(value);
    this.newMemberInputSubject$.next(value);
  }

  selectMemberSuggestion(email: string): void {
    this.toggleMemberSelection(email);
  }

  isMemberSelectedToAdd(email: string): boolean {
    const target = email.trim().toLowerCase();
    return this.selectedMembersToAdd().some((e) => e.toLowerCase() === target);
  }

  toggleMemberSelection(email: string): void {
    const trimmed = email.trim();
    if (!trimmed) return;
    const lower = trimmed.toLowerCase();

    if (this.isMemberSelectedToAdd(lower)) {
      this.selectedMembersToAdd.update((list) =>
        list.filter((e) => e.toLowerCase() !== lower)
      );
    } else {
      if (this.teamMembers().some((m) => m.email.toLowerCase() === lower)) {
        this.toastService.show('This user is already a member of this team', 'error');
        return;
      }
      this.selectedMembersToAdd.update((list) => [...list, trimmed]);
    }
  }

  removeMemberToAdd(email: string): void {
    const lower = email.trim().toLowerCase();
    this.selectedMembersToAdd.update((list) =>
      list.filter((e) => e.toLowerCase() !== lower)
    );
  }

  clearAllSelectedMembersToAdd(): void {
    this.selectedMembersToAdd.set([]);
  }

  handleMemberInputKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      event.preventDefault();
      const val = this.newMemberEmail().trim();
      if (val) {
        if (!val.includes('@')) {
          this.toastService.show('Please enter a valid member email address', 'error');
          return;
        }
        if (this.teamMembers().some((m) => m.email.toLowerCase() === val.toLowerCase())) {
          this.toastService.show('This user is already a member of this team', 'error');
          return;
        }
        if (!this.isMemberSelectedToAdd(val)) {
          this.selectedMembersToAdd.update((list) => [...list, val]);
        }
        this.newMemberEmail.set('');
        this.memberSuggestions.set([]);
        this.showMemberSuggestions.set(false);
      } else if (this.selectedMembersToAdd().length > 0) {
        this.addMember();
      }
    }
  }

  hideMemberSuggestions(): void {
    this.showMemberSuggestions.set(false);
  }

  loadTeamMembers(groupId: number): void {
    this.membersLoading.set(true);
    this.adminApiService
      .getTeamMembers(groupId)
      .pipe(finalize(() => this.membersLoading.set(false)))
      .subscribe({
        next: (res) => {
          this.teamMembers.set(res?.members || []);
          if (res?.member_count !== undefined) {
            this.teams.update((list) =>
              list.map((t) =>
                t.group_id === groupId
                  ? { ...t, member_count: res.member_count }
                  : t
              )
            );
          }
        },
        error: (err) => {
          console.error('Failed to load team members:', err);
          this.toastService.show('Failed to load team members', 'error');
          this.teamMembers.set([]);
        },
      });
  }

  addMember(): void {
    const team = this.selectedTeam();
    if (!team) return;

    const toAdd = [...this.selectedMembersToAdd()];
    const currentInput = this.newMemberEmail().trim();
    if (currentInput && currentInput.includes('@')) {
      const lower = currentInput.toLowerCase();
      if (
        !toAdd.some((e) => e.toLowerCase() === lower) &&
        !this.teamMembers().some((m) => m.email.toLowerCase() === lower)
      ) {
        toAdd.push(currentInput);
      }
    }

    if (toAdd.length === 0) {
      if (currentInput && !currentInput.includes('@')) {
        this.toastService.show('Please enter a valid member email address', 'error');
      } else {
        this.toastService.show('Please select or enter at least one member to add', 'error');
      }
      return;
    }

    this.isAddingMember.set(true);
    const payload: TeamMembersMutationPayload = {
      group_id: team.group_id,
      members: toAdd,
    };

    this.adminApiService
      .addTeamMembers(payload)
      .pipe(finalize(() => this.isAddingMember.set(false)))
      .subscribe({
        next: (res) => {
          const count = toAdd.length;
          const msg =
            res?.message ||
            (count === 1
              ? 'Member added successfully'
              : `${count} members added successfully`);
          this.toastService.show(msg, 'success');
          const newMembers = toAdd.map((email) => ({ email }));
          this.teamMembers.update((list) => [...list, ...newMembers]);
          this.newMemberEmail.set('');
          this.selectedMembersToAdd.set([]);
          this.memberSuggestions.set([]);
          this.showMemberSuggestions.set(false);
          this.teams.update((list) =>
            list.map((t) =>
              t.group_id === team.group_id
                ? { ...t, member_count: t.member_count + count }
                : t
            )
          );
        },
        error: (err) => {
          console.error('Failed to add member(s):', err);
          this.toastService.show('Failed to add member(s)', 'error');
        },
      });
  }

  removeMember(email: string): void {
    const team = this.selectedTeam();
    if (!team) return;

    this.openConfirmModal({
      title: 'Remove Team Member',
      message: `Are you sure you want to remove ${email} from ${team.group_name}?`,
      confirmText: 'Remove Member',
      cancelText: 'Cancel',
      type: 'danger',
      onConfirm: () => {
        this.executeRemoveMember(team, email);
      },
    });
  }

  private executeRemoveMember(team: TeamRecord, email: string): void {
    this.isRemovingMember.set(email);
    const payload: TeamMembersMutationPayload = {
      group_id: team.group_id,
      members: [email],
    };

    this.adminApiService
      .removeTeamMembers(payload)
      .pipe(finalize(() => this.isRemovingMember.set(null)))
      .subscribe({
        next: (res) => {
          this.toastService.show(
            res?.message || 'Member removed successfully',
            'success'
          );
          this.teamMembers.update((list) =>
            list.filter((m) => m.email.toLowerCase() !== email.toLowerCase())
          );
          this.teams.update((list) =>
            list.map((t) =>
              t.group_id === team.group_id
                ? { ...t, member_count: Math.max(0, t.member_count - 1) }
                : t
            )
          );
        },
        error: (err) => {
          console.error('Failed to remove member:', err);
          this.toastService.show('Failed to remove member', 'error');
        },
      });
  }

  // ── Helper Utilities ───────────────────────────────────────────────
  formatNumber(m: number | undefined | null,n?: number | undefined | null): string {
    return ((m??1)*(n??1)).toLocaleString();
  }

  getInitials(nameOrEmail?: string): string {
    if (!nameOrEmail) return 'U';
    const parts = nameOrEmail.split('@')[0].split('.');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return nameOrEmail.slice(0, 2).toUpperCase();
  }

  calculateInputUsagePercent(user: UserManagementUser): number {
    const limit = user.input_token_limit ?? 0;
    if (limit <= 0) return 0;
    const used = user.input_tokens_used ?? 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  calculateOutputUsagePercent(user: UserManagementUser): number {
    const limit = user.output_token_limit ?? 0;
    if (limit <= 0) return 0;
    const used = user.output_tokens_used ?? 0;
    return Math.min(100, Math.round((used / limit) * 100));
  }

  calculateUserUsagePercent(user: UserManagementUser): number {
    const max =
      (user.input_token_limit ?? 0) + (user.output_token_limit ?? 0) ||
      user.maximum_token_limit ||
      0;
    if (!max || max <= 0) return 0;
    const used =
      user.total_daily_usage ||
      (user.input_tokens_used ?? 0) + (user.output_tokens_used ?? 0);
    return Math.min(100, Math.round((used / max) * 100));
  }

  calculateTeamUsagePercent(team: TeamRecord): number {
    const totalLimit = (team.input_token_limit * team.member_count) + (team.output_token_limit *team.member_count);
    if (!totalLimit || totalLimit <= 0) return 0;
    const totalDaily =
      (team.daily_input_token_usage ?? 0) + (team.daily_output_token_usage ?? 0);
    return Math.min(100, Math.round((totalDaily / totalLimit) * 100));
  }
}
