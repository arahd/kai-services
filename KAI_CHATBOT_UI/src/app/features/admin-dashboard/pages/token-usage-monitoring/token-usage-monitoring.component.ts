import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, EventEmitter, HostListener, OnDestroy, OnInit, Output, inject } from '@angular/core';
import { EMPTY, Subject, Subscription, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, map, switchMap, tap } from 'rxjs/operators';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';
import { SessionStorageService } from '@core/services/session-storage.service';

/** Wait after last keystroke before calling the search API. */
const TOKEN_USAGE_SEARCH_DEBOUNCE_MS = 1000;
/** Minimum characters required before a server search runs. */
const TOKEN_USAGE_SEARCH_MIN_LENGTH = 2;

/** Server-side sort columns accepted by POST /auth/users/sorted. */
export type TokenUsageSortColumn =
  | 'user_id'
  | 'day'
  | 'tokens_used'
  | 'is_blocked'
  | 'allow_sensitive_search';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-token-usage-monitoring',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './token-usage-monitoring.component.html',
  styleUrl: './token-usage-monitoring.component.scss',
})
export class TokenUsageMonitoringComponent implements OnInit, OnDestroy {
  private chatService = inject(ChatService);
  private toastService = inject(ToastService);
  private tokenService = inject(TokenService);
  private storageService = inject(SessionStorageService);
  private cdr = inject(ChangeDetectorRef);

  errorMsg = '';
  @Output() activeUserCountChange = new EventEmitter<number>();
  // Token usage section
  tokenUsage: any[] = [];
  loadingTokenUsage = true;
  tokenUsagePageLoading = false;
  tokenUsagePage = 1;
  tokenUsageTotalPages = 1;
  tokenUsageTotalCount = 0;
  tokenUsageLimit = 10;
  tokenUsagePageInput = 1;
  loadingUsers: { [key: string]: boolean } = {}; // Track loading state per user
  loadingSensitiveQuestions: { [key: string]: boolean } = {};
  /** Cached allow_sensitive_search status per userId (null = unknown/unloaded). */
  allowSensitiveByUserId: { [key: string]: boolean | null } = {};
  loadingAllowSensitiveByUserId: { [key: string]: boolean } = {};
  tokenUsageActionsMenuUserId: string | null = null;
  /** Debounced server search query for token usage rows. */
  tokenUsageSearchQuery = '';
  tokenUsageSearchLoading = false;
  private readonly tokenUsageSearchInput$ = new Subject<string>();
  private tokenUsageSearchSub?: Subscription;
  /** Active server sort column (null = default unsorted list). */
  tokenUsageSortColumn: TokenUsageSortColumn | null = null;
  tokenUsageSortDir: 'asc' | 'desc' = 'desc';
  readonly tokenUsageTableColumns: ReadonlyArray<{
    key: TokenUsageSortColumn;
    label: string;
  }> = [
    { key: 'user_id', label: 'USER ID' },
    { key: 'day', label: 'OBSERVED DATE' },
    { key: 'tokens_used', label: 'TOKENS USED' },
    { key: 'is_blocked', label: 'USER STATUS' },
    { key: 'allow_sensitive_search', label: 'SENSITIVE Q ACCESS' },
  ];

