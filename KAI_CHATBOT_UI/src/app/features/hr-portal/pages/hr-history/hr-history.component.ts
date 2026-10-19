import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ToastService } from '@core/services/toast.service';
import { FileDownloadService } from '@shared/services/file-download.service';
import { forkJoin } from 'rxjs';
import { extractUploadedFileList, HistoryRecordUI, HrHistoryService } from './hr-history.service';
import { SearchableSelectComponent } from '@shared/components/searchable-select/searchable-select.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-hr-history',
  standalone: true,
  imports: [CommonModule, FormsModule, SearchableSelectComponent],
  templateUrl: './hr-history.component.html',
  styleUrls: ['./hr-history.component.scss'],
})
export class HrHistoryComponent implements OnInit {
  protected readonly Math = Math;

  private historyService = inject(HrHistoryService);
  private fileDownloadService = inject(FileDownloadService);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  // Uploaded Files Modal State
  readonly previewUploadedFiles = signal<string[]>([]);
  readonly isUploadedFilesModalOpen = signal<boolean>(false);

  // Selected Filter Signals
  startDate = signal<string>('');
  endDate = signal<string>('');
  selectedModule = signal<string>('all');
  selectedProcessType = signal<string>('all');
  selectedUser = signal<string>('all');

  // Pagination Signals
  currentPage = signal<number>(1);
  pageSize = signal<number>(20);
  totalCount = signal<number>(0);
  serverTotalPages = signal<number | null>(null);
  isLoading = signal<boolean>(false);
  downloadingRecordId = signal<string | number | null>(null);

  // History Records Signal
  records = signal<HistoryRecordUI[]>([]);

  // Filter Dropdown Options
  readonly moduleOptions = signal<string[]>([]);
  readonly processTypeOptions = signal<string[]>([]);
  readonly userOptions = signal<string[]>([]);

  ngOnInit(): void {
    this.loadFilterOptions();
    this.loadHistory(1);
  }

