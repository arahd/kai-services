import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, inject, signal } from '@angular/core';
import {
  FormArray,
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ReportingApiService } from '@features/admin-dashboard/services/reporting-api.service';
import { ApprovePayload, PendingUser, RegisteredUser } from '@shared/models';
import { EditPromptsComponent } from '../edit-prompts/edit-prompts.component';
import { ToastService } from '@core/services/toast.service';
import { TooltipDirective } from '@shared/directives/tooltip.directive';
import { TokenService } from '@core/services/token.service';

interface RevokedUserRow {
  username: string;
  project_id: string;
  revoked_at: string | null;
}

interface DailyTokenUsageRow {
  id: number;
  username: string;
  project_id: string;
  token_resetted_at: string | null;
  tokens_used_today: number;
  tokens_per_day: number;
  tokens_remaining_today: number;
  requests_used_today: number;
  requests_per_day: number;
  requests_remaining_today: number;
}

type DailyTokenUsageSortColumn = 'username' | 'project_id' | 'token_resetted_at' | 'tokens_used_today' | 'status';

interface GptModel {
  description: string;
  displayName: string;
  isDefault: boolean;
  isEnabled: boolean;
  value: string;
}

interface FilteredSummaryRow {
  filtered_overall_tokens: number;
  filtered_total_input_tokens: number;
  filtered_total_output_tokens: number;
  model_name: string;
  total_user_query: number;
  username: string;
}

interface ModelWiseUsageRow {
  model_name: string;
  overall_token_usage: number;
  project_id: string;
  total_input_tokens: number;
  total_output_tokens: number;
  usage_date: string;
  user_query: number;
}

interface UserDetailRow {
  model_wise_token_usuage: ModelWiseUsageRow[];
  project_id: string;
  requests_used: number;
  reset_at: string;
  tokens_used: number;
  total_user_query: number;
  username: string;
}

interface UserDetailsResponse {
  filtered_summary: FilteredSummaryRow[];
  user_details: UserDetailRow[];
}

interface AllUsersFilterRow {
  username: string;
  project_id: string;
  total_queries: number;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

type FilterResultsSortColumn =
  | 'username'
  | 'project_id'
  | 'total_queries'
  | 'input_tokens'
  | 'output_tokens'
  | 'total_tokens'
  | 'usage_date'
  | 'model_name'
  | 'total_input_tokens'
  | 'total_output_tokens'
  | 'overall_token_usage'
  | 'user_query';

interface UsageContributorRow {
  name: string;
  tokens: number;
  color: string;
}

interface ModelBreakdownRow {
  modelName: string;
  tokens: number;
  percent: number;
  color: string;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-service-user-analytics',
  imports: [CommonModule, ReactiveFormsModule, FormsModule, EditPromptsComponent],
  templateUrl: './service-user-analytics.component.html',
  styleUrl: './service-user-analytics.component.scss',
})
export class ServiceUserAnalyticsComponent {
  userEmail = '';
  userFullName = '';
  userInitials = '';
  userMenuOpen = false;
  pendingUsers: PendingUser[] = [];
  registeredUsers: RegisteredUser[] = [];
  loadingPending = false;
  loadingRegistered = false;
  errorMsg = '';
  showApproveModal = false;
  selectedUserEmail: string | null = null;
  availableModels = ['GPT-4o mini', 'Gemini', 'GPT-4o', 'Gemini Pro'];
  approveForm: FormGroup;
  isCreatingSecret: boolean = false;
  showCreateSecretModal = false;
  createSecret = {
    username: '',
    project_id: '',
  };
  clientSecrets: any[] = [];
  loadingClientSecrets = false;
  clientSecretsPage = 1;
  clientSecretsPageSize = 10;
  clientSecretsTotal = 0;
  clientSecretsTotalPages = 1;
  removingClientSecrets: { [key: string]: boolean } = {};
  clientSecretsSearch = '';
  private clientSecretsSearchTimer: any;
  exportingUsers = false;
  exportingQuestions = false;
  showEditPromptsModal = false;
  /** First page snapshot for stat cards (Users Monitored, Tokens Today, Avg Tokens). */
  tokenUsage: any[] = [];
  tokenUsageTotalCount = 0;
  revokedUsers: RevokedUserRow[] = [];
  loadingRevokedUsers = false;
  revokedUsersPage = 1;
  revokedUsersPageSize = 10;
  revokedUsersTotal = 0;
  revokedUsersTotalPages = 1;
  restoringRevokedUsers: { [key: string]: boolean } = {};

  // -- Daily Token Usage --------------------------------------
  dailyTokenUsageRows: DailyTokenUsageRow[] = [];
  loadingDailyTokenUsage = false;
  dailyTokenUsagePage = 1;
  dailyTokenUsagePageSize = 10;
  dailyTokenUsageTotal = 0;
  dailyTokenUsageTotalPages = 1;
  dailyTokenUsageSortColumn: DailyTokenUsageSortColumn | null = null;
  dailyTokenUsageSortDir: 'asc' | 'desc' = 'asc';
  resettingDailyTokens: { [key: string]: boolean } = {};

  topUsageContributors: UsageContributorRow[] = [];
  modelUsageBreakdown: ModelBreakdownRow[] = [];
  modelBreakdownTotal = 0;
  loadingTopUsageContributors = false;
  loadingModelUsageBreakdown = false;

  private readonly contributorColors = [
    '#2c3e50',
    '#2ecc71',
    '#3498db',
    '#f1c40f',
    '#e74c3c',
  ];

  private readonly modelBreakdownColors = [
    '#4285F4',
    '#9333EA',
    '#10B981',
    '#F59E0B',
  ];

  // ── Filter modal ─────────────────────────────────────────────
  filterForm: FormGroup;
  showFiltersPanel = signal(false);
  loadingModels = signal(false);
  loadingUser = signal(false);
  modelsList: GptModel[] = [];
  userSearchInput = '';
  userSearchResults: string[] = [];
  usernameFilterError = '';
  private usernameSearchTimer: any;
  /** Project IDs fetched once for the filter Project ID dropdown. */
  allProjectIds: string[] = [];
  loadingProjectIds = false;
  private projectIdsLoaded = false;

  // ── Filter results ───────────────────────────────────────────
  showResultsModal = signal(false);
  filterResults = signal<UserDetailsResponse | null>(null);
  /** When set, the results modal shows that user's model-wise breakdown (All Users → View). */
  drilledDetailUsername: string | null = null;
  filterResultsPage = 1;
  filterResultsPageSize = 12;
  filterResultsSortColumn: FilterResultsSortColumn | null = null;
  filterResultsSortDir: 'asc' | 'desc' = 'asc';

  private readonly chatService = inject(ChatService);
  private readonly reportingApi = inject(ReportingApiService);
  private readonly fb = inject(FormBuilder);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly azureAd = inject(AzureAdService);
  private readonly tokenService = inject(TokenService);
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    this.approveForm = this.fb.group({
      approved: ['yes'],
      models: this.fb.array(this.availableModels.map(() => false)),
    });