  ngOnInit(): void {
    this.loadTokenUsage();
    this.tokenUsageSearchSub = this.tokenUsageSearchInput$
      .pipe(
        debounceTime(TOKEN_USAGE_SEARCH_DEBOUNCE_MS),
        distinctUntilChanged(),
        switchMap((raw) => {
          const term = raw.trim();
          if (!term) {
            this.tokenUsageSearchLoading = false;
            this.loadTokenUsage(1);
            return EMPTY;
          }
          if (term.length < TOKEN_USAGE_SEARCH_MIN_LENGTH) {
            this.tokenUsageSearchLoading = false;
            return EMPTY;
          }
          this.tokenUsageSearchLoading = true;
          return this.chatService.searchTokenUsageUsers(term).pipe(
            map((res) => this.normalizeTokenUsageSearchResponse(res)),
            catchError((error) => {
              console.error('Token usage search failed:', error);
              this.tokenUsageSearchLoading = false;
              this.toastService.show('Failed to search users', 'error');
              return of(null);
            }),
          );
        }),
        tap(() => {
          this.tokenUsageSearchLoading = false;
          this.cdr.markForCheck();
        }),
      )
      .subscribe((rows) => {
        if (rows == null) {
          return;
        }
        this.tokenUsage = rows;
        this.preloadAllowSensitiveForTokenUsageRows(this.tokenUsage);
        this.tokenUsagePage = 1;
        this.tokenUsagePageInput = 1;
        this.tokenUsageTotalPages = 1;
        this.tokenUsageTotalCount = rows.length;
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.tokenUsageSearchSub?.unsubscribe();
  }

  get isTokenUsageSearchActive(): boolean {
    return this.tokenUsageSearchQuery.trim().length >= TOKEN_USAGE_SEARCH_MIN_LENGTH;
  }

  // ===================== TOKEN USAGE METHODS =====================

  loadTokenUsage(page?: number): void {
    const targetPage = page ?? this.tokenUsagePage;
    if (this.isTokenUsageSearchActive) {
      return;
    }
    if (this.tokenUsageSortColumn) {
      this.loadSortedTokenUsage(targetPage);
      return;
    }

    const isFirstLoad =
      this.tokenUsageTotalCount === 0 && this.tokenUsage.length === 0;
    if (isFirstLoad) {
      this.loadingTokenUsage = true;
    } else {
      this.tokenUsagePageLoading = true;
    }
    this.chatService.getUserTokensDetails(targetPage, undefined, 10).subscribe({
      next: (res: any) => {
        this.applyTokenUsageListResponse(res, targetPage);
        this.loadingTokenUsage = false;
        this.tokenUsagePageLoading = false;
        this.cdr.markForCheck();
      },
      error: (error: any) => {
        console.error('Error loading token usage:', error);
        this.errorMsg = 'Failed to load token usage data';
        this.loadingTokenUsage = false;
        this.tokenUsagePageLoading = false;
        this.cdr.markForCheck();
      },
    });
  }

  private loadSortedTokenUsage(page: number): void {
    if (!this.tokenUsageSortColumn || this.isTokenUsageSearchActive) {
      return;
    }

    const isFirstLoad =
      this.tokenUsageTotalCount === 0 && this.tokenUsage.length === 0;
    if (isFirstLoad) {
      this.loadingTokenUsage = true;
    } else {
      this.tokenUsagePageLoading = true;
    }

    this.chatService
      .getSortedTokenUsageUsers({
        sort_by: this.tokenUsageSortColumn,
        order: this.tokenUsageSortDir,
        page,
      })
      .subscribe({
        next: (res: any) => {
          this.applySortedTokenUsageResponse(res, page);
          this.loadingTokenUsage = false;
          this.tokenUsagePageLoading = false;
          this.cdr.markForCheck();
        },
        error: (error: any) => {
          console.error('Error loading sorted token usage:', error);
          this.errorMsg = 'Failed to load sorted token usage data';
          this.loadingTokenUsage = false;
          this.tokenUsagePageLoading = false;
          this.toastService.show('Failed to sort token usage data', 'error');
          this.cdr.markForCheck();
        },
      });
  }

  private applyTokenUsageListResponse(res: any, targetPage: number): void {
    this.tokenUsage = res?.data ?? [];
    this.preloadAllowSensitiveForTokenUsageRows(this.tokenUsage);
    this.tokenUsagePage = res?.page ?? targetPage;
    this.tokenUsagePageInput = this.tokenUsagePage;
    this.tokenUsageTotalPages = Math.max(1, res?.total_pages ?? 1);
    this.tokenUsageTotalCount = res?.total_count ?? 0;
    this.tokenUsageLimit = res?.limit ?? 10;
    if (res?.active_user_count != null) {
      this.activeUserCountChange.emit(Number(res.active_user_count) || 0);
    }
  }

  private applySortedTokenUsageResponse(res: any, targetPage: number): void {
    let rows: any[] = [];
    if (Array.isArray(res)) {
      rows = res;
    } else if (res && typeof res === 'object') {
      rows = res.data ?? res.results ?? res.users ?? [];
    }

    this.tokenUsage = Array.isArray(rows) ? rows : [];
    this.preloadAllowSensitiveForTokenUsageRows(this.tokenUsage);

    const page = res?.page ?? targetPage;
    const limit = res?.limit ?? this.tokenUsageLimit ?? 10;
    this.tokenUsagePage = page;
    this.tokenUsagePageInput = page;
    this.tokenUsageLimit = limit;

    if (res?.total_pages != null || res?.total_count != null) {
      this.tokenUsageTotalPages = Math.max(1, res?.total_pages ?? 1);
      this.tokenUsageTotalCount = res?.total_count ?? this.tokenUsage.length;
      return;
    }

    const count = this.tokenUsage.length;
    if (count < limit) {
      this.tokenUsageTotalPages = page;
      this.tokenUsageTotalCount = (page - 1) * limit + count;
    } else {
      this.tokenUsageTotalPages = Math.max(this.tokenUsageTotalPages, page + 1);
      this.tokenUsageTotalCount = Math.max(
        this.tokenUsageTotalCount,
        page * limit,
      );
    }
  }

  goToTokenUsagePage(page: number | string): void {
    if (this.isTokenUsageSearchActive || page === '...') {
      return;
    }
    const targetPage = Number(page);
    if (
      Number.isNaN(targetPage) ||
      targetPage < 1 ||
      targetPage > this.tokenUsageTotalPages ||
      targetPage === this.tokenUsagePage
    ) {
      this.tokenUsagePageInput = this.tokenUsagePage;
      return;
    }
    this.loadTokenUsage(targetPage);
  }

  onTokenUsagePageInputSubmit(event: any): void {
    const inputValue = this.tokenUsagePageInput?.toString().trim();

    if (!inputValue) {
      this.tokenUsagePageInput = this.tokenUsagePage;
      return;
    }

    const val = Number(inputValue);

    if (!Number.isNaN(val) && val >= 1 && val <= this.tokenUsageTotalPages) {
      this.goToTokenUsagePage(val);
    } else {
      this.tokenUsagePageInput = this.tokenUsagePage;
      this.toastService.show(
        `Please enter a page between 1 and ${this.tokenUsageTotalPages}`,
        'error',
      );
    }
  }

  /** Rows for display — server-sorted when browsing; client-sorted during search. */
  get tokenUsageSortedRows(): any[] {
    if (!this.isTokenUsageSearchActive || !this.tokenUsageSortColumn) {
      return this.tokenUsage;
    }

    const rows = [...this.tokenUsage];
    const col = this.tokenUsageSortColumn;
    const dir = this.tokenUsageSortDir === 'asc' ? 1 : -1;
    rows.sort((a: any, b: any) => {
      let cmp = 0;
      switch (col) {
        case 'user_id':
          cmp = String(a?.user_id ?? '').localeCompare(
            String(b?.user_id ?? ''),
            undefined,
            { sensitivity: 'base', numeric: true },
          );
          break;
        case 'day': {
          const ta = new Date(a?.day).getTime();
          const tb = new Date(b?.day).getTime();
          cmp = (Number.isFinite(ta) ? ta : 0) - (Number.isFinite(tb) ? tb : 0);
          break;
        }
        case 'tokens_used':
          cmp = (Number(a?.tokens_used) || 0) - (Number(b?.tokens_used) || 0);
          break;
        case 'is_blocked':
          cmp = (a?.is_blocked ? 1 : 0) - (b?.is_blocked ? 1 : 0);
          break;
        case 'allow_sensitive_search':
          cmp =
            (a?.allow_sensitive_search ? 1 : 0) -
            (b?.allow_sensitive_search ? 1 : 0);
          break;
        default:
          cmp = 0;
      }
      return cmp * dir;
    });
    return rows;
  }

  /** First click on a column: descending; further clicks on that column toggle asc/desc. */
  toggleTokenUsageSort(column: TokenUsageSortColumn): void {
    if (this.tokenUsageSortColumn === column) {
      this.tokenUsageSortDir =
        this.tokenUsageSortDir === 'desc' ? 'asc' : 'desc';
    } else {
      this.tokenUsageSortColumn = column;
      this.tokenUsageSortDir = 'desc';
    }

    if (this.isTokenUsageSearchActive) {
      return;
    }

    this.loadSortedTokenUsage(1);
  }

  // perf-ignore
  isTokenUsageSortActive(column: TokenUsageSortColumn): boolean {
    return this.tokenUsageSortColumn === column;
  }

  // perf-ignore
  tokenUsageSortStroke(
    column: TokenUsageSortColumn,
    direction: 'asc' | 'desc',
  ): string {
    if (!this.isTokenUsageSortActive(column)) {
      return '#757575';
    }
    return this.tokenUsageSortDir === direction ? '#49ab74' : '#757575';
  }

  onTokenUsageSearchChange(value: string): void {
    this.tokenUsageSearchQuery = value;
    this.tokenUsageSearchInput$.next(value);
  }

  private normalizeTokenUsageSearchResponse(res: any): any[] {
    if (Array.isArray(res)) {
      return res;
    }
    if (Array.isArray(res?.data)) {
      return res.data;
    }
    return [];
  }

  /** Search the table for this user id via the server search API. */
  filterTokenUsageByUserId(userId: string): void {
    if (!userId) return;
    this.onTokenUsageSearchChange(userId);
  }

  clearTokenUsageSearch(): void {
    this.onTokenUsageSearchChange('');
  }

  get tokenUsageRangeStart(): number {
    if (this.tokenUsageTotalCount === 0) return 0;
    return (this.tokenUsagePage - 1) * this.tokenUsageLimit + 1;
  }

  get tokenUsageRangeEnd(): number {
    return Math.min(
      this.tokenUsagePage * this.tokenUsageLimit,
      this.tokenUsageTotalCount,
    );
  }

  get tokenUsagePageNumbers(): (number | string)[] {
    const total = this.tokenUsageTotalPages;
    const current = this.tokenUsagePage;

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
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.closeTokenUsageActionsMenu();
  }

  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    this.closeTokenUsageActionsMenu();
  }

  // perf-ignore
  isTokenUsageActionsMenuOpen(userId: string): boolean {
    return this.tokenUsageActionsMenuUserId === userId;
  }

  /** Last two visible rows: open the actions menu above the kebab trigger. */
  isTokenUsageActionsMenuAbove(rowIndex: number): boolean {
    const total = this.tokenUsageSortedRows.length;
    return total > 0 && rowIndex >= total - 2;
  }

  toggleTokenUsageActionsMenu(event: Event, userId: string): void {
    event.stopPropagation();
    const wasOpen = this.tokenUsageActionsMenuUserId === userId;
    this.tokenUsageActionsMenuUserId = wasOpen ? null : userId;
    if (!wasOpen) {
      this.loadAllowSensitiveStatus(userId);
    }
  }

  closeTokenUsageActionsMenu(): void {
    this.tokenUsageActionsMenuUserId = null;
  }

  /** Seed + fetch sensitive-access status for all rows on the current page. */
  private preloadAllowSensitiveForTokenUsageRows(rows: any[]): void {
    for (const row of rows ?? []) {
      const userId = row?.user_id;
      if (!userId || this.allowSensitiveByUserId[userId] !== undefined) {
        continue;
      }
      const fromRow = this.readAllowSensitiveFromTokenRow(row);
      if (fromRow !== null) {
        this.allowSensitiveByUserId[userId] = fromRow;
      }
    }

    const pending = new Set<string>();
    for (const row of rows ?? []) {
      const userId = row?.user_id;
      if (userId && this.allowSensitiveByUserId[userId] === undefined) {
        pending.add(userId);
      }
    }
    for (const userId of pending) {
      this.loadAllowSensitiveStatus(userId);
    }
  }

  private readAllowSensitiveFromTokenRow(row: any): boolean | null {
    const candidates = [
      row?.allow_sensitive_search,
      row?.allowSensitiveSearch,
      row?.allow_sensitive,
      row?.sensitive_allowed,
      row?.is_sensitive_allowed,
    ];
    const v = candidates.find((x) => x !== undefined);
    if (typeof v === 'boolean') return v;
    if (typeof v === 'string') {
      const s = v.toLowerCase();
      if (s === 'allowed' || s === 'true' || s === 'enabled') return true;
      if (s === 'restricted' || s === 'false' || s === 'disabled') return false;
    }
    return null;
  }

  private loadAllowSensitiveStatus(userId: string): void {
    if (!userId) return;
    if (this.loadingAllowSensitiveByUserId[userId]) return;
    // If we already have a value cached, don't refetch on every open.
    if (this.allowSensitiveByUserId[userId] !== undefined) return;

    this.loadingAllowSensitiveByUserId[userId] = true;
    this.chatService.getSensitiveQuestionsAllowance(userId).subscribe({
      next: (allowed) => {
        this.allowSensitiveByUserId[userId] = allowed;
        this.loadingAllowSensitiveByUserId[userId] = false;
        this.cdr.markForCheck();
      },
      error: () => {
        this.allowSensitiveByUserId[userId] = false;
        this.loadingAllowSensitiveByUserId[userId] = false;
        this.cdr.markForCheck();
      },
    });
  }

  onSensitiveQuestionsAction(
    userId: string,
    event: Event,
    nextAllow: boolean,
  ): void {
    event.stopPropagation();
    this.closeTokenUsageActionsMenu();
    if (this.loadingSensitiveQuestions[userId]) {
      return;
    }
    if (this.allowSensitiveByUserId[userId] === nextAllow) {
      return;
    }
    this.loadingSensitiveQuestions[userId] = true;

    this.chatService.setSensitiveQuestionsAllowance(userId, nextAllow).subscribe({
      next: () => {
        this.loadingSensitiveQuestions[userId] = false;
        this.allowSensitiveByUserId[userId] = nextAllow;
        this.toastService.show(
          nextAllow
            ? 'Sensitive questions enabled successfully'
            : 'Sensitive questions disabled successfully',
          'success',
          4500,
          'bottom-banner',
        );
        this.cdr.markForCheck();
      },
      error: () => {
        this.loadingSensitiveQuestions[userId] = false;
        this.toastService.show(
          nextAllow
            ? 'Failed to enable sensitive questions'
            : 'Failed to disable sensitive questions',
          'error',
        );
        this.cdr.markForCheck();
      },
    });
  }

  onTokenUsageMenuDisableUser(userId: string, event: Event): void {
    event.stopPropagation();
    this.closeTokenUsageActionsMenu();
    this.disableUser(userId);
  }

  onTokenUsageMenuEnableUser(userId: string, event: Event): void {
    event.stopPropagation();
    this.closeTokenUsageActionsMenu();
    this.enableUser(userId);
  }

  enableUser(userId: string): void {
    this.loadingUsers[userId] = true;

    this.chatService.unblockUser(userId).subscribe({
      next: (response: any) => {
        console.log('User enabled successfully:', response);
        // Update the user status in the tokenUsage array
        const userIndex = this.tokenUsage.findIndex(
          (u) => u.user_id === userId,
        );
        if (userIndex !== -1) {
          this.tokenUsage[userIndex].is_blocked = false;
        }

        // If the currently logged-in user was just unblocked, mark that we should
        // force a fresh "New Chat" on the next /chatbot navigation (prevents blank screen).
        try {
          const currentUser = this.tokenService.getUserInfo();
          const currentUserEmail = currentUser?.email || '';
          if (
            currentUserEmail &&
            userId &&
            currentUserEmail.toLowerCase() === userId.toLowerCase()
          ) {
            this.tokenService.setBlocked(false);
            this.storageService.setForceNewChat(true);
          }
        } catch {
          // ignore storage/parse errors
        }

        this.loadingUsers[userId] = false;
        this.cdr.markForCheck();

        // Show success message
        // this.showNotification(`User ${userId} has been enabled`, 'success');
      },
      error: (error: any) => {
        console.error('Error enabling user:', error);
        this.errorMsg = `Failed to enable user ${userId}`;
        this.loadingUsers[userId] = false;
        this.cdr.markForCheck();

        // Show error message
        // this.showNotification(`Failed to enable user ${userId}`, 'error');
      },
    });
  }

  disableUser(userId: string): void {
    this.loadingUsers[userId] = true;

    // Assuming you have a block-user API endpoint
    // If not, you'll need to create it or use an existing one
    this.chatService.blockUser(userId).subscribe({
      next: (response: any) => {
        console.log('User disabled successfully:', response);
        // Update the user status in the tokenUsage array
        const userIndex = this.tokenUsage.findIndex(
          (u) => u.user_id === userId,
        );
        if (userIndex !== -1) {
          this.tokenUsage[userIndex].is_blocked = true;
        }

        // If the currently logged-in user was blocked, persist the state so
        // UI flows can react accordingly.
        try {
          const currentUser = this.tokenService.getUserInfo();
          const currentUserEmail = currentUser?.email || '';
          if (
            currentUserEmail &&
            userId &&
            currentUserEmail.toLowerCase() === userId.toLowerCase()
          ) {
            this.tokenService.setBlocked(true);
            this.storageService.removeForceNewChat();
          }
        } catch {
          // ignore storage/parse errors
        }

        this.loadingUsers[userId] = false;
        this.cdr.markForCheck();

        // Show success message
        // this.showNotification(`User ${userId} has been disabled`, 'success');
      },
      error: (error: any) => {
        console.error('Error disabling user:', error);
        this.errorMsg = `Failed to disable user ${userId}`;
        this.loadingUsers[userId] = false;
        this.cdr.markForCheck();

        // Show error message
        // this.showNotification(`Failed to disable user ${userId}`, 'error');
      },
    });
  }

  formatDate(dateString: string): string {
    // Format the date string for display
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  tokenUsageMaxTokensOnPage(): number {
    const rows = this.tokenUsageSortedRows ?? [];
    let max = 0;
    for (const r of rows) {
      const v = Number(r?.tokens_used ?? 0) || 0;
      if (v > max) max = v;
    }
    return max;
  }

  // perf-ignore
  tokenUsageBarWidth(token: any): string {
    const max = this.tokenUsageMaxTokensOnPage();
    if (!max) return '0%';
    const v = Number(token?.tokens_used ?? 0) || 0;
    const pct = Math.max(0, Math.min(100, (v / max) * 100));
    // keep a visible sliver for non-zero values like the mock
    if (v > 0 && pct < 8) return '8%';
    return `${pct.toFixed(0)}%`;
  }

  tokenUserActive(token: any): boolean {
    return !token?.is_blocked;
  }

  tokenSensitiveAllowed(userId: string): boolean | null {
    const v = this.allowSensitiveByUserId?.[userId];
    if (v === true) return true;
    if (v === false) return false;
    return null;
  }

  allowSensitiveQuestions(userId: string, event: Event): void {
    event.stopPropagation();
    if (this.allowSensitiveByUserId?.[userId] === true) return;
    this.onSensitiveQuestionsAction(userId, event, true);
  }

  restrictSensitiveQuestions(userId: string, event: Event): void {
    event.stopPropagation();
    if (this.allowSensitiveByUserId?.[userId] === false) return;
    this.onSensitiveQuestionsAction(userId, event, false);
  }
}