  loadFilterOptions(): void {
    forkJoin({
      users: this.historyService.getUsers(),
      modules: this.historyService.getModules(),
      processTypes: this.historyService.getProcessTypes(),
    }).subscribe({
      next: ({ users, modules, processTypes }) => {
        if (users && users.length > 0) {
          const cleanUsers = users.filter(
            (u) => u && !['all', 'All', 'All Users'].includes(u),
          );
          if (cleanUsers.length > 0) this.userOptions.set(cleanUsers);
        }
        if (modules && modules.length > 0) {
          const cleanModules = modules.filter(
            (m) => m && !['all', 'All', 'All Modules'].includes(m),
          );
          if (cleanModules.length > 0) this.moduleOptions.set(cleanModules);
        }
        if (processTypes && processTypes.length > 0) {
          const cleanProcessTypes = processTypes.filter(
            (p) =>
              p && !['all', 'All', 'All Process Types'].includes(p),
          );
          if (cleanProcessTypes.length > 0)
            this.processTypeOptions.set(cleanProcessTypes);
        }
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  loadHistory(page: number = this.currentPage()): void {
    this.currentPage.set(page);
    this.isLoading.set(true);

    const filters: any = {};
    if (this.startDate()) {
      filters.from_date = this.startDate();
    }
    if (this.endDate()) {
      filters.to_date = this.endDate();
    }
    if (
      this.selectedModule() &&
      !['all', 'All', 'All Modules'].includes(this.selectedModule())
    ) {
      filters.module = this.selectedModule();
    }
    if (
      this.selectedProcessType() &&
      !['all', 'All', 'All Process Types'].includes(this.selectedProcessType())
    ) {
      filters.process_type = this.selectedProcessType();
    }
    if (
      this.selectedUser() &&
      !['all', 'All', 'All Users'].includes(this.selectedUser())
    ) {
      filters.email_id = this.selectedUser();
    }

    this.historyService.getHistory(page, this.pageSize(), filters).subscribe({
      next: (res) => {
        const rawData = res && Array.isArray(res.data) ? res.data : [];
        const uiRecords = rawData.map((item) =>
          this.historyService.transformToUIRecord(item),
        );
        this.records.set(uiRecords);
        this.totalCount.set(res.total_count ?? res.count ?? uiRecords.length);
        if (res.total_pages) {
          this.serverTotalPages.set(res.total_pages);
        } else {
          this.serverTotalPages.set(null);
        }

        // Fallback: Populate options from loaded records if options are empty
        if (this.moduleOptions().length === 0) {
          const modules = Array.from(
            new Set(
              uiRecords
                .map((r) => r.module)
                .filter(
                  (m) =>
                    m &&
                    m !== '-' &&
                    !['all', 'All', 'All Modules'].includes(m),
                ),
            ),
          ).sort();
          if (modules.length > 0) this.moduleOptions.set(modules);
        }
        if (this.processTypeOptions().length === 0) {
          const processTypes = Array.from(
            new Set(
              uiRecords
                .map((r) => r.processType)
                .filter(
                  (p) =>
                    p &&
                    p !== '-' &&
                    !['all', 'All', 'All Process Types'].includes(p),
                ),
            ),
          ).sort();
          if (processTypes.length > 0) this.processTypeOptions.set(processTypes);
        }
        if (this.userOptions().length === 0) {
          const users = Array.from(
            new Set(
              uiRecords
                .map((r) => r.user)
                .filter(
                  (u) =>
                    u &&
                    u !== '-' &&
                    !['all', 'All', 'All Users'].includes(u),
                ),
            ),
          ).sort();
          if (users.length > 0) this.userOptions.set(users);
        }

        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load history:', err);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  // Filtered Dataset (with API pagination, records() contains current page from API)
  readonly filteredRecords = computed(() => this.records());

  // Paginated View
  readonly paginatedRecords = computed(() => this.records());

  readonly totalPages = computed(() => {
    if (this.serverTotalPages()) {
      return this.serverTotalPages()!;
    }
    const count = this.totalCount();
    return Math.ceil(count / this.pageSize()) || 1;
  });

  readonly pageNumbers = computed<(number | string)[]>(() => {
    const total = this.totalPages();
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

  resetFilters(): void {
    this.startDate.set('');
    this.endDate.set('');
    this.selectedModule.set('all');
    this.selectedProcessType.set('all');
    this.selectedUser.set('all');
    this.loadHistory(1);
  }

  onFilterChange(): void {
    this.loadHistory(1);
  }

  goToPage(page: number | string): void {
    if (
      typeof page === 'number' &&
      page >= 1 &&
      page <= this.totalPages() &&
      page !== this.currentPage()
    ) {
      this.loadHistory(page);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.loadHistory(this.currentPage() + 1);
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.loadHistory(this.currentPage() - 1);
    }
  }

  downloadRecord(record: HistoryRecordUI, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    if (!record.downloadUrl) return;

    this.downloadingRecordId.set(record.id);

    const fallbackName =
      record.downloadedFileName && record.downloadedFileName !== '-'
        ? record.downloadedFileName
        : record.downloadUrl.split('/').pop() || 'download.pdf';

    this.historyService.downloadFile(record.downloadUrl).subscribe({
      next: (response) => {
        this.fileDownloadService.downloadFile(response, fallbackName);
        this.downloadingRecordId.set(null);
        this.cdr.markForCheck();
      },
      error: async (err) => {
        console.error('[HrHistoryComponent] Download failed:', err);
        const apiError = await this.fileDownloadService.parseBlobError(err);
        const msg =
          apiError?.message || 'Unable to download file. Please try again.';
        this.toastService.show(msg, 'error');
        this.downloadingRecordId.set(null);
        this.cdr.markForCheck();
      },
    });
  }

  openUploadedFilesModal(record: HistoryRecordUI, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const files =
      record.uploadedFiles && record.uploadedFiles.length > 0
        ? record.uploadedFiles
        : extractUploadedFileList(record.uploadedFileName);

    if (files.length === 0) {
      this.toastService.show('No uploaded files found', 'error');
      return;
    }

    this.previewUploadedFiles.set(files);
    this.isUploadedFilesModalOpen.set(true);
  }

  closeUploadedFilesModal(): void {
    this.isUploadedFilesModalOpen.set(false);
    this.previewUploadedFiles.set([]);
  }
}
