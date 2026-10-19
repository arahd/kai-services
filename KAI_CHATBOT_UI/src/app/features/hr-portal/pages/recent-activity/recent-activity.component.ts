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
import { ToastService } from '@core/services/toast.service';
import { FileDownloadService } from '@shared/services/file-download.service';
import { RecentActivityUI } from './recent-activity.model';
import { RecentActivityService } from './recent-activity.service';
import { extractUploadedFileList } from '../hr-history/hr-history.service';

@Component({
  selector: 'app-recent-activity',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  templateUrl: './recent-activity.component.html',
  styleUrls: ['./recent-activity.component.scss'],
})
export class RecentActivityComponent implements OnInit {
  private activityService = inject(RecentActivityService);
  private fileDownloadService = inject(FileDownloadService);
  private toastService = inject(ToastService);
  private cdr = inject(ChangeDetectorRef);

  records = signal<RecentActivityUI[]>([]);
  isLoading = signal<boolean>(false);
  downloadingId = signal<string | number | null>(null);

  // Uploaded Files Modal State
  readonly previewUploadedFiles = signal<string[]>([]);
  readonly isUploadedFilesModalOpen = signal<boolean>(false);

  // Pagination Signals
  currentPage = signal<number>(1);
  pageSize = signal<number>(20);
  totalCount = signal<number>(0);
  totalPages = signal<number>(1);

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

  ngOnInit(): void {
    this.loadRecentActivity();
  }

  loadRecentActivity(page: number = this.currentPage()): void {
    this.isLoading.set(true);
    this.activityService.getUserRecentActivity(page, this.pageSize()).subscribe({
      next: (result) => {
        this.records.set(result.records);
        this.totalCount.set(result.totalCount);
        this.currentPage.set(result.page);
        this.pageSize.set(result.pageSize);
        this.totalPages.set(result.totalPages);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load recent activity:', err);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  goToPage(page: number | string): void {
    if (
      typeof page === 'number' &&
      page >= 1 &&
      page <= this.totalPages() &&
      page !== this.currentPage()
    ) {
      this.currentPage.set(page);
      this.loadRecentActivity(page);
    }
  }

  prevPage(): void {
    if (this.currentPage() > 1) {
      this.goToPage(this.currentPage() - 1);
    }
  }

  nextPage(): void {
    if (this.currentPage() < this.totalPages()) {
      this.goToPage(this.currentPage() + 1);
    }
  }

  onDownloadClick(event: MouseEvent, item: RecentActivityUI): void {
    event.preventDefault();
    if (!item.downloadUrl) {
      return;
    }

    this.downloadingId.set(item.id);
    const fallbackName =
      item.downloadedFileName && item.downloadedFileName !== '-'
        ? item.downloadedFileName
        : (item.downloadUrl.split('/').pop() || 'download.pdf');

    this.activityService.downloadFile(item.downloadUrl).subscribe({
      next: (response) => {
        this.fileDownloadService.downloadFile(response, fallbackName);
        this.downloadingId.set(null);
        this.cdr.markForCheck();
      },
      error: async (err) => {
        console.error('[RecentActivity] Download failed:', err);
        const apiError = await this.fileDownloadService.parseBlobError(err);
        const msg = apiError?.message || 'Unable to download file. Please try again.';
        this.toastService.show(msg, 'error');
        this.downloadingId.set(null);
        this.cdr.markForCheck();
      },
    });
  }

  openUploadedFilesModal(item: RecentActivityUI, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const files =
      item.uploadedFiles && item.uploadedFiles.length > 0
        ? item.uploadedFiles
        : extractUploadedFileList(item.uploadedFileName);

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
