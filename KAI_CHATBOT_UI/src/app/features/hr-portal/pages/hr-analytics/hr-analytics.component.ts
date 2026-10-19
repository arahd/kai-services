import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  ChartComponent,
} from 'ng-apexcharts';
import { forkJoin } from 'rxjs';
import { SearchableSelectComponent } from '@shared/components/searchable-select/searchable-select.component';
import {
  HRAnalyticsDashboardData,
  HRAnalyticsFilters,
  HRTopUserUI,
  RecentActivityUIItem,
} from './hr-analytics.model';
import { HrAnalyticsService } from './hr-analytics.service';
import { extractUploadedFileList } from '../hr-history/hr-history.service';

export interface LineChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  stroke: ApexStroke;
  grid: ApexGrid;
  colors: string[];
  legend: ApexLegend;
  tooltip: ApexTooltip;
  dataLabels: ApexDataLabels;
}

export interface DonutChartOptions {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  plotOptions: ApexPlotOptions;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  tooltip: ApexTooltip;
}

@Component({
  selector: 'app-hr-analytics',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, ChartComponent, SearchableSelectComponent],
  templateUrl: './hr-analytics.component.html',
  styleUrls: ['./hr-analytics.component.scss'],
})
export class HrAnalyticsComponent implements OnInit {
  private analyticsService = inject(HrAnalyticsService);
  private cdr = inject(ChangeDetectorRef);

  // Uploaded Files Modal State
  readonly previewUploadedFiles = signal<string[]>([]);
  readonly isUploadedFilesModalOpen = signal<boolean>(false);

  // Filters State
  startDate = signal<string>('');
  endDate = signal<string>('');
  selectedModule = signal<string>('all');
  selectedUser = signal<string>('all');

  moduleOptions = signal<string[]>([]);
  userOptions = signal<string[]>([]);

  // Loading & Data State
  isLoading = signal<boolean>(false);
  dashboardData = signal<HRAnalyticsDashboardData | null>(null);

  // Line Chart Config
  lineChartOptions: LineChartOptions = {
    series: [],
    chart: {
      type: 'line',
      height: 270,
      toolbar: { show: false },
      zoom: { enabled: false },
      fontFamily: 'inherit',
    },
    stroke: {
      curve: 'smooth',
      width: 2.5,
    },
    colors: ['#4338ca', '#10b981', '#f59e0b', '#06b6d4', '#ec4899', '#8b5cf6'],
    xaxis: {
      categories: [],
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: {
        style: {
          colors: '#94a3b8',
          fontSize: '11px',
          fontFamily: 'inherit',
        },
      },
    },
    yaxis: {
      min: 0,
      tickAmount: 4,
      labels: {
        style: {
          colors: '#94a3b8',
          fontSize: '11px',
          fontFamily: 'inherit',
        },
      },
    },
    grid: {
      borderColor: '#f1f5f9',
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
    },
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'right',
    },
    dataLabels: {
      enabled: false,
    },
    tooltip: {
      theme: 'light',
    },
  };

  // Donut Chart Config
  donutChartOptions: DonutChartOptions = {
    series: [0, 0],
    chart: {
      type: 'donut',
      height: 250,
      fontFamily: 'inherit',
    },
    labels: ['Success Reports', 'Failed Reports'],
    colors: ['#10b981', '#ef4444'],
    plotOptions: {
      pie: {
        donut: {
          size: '72%',
        },
      },
    },
    dataLabels: {
      enabled: false,
    },
    legend: {
      show: false,
    },
    tooltip: {
      theme: 'light',
    },
  };

  ngOnInit(): void {
    this.loadFilterOptions();
    this.loadData();
  }

  loadFilterOptions(): void {
    forkJoin({
      users: this.analyticsService.getUsers(),
      modules: this.analyticsService.getModules(),
    }).subscribe({
      next: ({ users, modules }) => {
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
        this.cdr.markForCheck();
      },
      error: () => {},
    });
  }

  loadData(): void {
    this.isLoading.set(true);

    const filters: HRAnalyticsFilters = {
      fromDate: this.startDate() || undefined,
      toDate: this.endDate() || undefined,
      module: this.selectedModule(),
      user: this.selectedUser(),
    };

    this.analyticsService.getDashboardData(filters).subscribe({
      next: (data) => {
        this.dashboardData.set(data);

        // Fallback: derive dropdown options if empty
        if (
          this.userOptions().length === 0 &&
          data.topUsers &&
          data.topUsers.length > 0
        ) {
          const users = Array.from(
            new Set(
              data.topUsers
                .map((u) => u.user)
                .filter((u) => u && u !== 'Unknown'),
            ),
          ).sort();
          if (users.length > 0) this.userOptions.set(users);
        }
        if (
          this.moduleOptions().length === 0 &&
          data.moduleDistribution &&
          data.moduleDistribution.length > 0
        ) {
          const modules = Array.from(
            new Set(
              data.moduleDistribution.map((m) => m.module).filter(Boolean),
            ),
          ).sort();
          if (modules.length > 0) this.moduleOptions.set(modules);
        }

        this.updateCharts(data);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
      error: (err) => {
        console.error('Failed to load HR Analytics dashboard data:', err);
        this.isLoading.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  private updateCharts(data: HRAnalyticsDashboardData): void {
    // Donut Chart: Success vs Failed
    const successCount = data.successFailureRatio?.success ?? 0;
    const failedCount = data.successFailureRatio?.failed ?? 0;

    this.donutChartOptions = {
      ...this.donutChartOptions,
      series: [successCount, failedCount],
    };

    // Trend Chart: multi-series or total
    if (data.trends && data.trends.categories && data.trends.categories.length > 0) {
      const series =
        data.trends.series && data.trends.series.length > 0
          ? data.trends.series
          : [
              {
                name: 'Reports Processed',
                data: data.trends.totalCounts || [],
              },
            ];

      this.lineChartOptions = {
        ...this.lineChartOptions,
        series,
        xaxis: {
          ...this.lineChartOptions.xaxis,
          categories: data.trends.categories,
        },
      };
    } else {
      this.lineChartOptions = {
        ...this.lineChartOptions,
        series: [],
        xaxis: {
          ...this.lineChartOptions.xaxis,
          categories: [],
        },
      };
    }
  }

  onFilterChange(): void {
    this.loadData();
  }

  resetFilters(): void {
    this.startDate.set('');
    this.endDate.set('');
    this.selectedModule.set('all');
    this.selectedUser.set('all');
    this.loadData();
  }

  trackByRank(_index: number, item: HRTopUserUI): any {
    return item.rank || _index;
  }

  trackBySNo(_index: number, item: RecentActivityUIItem): any {
    return item.id || item.sNo || _index;
  }

  openUploadedFilesModal(item: RecentActivityUIItem, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    const files =
      item.uploadedFiles && item.uploadedFiles.length > 0
        ? item.uploadedFiles
        : extractUploadedFileList(item.uploadedFileName);

    if (files.length === 0) {
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
