import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, ChangeDetectorRef, Component, HostListener, OnDestroy, OnInit, inject } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged } from 'rxjs/operators';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ChatService } from '@features/chatbot/services/chat.service';
import { ToastService } from '@core/services/toast.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { TokenService } from '@core/services/token.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

export interface BugAttachment {
  id: number;
  file_name: string;
  file_type: string;
  file_size: number;
  file_data?: string;
}

export interface BugReport {
  id: number;
  ticket_number: string;
  bug_name: string;
  description: string;
  attachments: BugAttachment[];
  created_by: string;
  created_at: string;
  updated_at: string | null;
  status: 'open' | 'Investigation' | 'closed';
}

export type BugReportStatusFilter = '' | 'open' | 'Investigation' | 'closed';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-bug-reports',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './bug-reports.component.html',
  styleUrl: './bug-reports.component.scss',
})
export class BugReportsComponent implements OnInit, OnDestroy {
  protected readonly Math = Math;
  bugReports: BugReport[] = [];
  loading = false;
  updatingStatus: { [ticketNumber: string]: boolean } = {};
  statusMenuOpen: { [ticketNumber: string]: boolean } = {};
  fetchingAttachment: { [attachmentId: number]: boolean } = {};
  readonly statusOptions: Array<{
    value: 'open' | 'Investigation' | 'closed';
    label: string;
  }> = [
    { value: 'open', label: 'Open' },
    { value: 'Investigation', label: 'Investigating' },
    { value: 'closed', label: 'Closed' },
  ];
  errorMsg = '';
  
  expandedTickets: { [key: string]: boolean } = {};
  previewAttachment: BugAttachment | null = null;
  attachmentPickerBug: BugReport | null = null;
  previewFileUrl: string | null = null;
  safePreviewUrl: SafeResourceUrl | null = null;
  previewTextContent: string | null = null;

  searchQuery = '';
  statusFilter: BugReportStatusFilter = '';
  filteredCount = 0;

  // Pagination
  page = 1;
  limit = 10;
  totalPages = 1;
  totalCount = 0;
  pageInput = 1;

  // Stats
  totalReports = 0;
  openCount = 0;
  investigationCount = 0;
  closedCount = 0;

  // Bot type selection (default kumaran)
  botType = 'kumaran';
  botTypes = ['kumaran'];

  // Current logged in user info (for header avatar)
  userFullName = '';
  userEmail = '';
  userInitials = '?';
  userMenuOpen = false;

  private readonly chatService = inject(ChatService);
  private readonly toastService = inject(ToastService);
  private readonly router = inject(Router);
  private readonly azureAd = inject(AzureAdService);
  private readonly tokenService = inject(TokenService);
  private readonly storageService = inject(SessionStorageService);
  private readonly sanitizer = inject(DomSanitizer);
  private readonly cdr = inject(ChangeDetectorRef);

  private readonly searchInput$ = new Subject<string>();
  private searchSub?: Subscription;

  ngOnInit(): void {
    this.loadUserInfo();
    this.loadBugReports();
    this.searchSub = this.searchInput$
      .pipe(debounceTime(400), distinctUntilChanged())
      .subscribe(() => this.applyFilters());
  }

  ngOnDestroy(): void {
    this.searchSub?.unsubscribe();
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
    this.storageService.clear();
    this.azureAd.logout();
  }

  private buildPayload(): {
    bot_type: string;
    page: number;
    limit: number;
    filter?: { search?: string; status?: string };
  } {
    const payload: {
      bot_type: string;
      page: number;
      limit: number;
      filter?: { search?: string; status?: string };
    } = {
      bot_type: this.botType,
      page: this.page,
      limit: this.limit,
    };

    const filter: { search?: string; status?: string } = {};
    const search = this.searchQuery.trim();
    if (search) {
      filter.search = search;
    }
    if (this.statusFilter) {
      filter.status = this.statusFilter;
    }
    if (Object.keys(filter).length > 0) {
      payload.filter = filter;
    }

    return payload;
  }

  private hasActiveFilter(): boolean {
    return !!this.searchQuery.trim() || !!this.statusFilter;
  }

  applyFilters(): void {
    if (this.loading) return;
    this.page = 1;
    this.pageInput = 1;
    this.loadBugReports();
  }