    const today = new Date().toISOString().split('T')[0];
    this.filterForm = this.fb.group({
      username: [''],
      usernames: [[] as string[]],
      projectId: [''],
      models: [[] as string[]],
      modelMatchAll: [false],
      startDate: [today],
      endDate: [today],
    });
  }

  ngOnInit(): void {
    this.loadPendingUsers();
    this.loadRegisteredUsers();
    this.loadUserInfo();
    this.userInitials = this.getInitials(this.userFullName);
    this.loadInitialProjectsData();
    this.loadUsageAnalyticsCards();
    this.loadRevokedUsers();
    this.loadModels();
  }

  navigateTo(route: string) {
    this.router.navigate([route]);
  }

  loadUserInfo() {
    const user = this.tokenService.getUserInfo();

    if (user) {
      this.userFullName = user.name || '';
      this.userEmail = user.email || '';
      this.userInitials = this.getInitials(this.userFullName || this.userEmail);
    }
  }

  getInitials(name: string): string {
    if (!name) return '?';

    const parts = name.trim().split(' ');
    if (parts.length === 1) return parts[0][0].toUpperCase();

    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  toggleUserMenu() {
    this.userMenuOpen = !this.userMenuOpen;
  }

  logout() {
    console.log('Logout clicked');
    // Clear sessionStorage or redirect to login
    sessionStorage.clear();
    this.azureAd.logout();
  }

  private modelSelections(): boolean[] {
    // perf-ignore
    return (this.approveForm.get('models') as FormArray).value;
  }

  loadPendingUsers(): void {
    this.loadingPending = true;
    this.errorMsg = '';
    this.chatService.getPendingUserDetails().subscribe({
 // perf-ignore
      next: (res) => {
        this.pendingUsers = res ?? [];
        this.loadingPending = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.errorMsg = 'Failed loading pending users';
        this.loadingPending = false;
        this.cdr.markForCheck();
      },
    });
  }

  loadRegisteredUsers(): void {
    this.loadingRegistered = true;
    this.chatService.getRegisteredUserDetails().subscribe({
 // perf-ignore
      next: (res) => {
        this.registeredUsers = res ?? [];
        this.loadingRegistered = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error(err);
        this.errorMsg = 'Failed loading registered users';
        this.loadingRegistered = false;
        this.cdr.markForCheck();
      },
    });
  }

  get totalUsersCount(): number {
    return this.registeredUsers.length + this.pendingUsers.length;
  }

  get accessControlActiveUsers(): number {
    return this.registeredUsers.length;
  }

  /**
   * "Users Monitored" matches the snapshot-level counts from token usage API when available.
   * Falls back to the known user list count.
   */
  get accessControlUsersMonitored(): number {
    const n = Number(this.tokenUsageTotalCount ?? 0) || 0;
    return n > 0 ? n : this.totalUsersCount;
  }

  get accessControlActiveSecrets(): number {
    return this.clientSecretsTotal > 0
      ? this.clientSecretsTotal
      : this.clientSecrets.length;
  }

  private isSameLocalDay(a: Date, b: Date): boolean {
    return (
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate()
    );
  }

  /** Sum of `tokens_used_today` for rows from /reporting/api/report/projects (with date-based fallback). */
  get accessControlTokensUsedToday(): number {
    let sum = 0;
    const today = new Date();
    for (const row of this.tokenUsage ?? []) {
      if (row?.tokens_used_today !== undefined && row?.tokens_used_today !== null) {
        sum += Number(row.tokens_used_today) || 0;
      } else {
        const d = row?.day ? new Date(row.day) : null;
        if (!d || Number.isNaN(d.getTime())) continue;
        if (!this.isSameLocalDay(d, today)) continue;
        sum += Number(row?.tokens_used ?? 0) || 0;
      }
    }
    return sum;
  }

  /** Average tokens per request for today (supports /reporting/api/report/projects schema and legacy date fallback). */
  get accessControlAvgTokensPerRequest(): number {
    let totalTokens = 0;
    let totalRequests = 0;
    const today = new Date();
    for (const row of this.tokenUsage ?? []) {
      if (row?.tokens_used_today !== undefined && row?.tokens_used_today !== null) {
        totalTokens += Number(row.tokens_used_today) || 0;
        totalRequests += Number(row.requests_used_today) || (Number(row.tokens_used_today) > 0 ? 1 : 0);
      } else {
        const d = row?.day ? new Date(row.day) : null;
        if (!d || Number.isNaN(d.getTime())) continue;
        if (!this.isSameLocalDay(d, today)) continue;
        totalTokens += Number(row?.tokens_used ?? 0) || 0;
        totalRequests += 1;
      }
    }
    if (totalRequests <= 0) return 0;
    return Math.round(totalTokens / totalRequests);
  }

  openApproveModal(email: string, decision: 'yes' | 'no' = 'yes'): void {
    this.selectedUserEmail = email;
    this.approveForm.patchValue({ approved: decision });
    const modelsArray = this.approveForm.get('models') as FormArray;
    for (let i = 0; i < modelsArray.length; i++)
      modelsArray.at(i).setValue(false);
    this.showApproveModal = true;
  }

  closeApproveModal(): void {
    this.showApproveModal = false;
    this.selectedUserEmail = null;
  }

  toggleApprovedValue(value: 'yes' | 'no'): void {
    this.approveForm.patchValue({ approved: value });
  }

  submitApproval(): void {
    if (!this.selectedUserEmail) return alert('No user selected');

    const selectedModels = this.availableModels.filter(
      (_, idx) => this.modelSelections()[idx],
    );
    const payload: ApprovePayload = {
      email: this.selectedUserEmail,
      approved: this.approveForm.value.approved,
      models: selectedModels,
    };

    // if (!confirm(`Send approval for ${payload.email}?`)) return;

    this.chatService.approveAccess(payload).subscribe({
 // perf-ignore
      next: () => {
        this.closeApproveModal();
        this.loadPendingUsers();
        this.loadRegisteredUsers();
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.toastService.show('Failed to submit approval', 'error');
        console.error(err);
        this.cdr.markForCheck();
      },
    });
  }

  getModelNames(models: { model_name: string }[] | undefined | null): string {
    if (!models || models.length === 0) return '-';
    return models?.map((m) => m.model_name).join(', ');
  }

  getRegisteredModelNames(
    models: { email: string; models: { model_name: string }[] } | undefined | null,
  ): string {
    if (!models || !models.models || models.models.length === 0) return '-';
    return models.models.map((m) => m.model_name).join(', ');
  }

  openCreateSecretModal() {
    this.showCreateSecretModal = true;
  }

  closeCreateSecretModal() {
    this.showCreateSecretModal = false;
    this.createSecret = { username: '', project_id: '' };
  }

  get isCreateSecretFormValid(): boolean {
    return (
      !!this.createSecret.username?.trim() &&
      !!this.createSecret.project_id?.trim()
    );
  }

  submitCreateSecret() {
    if (!this.createSecret.username || !this.createSecret.project_id) {
      this.errorMsg = 'Please fill all fields';
      return;
    }
    this.isCreatingSecret = true;
    this.chatService
      .createClientSecret({
        username: this.createSecret.username.trim(),
        bot_type: 'kumaran',
        project_id: this.createSecret.project_id.trim(),
      })
      .subscribe({
 // perf-ignore
      next: (res) => {
        this.isCreatingSecret = false;
        this.closeCreateSecretModal();
        this.loadProjectList({
          page: 1,
          onLoaded: () => {
            this.toastService.show(
              'Client secret key generated successfully',
              'success',
              4500,
              'bottom-banner',
            );
          },
        });
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.isCreatingSecret = false;
        this.errorMsg = 'Failed to create client secret';
        this.cdr.markForCheck();
      },
    });
  }

  openEditPromptsModal(): void {
    this.showEditPromptsModal = true;
  }

  closeEditPromptsModal(): void {
    this.showEditPromptsModal = false;
  }

  // ── Filter modal ─────────────────────────────────────────────
  toggleFiltersPanel(): void {
    const willOpen = !this.showFiltersPanel();
    this.showFiltersPanel.set(willOpen);
    if (willOpen) {
      this.filterForm.patchValue({ projectId: '' });
      this.loadProjectIdsForFilter();
    }
  }

  /** Fetch the project list once for the Project ID dropdown. */
  loadProjectIdsForFilter(): void {
    if (this.projectIdsLoaded || this.loadingProjectIds) return;

    this.loadingProjectIds = true;
    this.chatService.getFilterProjectIds({ bot_type: 'kumaran' }).subscribe({
 // perf-ignore
      next: (res: any) => {
        this.allProjectIds = this.extractProjectIds(res);
        this.projectIdsLoaded = true;
        this.loadingProjectIds = false;
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error('Error loading project list:', err);
        this.allProjectIds = [];
        this.loadingProjectIds = false;
        this.toastService.show('Failed to load project list', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  /** Normalize various possible API response shapes into a unique, sorted string[]. */
  private extractProjectIds(res: any): string[] {
    const raw =
      res?.project_list ??
      res?.projectlist ??
      res?.project_ids ??
      res?.projects ??
      res?.data ??
      res;

    if (!Array.isArray(raw)) return [];

    const ids = raw
      .map((item: any) =>
        typeof item === 'string'
          ? item
          : String(item?.project_id ?? item?.projectId ?? item?.project ?? item?.name ?? ''),
      )
      .map((id: string) => id.trim())
      .filter((id: string) => id.length > 0);

    return Array.from(new Set(ids)).sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: 'base' }),
    );
  }

  applyFiltersFromModal(): void {
    if (this.loadingUser()) return;

    const validationError = this.getFilterValidationError();
    if (validationError) {
      this.usernameFilterError = validationError;
      this.toastService.show(validationError, 'error');
      return;
    }

    this.usernameFilterError = '';
    const payload = this.buildUserDetailsPayload();
    const requestedUsernames = (payload['usernames'] as string[]) ?? [];
    this.loadingUser.set(true);
    this.showFiltersPanel.set(false);
    this.showResultsModal.set(true);
    this.filterResults.set(null);
    this.drilledDetailUsername = null;
    this.filterResultsPage = 1;
    this.filterResultsSortColumn = null;
    this.filterResultsSortDir = 'asc';

    this.chatService.getApiUserReportDetails(payload).subscribe({
 // perf-ignore
      next: (res: any) => {
        const normalized = this.normalizeFilterResponse(res, requestedUsernames);
        this.filterResults.set(normalized);

        if (requestedUsernames.length > 0 && normalized.user_details.length === 0) {
          this.toastService.show(
            'No users found matching the selected filter criteria.',
            'error',
          );
        }

        this.loadingUser.set(false);
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error(err);
        this.filterResults.set({ filtered_summary: [], user_details: [] });
        this.toastService.show('Failed to load filtered user details', 'error');
        this.loadingUser.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private getFilterValidationError(): string | null {
    const pendingUsername = this.userSearchInput.trim();
    const selectedUsernames = this.filterSelectedUsernames;

    if (
      pendingUsername &&
      !selectedUsernames.some(
        (username) => username.toLowerCase() === pendingUsername.toLowerCase(),
      )
    ) {
      return 'Please select a valid username from the search suggestions, or clear the username search field.';
    }

    return null;
  }

  private normalizeFilterResponse(
    res: any,
    requestedUsernames: string[],
  ): UserDetailsResponse {
    let userDetails: UserDetailRow[] = Array.isArray(res?.user_details)
      ? res.user_details
      : [];
    let filteredSummary: FilteredSummaryRow[] = Array.isArray(res?.filtered_summary)
      ? res.filtered_summary
      : [];

    if (requestedUsernames.length > 0) {
      const requestedSet = new Set(
        requestedUsernames.map((username) => username.toLowerCase()),
      );
      userDetails = userDetails.filter((row) =>
        requestedSet.has(String(row.username ?? '').toLowerCase()),
      );
      filteredSummary = filteredSummary.filter((row) =>
        requestedSet.has(String(row.username ?? '').toLowerCase()),
      );
    }

    return {
      filtered_summary: filteredSummary,
      user_details: userDetails,
    };
  }

  /**
   * Shared filter payload for `getApiUserReportDetails` and `/reporting/api/report/question` export.
   * `timezone_offset` is required by the export API and keeps date boundaries aligned with KPI totals.
   */
  private buildFilterReportPayload(options?: { forExport?: boolean }): Record<string, unknown> {
    const v = this.filterForm.value;
    const projectId = String(v.projectId ?? '').trim();
    const models = this.getSelectedModels();
    const allModels = this.filterModelRadios().map((o) => o.value);

    let usernames = (v.usernames as string[]) ?? [];
    const activeUsername = options?.forExport ? this.filterResultsActiveUsername : null;
    if (activeUsername) {
      usernames = [activeUsername];
    }

    const payload: Record<string, unknown> = {
      bot_type: 'kumaran',
      timezone_offset: 'Asia/Calcutta',
    };
    if (usernames.length) payload['usernames'] = usernames;
    if (projectId) payload['project_id'] = projectId;
    if (v.startDate) payload['start_date'] = v.startDate;
    if (v.endDate) payload['end_date'] = v.endDate;
    const normalizeModel = (name: string) => this.normalizeModelForPayload(name);

    if (v.modelMatchAll) {
      if (allModels.length) payload['model_names'] = allModels.map(normalizeModel);
    } else if (models.length) {
      payload['model_names'] = models.map(normalizeModel);
    }

    return payload;
  }

  private normalizeModelForPayload(model: string): string {
    if (!model || typeof model !== 'string') return model;
    if (model.toUpperCase().includes('GPT-5') || model.toUpperCase().startsWith('GPT-5')) {
      return model.toLowerCase();
    }
    return model;
  }

  /** Build `/reporting/api/report/user_details` payload from the filter form (bot_type is fixed). */
  private buildUserDetailsPayload(): Record<string, unknown> {
    return this.buildFilterReportPayload();
  }

  /** Export uses the same filter payload as the filter results modal (scoped to drilled user when applicable). */
  private buildQuestionsExportPayload(): Record<string, unknown> {
    return this.buildFilterReportPayload({ forExport: true });
  }

  exportFilterQuestions(): void {
    if (this.exportingQuestions || this.loadingUser()) return;

    this.exportingQuestions = true;
    this.chatService
      .exportReportQuestionsXlsx(this.buildQuestionsExportPayload())
      .subscribe({
 // perf-ignore
        next: (blob: Blob) => {
          try {
            if (!blob?.size) {
              throw new Error('Export returned empty file');
            }
            this.downloadBlob(blob, `questions_${this.nowStamp()}.xlsx`);
            this.toastService.show(
              'Questions exported successfully',
              'success',
              4500,
              'bottom-banner',
            );
          } catch (e) {
            console.error(e);
            this.toastService.show('Export failed', 'error');
          } finally {
            this.exportingQuestions = false;
            this.cdr.markForCheck();
          }
        },
        error: (err: unknown) => {
          console.error(err);
          this.toastService.show('Export failed', 'error');
          this.exportingQuestions = false;
          this.cdr.markForCheck();
        },
      });
  }

  closeResultsModal(): void {
    this.showResultsModal.set(false);
    this.drilledDetailUsername = null;
    this.filterResultsPage = 1;
    this.filterResultsSortColumn = null;
    this.filterResultsSortDir = 'asc';
  }

  get filterSelectedUsernames(): string[] {
    return (this.filterForm.get('usernames')?.value as string[]) ?? [];
  }

  /** True when showing a single user's model-wise breakdown table. */
  get isUserDetailFilterView(): boolean {
    if (this.drilledDetailUsername) return true;
    return this.filterSelectedUsernames.length === 1;
  }

  get filterResultsHeaderUserLabel(): string {
    if (this.isUserDetailFilterView) {
      return this.drilledDetailUsername ?? this.filterSelectedUsernames[0] ?? '—';
    }
    return 'All Users';
  }

  getSelectedProjectIdDisplay(): string {
    const id = String(this.filterForm.get('projectId')?.value ?? '').trim();
    if (!id) return '—';
    return id
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' - ');
  }

  get filterResultsActiveUsername(): string | null {
    if (this.drilledDetailUsername) return this.drilledDetailUsername;
    if (this.filterSelectedUsernames.length === 1) {
      return this.filterSelectedUsernames[0];
    }
    return null;
  }

  get filterResultsKpis(): {
    totalQueries: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  } {
    const username = this.filterResultsActiveUsername;
    if (username) {
      return this.buildUserFilterKpis(username);
    }
    return this.buildAllUsersFilterKpis();
  }

  private buildAllUsersFilterKpis(): {
    totalQueries: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  } {
    const summary = this.filterResults()?.filtered_summary ?? [];
    return {
      totalQueries: summary.reduce(
        (sum, row) => sum + (Number(row.total_user_query) || 0),
        0,
      ),
      totalTokens: summary.reduce(
        (sum, row) => sum + (Number(row.filtered_overall_tokens) || 0),
        0,
      ),
      totalInputTokens: summary.reduce(
        (sum, row) => sum + (Number(row.filtered_total_input_tokens) || 0),
        0,
      ),
      totalOutputTokens: summary.reduce(
        (sum, row) => sum + (Number(row.filtered_total_output_tokens) || 0),
        0,
      ),
    };
  }

  private buildUserFilterKpis(username: string): {
    totalQueries: number;
    totalTokens: number;
    totalInputTokens: number;
    totalOutputTokens: number;
  } {
    const summary = (this.filterResults()?.filtered_summary ?? []).filter(
      (row) => row.username === username,
    );

    if (summary.length > 0) {
      return {
        totalQueries: summary.reduce(
          (sum, row) => sum + (Number(row.total_user_query) || 0),
          0,
        ),
        totalTokens: summary.reduce(
          (sum, row) => sum + (Number(row.filtered_overall_tokens) || 0),
          0,
        ),
        totalInputTokens: summary.reduce(
          (sum, row) => sum + (Number(row.filtered_total_input_tokens) || 0),
          0,
        ),
        totalOutputTokens: summary.reduce(
          (sum, row) => sum + (Number(row.filtered_total_output_tokens) || 0),
          0,
        ),
      };
    }

    const userRow = this.allUsersFilterRows.find((row) => row.username === username);
    return {
      totalQueries: userRow?.total_queries ?? 0,
      totalTokens: userRow?.total_tokens ?? 0,
      totalInputTokens: userRow?.input_tokens ?? 0,
      totalOutputTokens: userRow?.output_tokens ?? 0,
    };
  }

  get allUsersFilterRows(): AllUsersFilterRow[] {
    const users = this.filterResults()?.user_details ?? [];
    return users.map((user) => {
      const usage = user.model_wise_token_usuage ?? [];
      const inputTokens = usage.reduce(
        (sum, row) => sum + (Number(row.total_input_tokens) || 0),
        0,
      );
      const outputTokens = usage.reduce(
        (sum, row) => sum + (Number(row.total_output_tokens) || 0),
        0,
      );
      const overallTokens = usage.reduce(
        (sum, row) => sum + (Number(row.overall_token_usage) || 0),
        0,
      );

      return {
        username: user.username,
        project_id: user.project_id,
        total_queries: Number(user.total_user_query) || 0,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        total_tokens: overallTokens || Number(user.tokens_used) || 0,
      };
    });
  }

  get activeUserDetailRows(): ModelWiseUsageRow[] {
    const username =
      this.drilledDetailUsername ?? this.filterSelectedUsernames[0] ?? '';
    if (!username) return [];

    const user = this.filterResults()?.user_details?.find(
      (row) => row.username === username,
    );
    return user?.model_wise_token_usuage ?? [];
  }

  get filterResultsTotalPages(): number {
    const count = this.isUserDetailFilterView
      ? this.activeUserDetailRows.length
      : this.allUsersFilterRows.length;
    return Math.max(1, Math.ceil(count / this.filterResultsPageSize));
  }

  get filterResultsPageNumbers(): number[] {
    return Array.from(
      { length: this.filterResultsTotalPages },
      (_, index) => index + 1,
    );
  }

  get filterResultsAllUsersPaginated(): AllUsersFilterRow[] {
    return this.paginateAndSortRows(
      this.allUsersFilterRows as unknown as Record<string, unknown>[],
      this.filterResultsSortColumn,
    ) as unknown as AllUsersFilterRow[];
  }

  get filterResultsUserDetailPaginated(): ModelWiseUsageRow[] {
    return this.paginateAndSortRows(
      this.activeUserDetailRows as unknown as Record<string, unknown>[],
      this.filterResultsSortColumn,
    ) as unknown as ModelWiseUsageRow[];
  }

  private paginateAndSortRows(
    rows: Record<string, unknown>[],
    sortColumn: FilterResultsSortColumn | null,
  ): Record<string, unknown>[] {
    let sorted = [...rows];

    if (sortColumn) {
      sorted.sort((a, b) => {
        const av = a[sortColumn];
        const bv = b[sortColumn];
        const aNum = Number(av);
        const bNum = Number(bv);
        let cmp = 0;

        if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) {
          cmp = aNum - bNum;
        } else {
          cmp = String(av ?? '').localeCompare(String(bv ?? ''), undefined, {
            sensitivity: 'base',
          });
        }

        return this.filterResultsSortDir === 'asc' ? cmp : -cmp;
      });
    }

    const start = (this.filterResultsPage - 1) * this.filterResultsPageSize;
    return sorted.slice(start, start + this.filterResultsPageSize);
  }

  toggleFilterResultsSort(column: FilterResultsSortColumn): void {
    if (this.filterResultsSortColumn === column) {
      this.filterResultsSortDir =
        this.filterResultsSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.filterResultsSortColumn = column;
      this.filterResultsSortDir = 'asc';
    }
    this.filterResultsPage = 1;
  }

  isFilterResultsSortActive(column: FilterResultsSortColumn): boolean {
    return this.filterResultsSortColumn === column;
  }

  goToFilterResultsPage(page: number): void {
    if (
      page < 1 ||
      page > this.filterResultsTotalPages ||
      page === this.filterResultsPage
    ) {
      return;
    }
    this.filterResultsPage = page;
  }

  viewFilterUserDetail(username: string): void {
    this.drilledDetailUsername = username;
    this.filterResultsPage = 1;
    this.filterResultsSortColumn = null;
    this.filterResultsSortDir = 'asc';
  }

  get showFilterResultsBackButton(): boolean {
    return !!this.drilledDetailUsername;
  }

  backToAllUsersFilterResults(): void {
    this.drilledDetailUsername = null;
    this.filterResultsPage = 1;
    this.filterResultsSortColumn = null;
    this.filterResultsSortDir = 'asc';
  }

  // perf-ignore
  formatFilterUsageDate(value: string | null | undefined): string {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}-${pad(d.getMonth() + 1)}-${d.getFullYear()}`;
  }

  // perf-ignore
  formatFilterProjectLabel(projectId: string | null | undefined): string {
    const id = String(projectId ?? '').trim();
    if (!id) return '—';
    return id
      .split(/[-_\s]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  }

  clearFilters(): void {
    const today = new Date().toISOString().split('T')[0];
    this.filterForm.patchValue({
      username: '',
      usernames: [],
      projectId: '',
      models: [],
      modelMatchAll: false,
      startDate: today,
      endDate: today,
    });
    this.userSearchInput = '';
    this.userSearchResults = [];
    this.usernameFilterError = '';
  }

  getSelectedUsernamesString(): string {
    const usernames = (this.filterForm.get('usernames')?.value as string[]) ?? [];
    return usernames.length > 0 ? usernames.join(', ') : 'All Users';
  }

  // ── Model filter tiles ───────────────────────────────────────
  loadModels(): void {
    this.loadingModels.set(true);
    this.chatService.getReportingModels({ bot_type: 'kumaran' }).subscribe({
 // perf-ignore
      next: (res: any) => {
        const rawModels = Array.isArray(res?.report_gpt_model)
          ? res.report_gpt_model
          : Array.isArray(res)
            ? res
            : [];

        this.modelsList = rawModels
          .map((m: any) => {
            if (typeof m === 'string') {
              const val = this.normalizeModelForPayload(m);
              return {
                description: '',
                displayName: m,
                isDefault: false,
                isEnabled: true,
                value: val,
              } satisfies GptModel;
            }
            const val = typeof m.value === 'string'
              ? this.normalizeModelForPayload(m.value)
              : m.value;
            return {
              description: m.description ?? '',
              displayName: m.displayName || m.value,
              isDefault: !!m.isDefault,
              isEnabled: m.isEnabled !== false,
              value: val,
            } satisfies GptModel;
          })
          .filter((m: GptModel) => m.isEnabled !== false && !!m.value);

        this.loadingModels.set(false);
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error(err);
        this.modelsList = [];
        this.toastService.show('Failed to load models', 'error');
        this.loadingModels.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  filterModelRadios(): { label: string; value: string }[] {
    return this.modelsList.map((m) => ({
      label: m.displayName || m.value,
      value: m.value,
    }));
  }

  getSelectedModels(): string[] {
    const raw = this.filterForm.get('models')?.value;
    return Array.isArray(raw) ? raw.filter((m): m is string => !!m) : [];
  }

  // perf-ignore
  isModelSelected(value: string): boolean {
    if (this.filterForm.get('modelMatchAll')?.value) {
      return true;
    }
    return this.getSelectedModels().includes(value);
  }

  toggleModel(value: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;
    const allOptions = this.filterModelRadios().map((o) => o.value);

    // While "All models" is active every tile shows as checked. Unchecking one
    // switches to individual selection of all the remaining models.
    if (this.filterForm.get('modelMatchAll')?.value) {
      if (!checked) {
        this.filterForm.patchValue({
          modelMatchAll: false,
          models: allOptions.filter((v) => v !== value),
        });
      }
      return;
    }

    const models = [...this.getSelectedModels()];
    const idx = models.indexOf(value);
    if (checked && idx < 0) {
      models.push(value);
    } else if (!checked && idx >= 0) {
      models.splice(idx, 1);
    }

    const allIndividualSelected =
      allOptions.length > 0 && allOptions.every((v) => models.includes(v));

    if (allIndividualSelected) {
      this.filterForm.patchValue({ models: [], modelMatchAll: true });
      return;
    }

    this.filterForm.patchValue({ models });
  }

  onModelMatchAllChange(): void {
    if (this.filterForm.get('modelMatchAll')?.value) {
      this.filterForm.patchValue({ models: [] });
    }
  }

  // ── Username search (autocomplete) ───────────────────────────
  onUsernameSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.userSearchInput = val;
    if (this.usernameFilterError) {
      this.usernameFilterError = '';
    }
    this.searchUsers(val);
  }

  searchUsers(query: string): void {
    this.filterForm.patchValue({ username: query });

    const term = (query ?? '').trim();
    if (this.usernameSearchTimer) {
      clearTimeout(this.usernameSearchTimer);
    }

    if (term.length < 2) {
      this.userSearchResults = [];
      return;
    }

    // Debounce so we don't hit the API on every keystroke
    this.usernameSearchTimer = setTimeout(() => {
      this.chatService
        .searchFilterUsernames({ bot_type: 'kumaran', username: term })
        .subscribe({
 // perf-ignore
          next: (res: any) => {
            const selected = new Set(
              (this.filterForm.get('usernames')?.value as string[]) ?? [],
            );
            const names: string[] = Array.isArray(res?.username) ? res.username : [];
            this.userSearchResults = names.filter((name) => !selected.has(name));
            this.cdr.markForCheck();
          },
          error: (err: any) => {
            console.error('Username search failed:', err);
            this.userSearchResults = [];
            this.toastService.show('Failed to search users', 'error');
            this.cdr.markForCheck();
          },
        });
    }, 300);
  }

  addUsername(username: string): void {
    const current = (this.filterForm.get('usernames')?.value as string[]) ?? [];
    if (!current.includes(username)) {
      this.filterForm.patchValue({ usernames: [...current, username] });
    }
    this.userSearchInput = '';
    this.userSearchResults = [];
    this.usernameFilterError = '';
  }

  removeUsername(username: string): void {
    const current = (this.filterForm.get('usernames')?.value as string[]) ?? [];
    this.filterForm.patchValue({
      usernames: current.filter((u) => u !== username),
    });
  }

  private downloadBlob(blob: Blob, filename: string): void {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.setTimeout(() => window.URL.revokeObjectURL(url), 10_000);
  }

  private nowStamp(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}`;
  }

  exportUsers(): void {
    if (this.exportingUsers) return;
    this.exportingUsers = true;
    this.chatService
      .exportAllUsersXlsx?.({ bot_type: 'kumaran', timezone_offset: 'Asia/Calcutta' })
      ?.subscribe({
 // perf-ignore
        next: (blob: Blob) => {
          try {
            if (!blob?.size) {
              throw new Error('Export returned empty file');
            }
            this.downloadBlob(blob, `users_all_${this.nowStamp()}.xlsx`);
            this.toastService.show('Users exported successfully', 'success', 4500, 'bottom-banner');
          } catch (e) {
            console.error(e);
            this.toastService.show('Export failed', 'error');
          } finally {
            this.exportingUsers = false;
            this.cdr.markForCheck();
          }
        },
        error: (err: unknown) => {
          console.error(err);
          this.toastService.show('Export failed', 'error');
          this.exportingUsers = false;
          this.cdr.markForCheck();
        },
      });
  }

  private buildClientSecretsPayload(page: number): Record<string, string> {
    const payload: Record<string, string> = {
      bot_type: 'kumaran',
      page: String(page),
      limit: String(this.clientSecretsPageSize),
    };
    const search = this.clientSecretsSearch.trim();
    if (search) {
      payload['search'] = search;
    }
    return payload;
  }

  private applyClientSecretsResponse(res: any, targetPage: number): void {
    const list = this.normalizeClientSecrets(res);
    this.clientSecrets = list;
    this.clientSecretsPage =
      Number(res?.page ?? targetPage) || targetPage;
    this.clientSecretsPageSize =
      Number(res?.limit ?? this.clientSecretsPageSize) ||
      this.clientSecretsPageSize;

    const totalFromApi = Number(res?.total ?? res?.count ?? NaN);
    this.clientSecretsTotal = !Number.isNaN(totalFromApi)
      ? totalFromApi
      : list.length;
    this.clientSecretsTotalPages = Math.max(
      1,
      Number(res?.total_pages ?? 1) ||
        Math.ceil(this.clientSecretsTotal / this.clientSecretsPageSize) ||
        1,
    );
  }

  /**
   * Consolidates initial fetch of /reporting/api/report/projects (page 1, limit 10).
   * Populates client secrets, daily token usage rows, and token usage snapshot in a single request.
   */
  loadInitialProjectsData(): void {
    this.loadingClientSecrets = true;
    this.loadingDailyTokenUsage = true;
    this.reportingApi
      .getProjectList({
        bot_type: 'kumaran',
        page: '1',
        limit: '10',
      })
      .subscribe({
        next: (res: any) => {
          this.applyClientSecretsResponse(res, 1);
          this.loadingClientSecrets = false;

          this.applyDailyTokenUsageResponse(res, 1);
          this.loadingDailyTokenUsage = false;

          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading initial projects data:', err);
          this.clientSecrets = [];
          this.clientSecretsTotal = 0;
          this.clientSecretsTotalPages = 1;
          this.loadingClientSecrets = false;

          this.dailyTokenUsageRows = [];
          this.dailyTokenUsageTotal = 0;
          this.dailyTokenUsageTotalPages = 1;
          this.loadingDailyTokenUsage = false;
          this.toastService.show('Failed to load projects data', 'error');
          this.cdr.markForCheck();
        },
      });
  }

  loadProjectList(options?: { page?: number; onLoaded?: () => void }): void {
    const targetPage = options?.page ?? this.clientSecretsPage;
    const onLoaded = options?.onLoaded;
    this.loadingClientSecrets = true;
    this.reportingApi
      .getProjectList(this.buildClientSecretsPayload(targetPage))
      .subscribe({
 // perf-ignore
        next: (res: any) => {
          this.applyClientSecretsResponse(res, targetPage);

          if (this.clientSecrets.length === 0 && this.clientSecretsTotal > 0 && targetPage > 1) {
            this.loadProjectList({
              page: this.clientSecretsTotalPages,
              onLoaded,
            });
            return;
          }

          this.loadingClientSecrets = false;
          onLoaded?.();
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading client secrets:', err);
          this.clientSecrets = [];
          this.clientSecretsTotal = 0;
          this.clientSecretsTotalPages = 1;
          this.loadingClientSecrets = false;
          this.toastService.show('Failed to load client secrets', 'error');
          this.cdr.markForCheck();
        },
      });
  }

  private normalizeClientSecrets(res: any): any[] {
    if (!res) return [];
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.data)) return res.data;
    if (Array.isArray(res?.projects)) return res.projects;
    if (Array.isArray(res?.data?.data)) return res.data.data;
    return [];
  }

  copyToClipboard(value: string) {
    navigator.clipboard.writeText(value).then(() => {
      this.toastService.show('Copied to clipboard!', 'success');
    });
  }

  get clientSecretsPageNumbers(): number[] {
    return this.buildVisiblePageNumbers(
      this.clientSecretsPage,
      this.clientSecretsTotalPages,
    );
  }

  get displayedClientSecrets(): any[] {
    const query = this.clientSecretsSearch.trim().toLowerCase();
    if (!query) {
      return this.clientSecrets;
    }
    return this.clientSecrets.filter((cs) =>
      this.clientSecretMatchesSearch(cs, query),
    );
  }

  get hasClientSecretsSearch(): boolean {
    return this.clientSecretsSearch.trim().length > 0;
  }

  onClientSecretsSearchInput(value: string): void {
    this.clientSecretsSearch = value;
    if (this.clientSecretsSearchTimer) {
      clearTimeout(this.clientSecretsSearchTimer);
    }
    this.clientSecretsSearchTimer = setTimeout(() => {
      this.clientSecretsPage = 1;
      this.loadProjectList({ page: 1 });
    }, 300);
  }

  clearClientSecretsSearch(): void {
    if (!this.clientSecretsSearch) return;
    this.clientSecretsSearch = '';
    this.clientSecretsPage = 1;
    this.loadProjectList({ page: 1 });
  }

  private clientSecretMatchesSearch(cs: any, query: string): boolean {
    const haystack = [
      cs?.username,
      cs?.project_id,
      cs?.client_secret,
      cs?.requests_per_day,
      cs?.tokens_per_day,
      cs?.token_resetted_at,
    ]
      .map((value) => String(value ?? '').toLowerCase())
      .join(' ');
    return haystack.includes(query);
  }

  goToClientSecretsPage(page: number): void {
    if (
      page < 1 ||
      page > this.clientSecretsTotalPages ||
      page === this.clientSecretsPage
    ) {
      return;
    }
    this.loadProjectList({ page });
  }

  // perf-ignore
  clientSecretRowKey(cs: any): string {
    return String(cs?.id ?? `${cs?.username ?? ''}-${cs?.project_id ?? ''}`);
  }

  removeClientSecret(cs: any): void {
    const key = this.clientSecretRowKey(cs);
    if (this.removingClientSecrets[key]) {
      return;
    }
    this.removingClientSecrets[key] = true;
    this.chatService
      .revokeUser({
        username: cs.username,
        project_id: cs.project_id,
      })
      .subscribe({
 // perf-ignore
        next: () => {
          this.toastService.show(
            'Client credential removed successfully',
            'success',
            4500,
            'bottom-banner',
          );
          this.removingClientSecrets[key] = false;
          this.loadProjectList();
          this.loadRevokedUsers();
          this.cdr.markForCheck();
        },
        error: () => {
          this.errorMsg = 'Failed to remove client secret';
          this.removingClientSecrets[key] = false;
          this.cdr.markForCheck();
        },
      });
  }

  loadRevokedUsers(page?: number): void {
    const targetPage = page ?? this.revokedUsersPage;
    this.loadingRevokedUsers = true;
    this.chatService
      .getRevokedUsers({
        bot_type: 'kumaran',
        page: String(targetPage),
        limit: String(this.revokedUsersPageSize),
      })
      .subscribe({
 // perf-ignore
        next: (res: any) => {
          this.revokedUsers = this.normalizeRevokedUsers(res);
          this.revokedUsersPage = Number(res?.page ?? targetPage) || targetPage;
          this.revokedUsersPageSize =
            Number(res?.limit ?? this.revokedUsersPageSize) || this.revokedUsersPageSize;
          this.revokedUsersTotal = Number(res?.total ?? res?.count ?? 0) || 0;
          this.revokedUsersTotalPages = Math.max(
            1,
            Number(res?.total_pages ?? 1) || 1,
          );

          if (
            this.revokedUsers.length === 0 &&
            this.revokedUsersTotal > 0 &&
            targetPage > 1
          ) {
            this.loadRevokedUsers(this.revokedUsersTotalPages);
            return;
          }

          this.loadingRevokedUsers = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading revoked users:', err);
          this.revokedUsers = [];
          this.revokedUsersTotal = 0;
          this.revokedUsersTotalPages = 1;
          this.loadingRevokedUsers = false;
          this.toastService.show('Failed to load revoked users', 'error');
          this.cdr.markForCheck();
        },
      });
  }

  get revokedUsersPageNumbers(): number[] {
    return this.buildVisiblePageNumbers(
      this.revokedUsersPage,
      this.revokedUsersTotalPages,
    );
  }

  goToRevokedUsersPage(page: number): void {
    if (
      page < 1 ||
      page > this.revokedUsersTotalPages ||
      page === this.revokedUsersPage
    ) {
      return;
    }
    this.loadRevokedUsers(page);
  }

  private normalizeRevokedUsers(res: any): RevokedUserRow[] {
    const list = res?.data ?? res?.revoked_users ?? res;
    if (!Array.isArray(list)) return [];
    return list.map((row: any) => ({
      username: String(row?.username ?? row?.email ?? row?.user_name ?? '—'),
      project_id: String(row?.project_id ?? row?.projectId ?? '—'),
      revoked_at: row?.revoked_at ?? row?.revokedAt ?? row?.created_at ?? null,
    }));
  }

  // perf-ignore
  revokedUserRowKey(row: RevokedUserRow): string {
    return `${row.username}-${row.project_id}`;
  }

  restoreRevokedUser(row: RevokedUserRow): void {
    const key = this.revokedUserRowKey(row);
    if (this.restoringRevokedUsers[key]) return;

    this.restoringRevokedUsers[key] = true;
    this.chatService
      .activateUser({
        username: row.username,
        project_id: row.project_id,
      })
      .subscribe({
 // perf-ignore
        next: () => {
          this.restoringRevokedUsers[key] = false;
          this.toastService.show(
            'User access restored successfully',
            'success',
            4500,
            'bottom-banner',
          );
          this.loadRevokedUsers();
          this.loadRegisteredUsers();
          this.loadProjectList();
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error restoring user:', err);
          this.restoringRevokedUsers[key] = false;
          this.toastService.show('Failed to restore user access', 'error');
          this.cdr.markForCheck();
        },
      });
  }


  private applyDailyTokenUsageResponse(res: any, targetPage: number): void {
    this.dailyTokenUsageRows = this.normalizeDailyTokenUsageRows(res);
    this.dailyTokenUsagePage = Number(res?.page ?? targetPage) || targetPage;
    this.dailyTokenUsagePageSize =
      Number(res?.limit ?? this.dailyTokenUsagePageSize) || this.dailyTokenUsagePageSize;
    this.dailyTokenUsageTotal = Number(res?.total ?? res?.count ?? 0) || 0;
    this.dailyTokenUsageTotalPages = Math.max(
      1,
      Number(res?.total_pages ?? 1) ||
        Math.ceil(this.dailyTokenUsageTotal / this.dailyTokenUsagePageSize) ||
        1,
    );

    if (targetPage === 1) {
      this.tokenUsage = Array.isArray(res) ? res : res?.data ?? res?.projects ?? [];
      this.tokenUsageTotalCount = this.dailyTokenUsageTotal;
    }
  }

  // ── Daily Token Usage ──────────────────────────────────────
  loadDailyTokenUsage(page?: number): void {
    const targetPage = page ?? this.dailyTokenUsagePage;
    this.loadingDailyTokenUsage = true;
    this.reportingApi
      .getProjectList({
        bot_type: 'kumaran',
        page: String(targetPage),
        limit: String(this.dailyTokenUsagePageSize),
      })
      .subscribe({
        next: (res: any) => {
          this.applyDailyTokenUsageResponse(res, targetPage);

          if (
            this.dailyTokenUsageRows.length === 0 &&
            this.dailyTokenUsageTotal > 0 &&
            targetPage > 1
          ) {
            this.loadDailyTokenUsage(this.dailyTokenUsageTotalPages);
            return;
          }

          this.loadingDailyTokenUsage = false;
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error loading daily token usage:', err);
          this.dailyTokenUsageRows = [];
          this.dailyTokenUsageTotal = 0;
          this.dailyTokenUsageTotalPages = 1;
          this.loadingDailyTokenUsage = false;
          this.toastService.show('Failed to load daily token usage', 'error');
          this.cdr.markForCheck();
        },
      });
  }

  private normalizeDailyTokenUsageRows(res: any): DailyTokenUsageRow[] {
    const list = res?.data ?? res?.projects ?? res;
    if (!Array.isArray(list)) return [];
    return list.map((row: any) => ({
      id: Number(row?.id ?? 0),
      username: String(row?.username ?? '—'),
      project_id: String(row?.project_id ?? '—'),
      token_resetted_at: row?.token_resetted_at ?? null,
      tokens_used_today: Number(row?.tokens_used_today ?? 0) || 0,
      tokens_per_day: Number(row?.tokens_per_day ?? 0) || 0,
      tokens_remaining_today: Number(row?.tokens_remaining_today ?? 0) || 0,
      requests_used_today: Number(row?.requests_used_today ?? 0) || 0,
      requests_per_day: Number(row?.requests_per_day ?? 0) || 0,
      requests_remaining_today: Number(row?.requests_remaining_today ?? 0) || 0,
    }));
  }

  get displayedDailyTokenUsageRows(): DailyTokenUsageRow[] {
    if (!this.dailyTokenUsageSortColumn) return this.dailyTokenUsageRows;
    const col = this.dailyTokenUsageSortColumn;
    const dir = this.dailyTokenUsageSortDir === 'asc' ? 1 : -1;
    return [...this.dailyTokenUsageRows].sort((a, b) => {
      let cmp = 0;
      if (col === 'username') {
        cmp = a.username.localeCompare(b.username, undefined, { sensitivity: 'base' });
      } else if (col === 'project_id') {
        cmp = a.project_id.localeCompare(b.project_id, undefined, { sensitivity: 'base' });
      } else if (col === 'token_resetted_at') {
        const da = a.token_resetted_at ? new Date(a.token_resetted_at).getTime() : 0;
        const db = b.token_resetted_at ? new Date(b.token_resetted_at).getTime() : 0;
        cmp = da - db;
      } else if (col === 'tokens_used_today') {
        cmp = a.tokens_used_today - b.tokens_used_today;
      } else if (col === 'status') {
        const sa = this.isTokenResetEligible(a) ? 1 : 0;
        const sb = this.isTokenResetEligible(b) ? 1 : 0;
        cmp = sa - sb;
      }
      return cmp * dir;
    });
  }

  isTokenResetEligible(row: DailyTokenUsageRow): boolean {
    const used = Number(row?.tokens_used_today ?? 0);
    const limit = Number(row?.tokens_per_day ?? 0);
    const remaining = Number(row?.tokens_remaining_today ?? 0);
    return used >= limit || remaining <= 0;
  }

  sortDailyTokenUsage(column: DailyTokenUsageSortColumn): void {
    if (this.dailyTokenUsageSortColumn === column) {
      this.dailyTokenUsageSortDir = this.dailyTokenUsageSortDir === 'asc' ? 'desc' : 'asc';
    } else {
      this.dailyTokenUsageSortColumn = column;
      this.dailyTokenUsageSortDir = 'asc';
    }
  }

  // perf-ignore
  dailyTokenUsageSortStroke(
    column: DailyTokenUsageSortColumn,
    direction: 'asc' | 'desc',
  ): string {
    if (this.dailyTokenUsageSortColumn !== column) {
      return '#757575';
    }
    return this.dailyTokenUsageSortDir === direction ? '#49ab74' : '#757575';
  }

  get dailyTokenUsagePageNumbers(): number[] {
    return this.buildVisiblePageNumbers(
      this.dailyTokenUsagePage,
      this.dailyTokenUsageTotalPages,
    );
  }

  goToDailyTokenUsagePage(page: number): void {
    if (
      page < 1 ||
      page > this.dailyTokenUsageTotalPages ||
      page === this.dailyTokenUsagePage
    ) {
      return;
    }
    this.loadDailyTokenUsage(page);
  }

  // perf-ignore
  dailyTokenUsageRowKey(row: DailyTokenUsageRow): string {
    return String(row?.id ?? `${row?.username ?? ''}-${row?.project_id ?? ''}`);
  }

  resetDailyToken(row: DailyTokenUsageRow): void {
    if (!this.isTokenResetEligible(row)) return;
    const key = this.dailyTokenUsageRowKey(row);
    if (this.resettingDailyTokens[key]) return;

    this.resettingDailyTokens[key] = true;
    this.cdr.markForCheck();

    this.chatService
      .resetApiUser({
        username: row.username,
        project_id: row.project_id,
      })
      .subscribe({
        next: () => {
          this.resettingDailyTokens[key] = false;
          this.toastService.show(
            'Token reset successfully',
            'success',
            4500,
            'bottom-banner',
          );
          this.loadDailyTokenUsage();
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error('Error resetting token:', err);
          this.resettingDailyTokens[key] = false;
          this.toastService.show('Failed to reset token', 'error');
          this.cdr.markForCheck();
        },
      });
  }
  private loadTokenUsageSnapshot(): void {
    this.reportingApi
      .getProjectList({
        bot_type: 'kumaran',
        page: '1',
        limit: '10',
      })
      .subscribe({
 // perf-ignore
        next: (res: any) => {
          const list = Array.isArray(res) ? res : res?.data ?? res?.projects ?? [];
          this.tokenUsage = list;
          this.tokenUsageTotalCount =
            Number(res?.total ?? res?.count ?? list.length) || 0;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          console.error('Error loading token usage snapshot from /reporting/api/report/projects:', error);
          this.cdr.markForCheck();
        },
      });
  }

  /** Shows up to 5 page buttons per block (1–5, 6–10, …) with Back/Next for the rest. */
  private buildVisiblePageNumbers(
    currentPage: number,
    totalPages: number,
    maxVisible = 5,
  ): number[] {
    if (totalPages <= 0) return [];
    if (totalPages <= maxVisible) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const blockStart =
      Math.floor((currentPage - 1) / maxVisible) * maxVisible + 1;
    const blockEnd = Math.min(blockStart + maxVisible - 1, totalPages);

    return Array.from(
      { length: blockEnd - blockStart + 1 },
      (_, index) => blockStart + index,
    );
  }

  private loadUsageAnalyticsCards(): void {
    this.loadingTopUsageContributors = true;
    this.loadingModelUsageBreakdown = true;

    this.reportingApi
      .getOverallTokensUsage({ bot_type: 'kumaran' })
      .subscribe({
 // perf-ignore
        next: (res: any) => {
          const userWise = Array.isArray(res?.user_wise) ? res.user_wise : [];
          const modelWise = Array.isArray(res?.model_wise) ? res.model_wise : [];

          this.topUsageContributors = [...userWise]
            .sort(
              (a, b) =>
                (Number(b?.total_tokens) || 0) - (Number(a?.total_tokens) || 0),
            )
            .slice(0, 5)
            .map((item: any, index: number) => ({
              name: this.formatContributorDisplayName(
                String(item?.username ?? ''),
              ),
              tokens: Number(item?.total_tokens ?? 0) || 0,
              color:
                this.contributorColors[index % this.contributorColors.length],
            }));

          const modelRows: ModelBreakdownRow[] = [...modelWise]
            .sort(
              (a, b) =>
                (Number(b?.total_tokens) || 0) - (Number(a?.total_tokens) || 0),
            )
            .slice(0, 4)
            .map((item: any, index: number) => ({
              modelName: String(item?.model_name ?? 'Unknown'),
              tokens: Number(item?.total_tokens ?? 0) || 0,
              percent: 0,
              color:
                this.modelBreakdownColors[
                  index % this.modelBreakdownColors.length
                ],
            }));

          this.applyModelBreakdownRows(modelRows);
          this.loadingTopUsageContributors = false;
          this.loadingModelUsageBreakdown = false;
          this.cdr.markForCheck();
        },
        error: (error: unknown) => {
          console.error('Error loading overall tokens usage:', error);
          this.topUsageContributors = [];
          this.modelUsageBreakdown = [];
          this.modelBreakdownTotal = 0;
          this.loadingTopUsageContributors = false;
          this.loadingModelUsageBreakdown = false;
          this.cdr.markForCheck();
        },
      });
  }

  private applyModelBreakdownRows(rows: ModelBreakdownRow[]): void {
    const total = rows.reduce((sum, row) => sum + row.tokens, 0);
    this.modelBreakdownTotal = total;
    this.modelUsageBreakdown = rows.map((row) => ({
      ...row,
      percent: total > 0 ? Math.round((row.tokens / total) * 100) : 0,
    }));
  }

  // perf-ignore
  topContributorBarWidth(tokens: number): string {
    const max = this.topUsageContributors[0]?.tokens ?? 0;
    if (max <= 0) return '0%';
    const pct = Math.max(4, Math.round((tokens / max) * 100));
    return `${pct}%`;
  }

  modelBreakdownDonutStyle(): string {
    const rows = this.modelUsageBreakdown;
    if (!rows.length) {
      return 'conic-gradient(#e5e7eb 0deg 360deg)';
    }

    let cumulative = 0;
    const stops: string[] = [];
    for (const row of rows) {
      const start = cumulative;
      cumulative += row.percent;
      stops.push(`${row.color} ${start * 3.6}deg ${cumulative * 3.6}deg`);
    }
    if (cumulative < 100) {
      stops.push(`#e5e7eb ${cumulative * 3.6}deg 360deg`);
    }
    return `conic-gradient(${stops.join(', ')})`;
  }

  // perf-ignore
  formatTokensShort(value: number): string {
    const n = Number(value) || 0;
    if (n >= 1_000_000) {
      const millions = n / 1_000_000;
      return Number.isInteger(millions)
        ? `${millions}M`
        : `${millions.toFixed(1)}M`;
    }
    if (n >= 1_000) {
      const thousands = n / 1_000;
      return Number.isInteger(thousands)
        ? `${thousands}K`
        : `${thousands.toFixed(1)}K`;
    }
    return n.toLocaleString();
  }

  private formatContributorDisplayName(raw: string): string {
    const value = raw.trim();
    if (!value) return '—';

    const local = value.includes('@') ? value.split('@')[0] : value;
    const parts = local
      .replace(/[._-]+/g, ' ')
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());

    if (parts.length >= 2) {
      return `${parts[0]} ${parts[1].charAt(0).toUpperCase()}`;
    }
    if (parts.length === 1) {
      return parts[0];
    }
    return value;
  }
}