  clearFilters(): void {
    if (this.loading) return;
    this.searchQuery = '';
    this.statusFilter = '';
    this.applyFilters();
  }

  onSearchChange(value: string): void {
    if (this.loading) return;
    this.searchQuery = value;
    this.searchInput$.next(value.trim());
  }

  onStatusFilterChange(): void {
    if (this.loading) return;
    this.applyFilters();
  }

  loadBugReports(): void {
    this.loading = true;
    this.errorMsg = '';
    this.statusMenuOpen = {};

    this.chatService.getBugReports(this.buildPayload()).subscribe({
      next: (res) => {
        this.bugReports = res?.data ?? [];
        this.totalReports = res?.total_bug_count ?? 0;
        this.closedCount = res?.closed_bug_count ?? 0;
        this.openCount = res?.open_bug_count ?? 0;
        this.investigationCount = res?.investigation_bug_count ?? 0;
        this.filteredCount = res?.filtered_bug_count ?? 0;
        this.totalCount = this.hasActiveFilter()
          ? this.filteredCount
          : this.totalReports;
        this.page = res?.page ?? this.page;
        this.pageInput = this.page;
        this.limit = res?.limit ?? this.limit;
        this.totalPages = Math.ceil(this.totalCount / this.limit) || 1;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Error fetching bug reports:', err);
        this.errorMsg = 'Failed to load bug reports';
        this.loading = false;
        this.toastService.show('Failed to fetch bug reports', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  adjustCounts(oldStatus: string, newStatus: string) {
    // Decrement old status count
    if (oldStatus === 'open' && this.openCount > 0) this.openCount--;
    else if (oldStatus === 'Investigation' && this.investigationCount > 0) this.investigationCount--;
    else if (oldStatus === 'closed' && this.closedCount > 0) this.closedCount--;

    // Increment new status count
    if (newStatus === 'open') this.openCount++;
    else if (newStatus === 'Investigation') this.investigationCount++;
    else if (newStatus === 'closed') this.closedCount++;
  }

  @HostListener('document:click')
  closeStatusMenus(): void {
    if (Object.keys(this.statusMenuOpen).length > 0) {
      this.statusMenuOpen = {};
    }
  }

  // perf-ignore
  getStatusLabel(status: BugReport['status']): string {
    return this.statusOptions.find((option) => option.value === status)?.label ?? status;
  }

  // perf-ignore
  isStatusMenuOpen(ticketNumber: string): boolean {
    return !!this.statusMenuOpen[ticketNumber];
  }

  toggleStatusMenu(ticketNumber: string, event: Event): void {
    if (this.loading) return;
    event.stopPropagation();
    const isOpen = this.statusMenuOpen[ticketNumber];
    this.statusMenuOpen = {};
    if (!isOpen) {
      this.statusMenuOpen[ticketNumber] = true;
    }
  }

  selectStatus(
    bug: BugReport,
    newStatus: 'open' | 'Investigation' | 'closed',
    event: Event,
  ): void {
    event.stopPropagation();
    this.statusMenuOpen = {};
    this.changeStatus(bug, newStatus);
  }

  changeStatus(
    bug: BugReport,
    newStatus: 'open' | 'Investigation' | 'closed',
  ): void {
    if (this.loading) return;
    if (bug.status === newStatus) return;

    const oldStatus = bug.status;
    this.updatingStatus[bug.ticket_number] = true;
    const payload = {
      ticket_number: bug.ticket_number,
      state: newStatus,
    };

    this.chatService.updateBugStatus(payload).subscribe({
      next: (res) => {
        this.updatingStatus[bug.ticket_number] = false;
        bug.status = newStatus;
        this.toastService.show(
          `Ticket ${bug.ticket_number} status updated to ${newStatus}`,
          'success',
        );
        this.adjustCounts(oldStatus, newStatus);
        this.cdr.markForCheck();
      },
      error: (err) => {
        this.updatingStatus[bug.ticket_number] = false;
        console.error('Error updating status:', err);
        this.toastService.show(
          `Failed to update status for ${bug.ticket_number}`,
          'error',
        );
        this.cdr.markForCheck();
      },
    });
  }

  hasAttachments(bug: BugReport): boolean {
    return (bug.attachments?.length ?? 0) > 0;
  }

  // perf-ignore
  getAttachmentLabel(bug: BugReport): string {
    const count = bug.attachments?.length ?? 0;
    return count === 1 ? '1 File' : `${count} Files`;
  }

  openAttachments(bug: BugReport): void {
    if (this.loading) return;
    if (!this.hasAttachments(bug)) {
      this.toastService.show('No file attachment found', 'error');
      return;
    }
    if (bug.attachments.length === 1) {
      this.openPreview(bug.attachments[0]);
      return;
    }
    this.attachmentPickerBug = bug;
  }

  closeAttachmentPicker(): void {
    this.attachmentPickerBug = null;
  }

  private extractFileData(res: any): string {
    if (!res) return '';
    if (typeof res === 'string') return res;
    return (
      res.file_data ||
      res.data?.file_data ||
      res.data ||
      res.file_bytes ||
      res.image_bytes ||
      res.attachment_data ||
      res.content ||
      res.base64 ||
      ''
    );
  }

  private decodeAttachmentBlob(attachment: BugAttachment): Blob {
    let base64Data = attachment.file_data || '';
    if (base64Data.includes(',')) {
      base64Data = base64Data.split(',')[1];
    }
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], {
      type: attachment.file_type || 'application/octet-stream',
    });
  }

  downloadAttachment(attachment: BugAttachment): void {
    if (!attachment) {
      this.toastService.show('No file attachment found', 'error');
      return;
    }

    if (attachment.file_data) {
      this.triggerDownload(attachment);
      return;
    }

    if (!attachment.id) {
      this.toastService.show('No file attachment found', 'error');
      return;
    }

    this.fetchingAttachment[attachment.id] = true;
    this.cdr.markForCheck();

    this.chatService.getBugAttachment({ attachment_id: attachment.id }).subscribe({
      next: (res: any) => {
        this.fetchingAttachment[attachment.id] = false;
        const fileData = this.extractFileData(res);
        if (!fileData) {
          this.toastService.show('Failed to download attachment', 'error');
          this.cdr.markForCheck();
          return;
        }

        attachment.file_data = fileData;
        if (res?.file_type) attachment.file_type = res.file_type;
        if (res?.file_name) attachment.file_name = res.file_name;
        if (res?.file_size) attachment.file_size = res.file_size;

        this.triggerDownload(attachment);
      },
      error: (err: any) => {
        this.fetchingAttachment[attachment.id] = false;
        console.error('Failed to download attachment:', err);
        this.toastService.show('Failed to download attachment', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  private triggerDownload(attachment: BugAttachment): void {
    try {
      const blob = this.decodeAttachmentBlob(attachment);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = attachment.file_name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      this.toastService.show('Attachment downloaded successfully', 'success');
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to download attachment:', err);
      this.toastService.show('Failed to download attachment', 'error');
      this.cdr.markForCheck();
    }
  }

  goToPage(pageNumber: number): void {
    if (this.loading) return;
    if (
      pageNumber < 1 ||
      pageNumber > this.totalPages ||
      pageNumber === this.page
    ) {
      this.pageInput = this.page;
      return;
    }
    this.page = pageNumber;
    this.loadBugReports();
  }

  onPageInputSubmit(event: any): void {
    const val = Number(this.pageInput);
    if (!Number.isNaN(val) && val >= 1 && val <= this.totalPages) {
      this.goToPage(val);
    } else {
      this.pageInput = this.page;
      this.toastService.show(
        `Please enter a page between 1 and ${this.totalPages}`,
        'error',
      );
    }
  }

  formatDate(dateStr: string): string {
    if (!dateStr) return '-';
    // perf-ignore
    const datePart = this.formatReportDate(dateStr);
    // perf-ignore
    const timePart = this.formatReportTime(dateStr);
    if (datePart === '-' || timePart === '-') return dateStr;
    return `${datePart} ${timePart}`;
  }

  formatReportDate(dateStr: string): string {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  }

  formatReportTime(dateStr: string): string {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  }

  get paginationPages(): number[] {
    const maxVisible = 5;
    const total = this.totalPages;
    if (total <= 0) return [];
    if (total <= maxVisible) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    let start = Math.max(1, this.page - Math.floor(maxVisible / 2));
    let end = start + maxVisible - 1;
    if (end > total) {
      end = total;
      start = end - maxVisible + 1;
    }

    return Array.from({ length: end - start + 1 }, (_, i) => start + i);
  }

  // perf-ignore
  formatBytes(bytes: number | null): string {
    if (bytes === null || bytes === undefined) return '-';
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  toggleDescription(ticketNumber: string) {
    if (this.loading) return;
    this.expandedTickets[ticketNumber] = !this.expandedTickets[ticketNumber];
  }

  // perf-ignore
  isExpanded(ticketNumber: string): boolean {
    return !!this.expandedTickets[ticketNumber];
  }

  private isImageFile(fileName: string): boolean {
    return /\.(jpg|jpeg|png|gif|bmp|webp|svg)$/i.test(fileName);
  }

  private isPdfFile(fileName: string): boolean {
    return /\.pdf$/i.test(fileName);
  }

  private isTextFile(fileName: string): boolean {
    return /\.(txt|json|csv|xml|js|ts|html|css|py|java|cpp|md|sql)$/i.test(fileName);
  }

  get isPreviewImage(): boolean {
    if (!this.previewAttachment?.file_name) return false;
    return this.isImageFile(this.previewAttachment.file_name);
  }

  get isPreviewPdf(): boolean {
    if (!this.previewAttachment?.file_name) return false;
    return this.isPdfFile(this.previewAttachment.file_name);
  }

  get isPreviewText(): boolean {
    if (!this.previewAttachment?.file_name) return false;
    return this.isTextFile(this.previewAttachment.file_name);
  }

  openPreview(attachment: BugAttachment): void {
    if (!attachment) {
      this.toastService.show('No file attachment found', 'error');
      return;
    }

    if (attachment.file_data) {
      this.renderPreview(attachment);
      return;
    }

    if (!attachment.id) {
      this.toastService.show('No file attachment found', 'error');
      return;
    }

    this.fetchingAttachment[attachment.id] = true;
    this.cdr.markForCheck();

    this.chatService.getBugAttachment({ attachment_id: attachment.id }).subscribe({
      next: (res: any) => {
        this.fetchingAttachment[attachment.id] = false;
        const fileData = this.extractFileData(res);
        if (!fileData) {
          this.toastService.show('Failed to load file attachment', 'error');
          this.cdr.markForCheck();
          return;
        }

        attachment.file_data = fileData;
        if (res?.file_type) attachment.file_type = res.file_type;
        if (res?.file_name) attachment.file_name = res.file_name;
        if (res?.file_size) attachment.file_size = res.file_size;

        this.renderPreview(attachment);
      },
      error: (err: any) => {
        this.fetchingAttachment[attachment.id] = false;
        console.error('Failed to load attachment:', err);
        this.toastService.show('Failed to load file attachment', 'error');
        this.cdr.markForCheck();
      },
    });
  }

  private renderPreview(attachment: BugAttachment): void {
    try {
      const blob = this.decodeAttachmentBlob(attachment);
      this.closeFilePreview();
      this.attachmentPickerBug = null;
      this.previewAttachment = attachment;
      this.previewFileUrl = window.URL.createObjectURL(blob);
      this.safePreviewUrl = this.sanitizer.bypassSecurityTrustResourceUrl(this.previewFileUrl);

      if (this.isPreviewText) {
        const reader = new FileReader();
        reader.onload = (e) => {
          this.previewTextContent = e.target?.result as string;
          this.cdr.markForCheck();
        };
        reader.readAsText(blob);
      } else {
        this.previewTextContent = null;
      }
      this.cdr.markForCheck();
    } catch (err) {
      console.error('Failed to open preview:', err);
      this.toastService.show('Failed to load file preview', 'error');
      this.cdr.markForCheck();
    }
  }

  closeFilePreview() {
    if (this.previewFileUrl) {
      window.URL.revokeObjectURL(this.previewFileUrl);
    }
    this.previewAttachment = null;
    this.previewFileUrl = null;
    this.safePreviewUrl = null;
    this.previewTextContent = null;
  }
}
