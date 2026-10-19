import { CommonModule, formatDate } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormsModule,
  ReactiveFormsModule,
} from '@angular/forms';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { ToastService } from '@core/services/toast.service';
import { ChatService } from '@features/chatbot/services/chat.service';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexStates,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  ChartComponent,
} from 'ng-apexcharts';
import { TokenUsageMonitoringComponent } from '../token-usage-monitoring/token-usage-monitoring.component';

interface GptModel {
  description: string;
  displayName: string;
  isDefault: boolean;
  isEnabled: boolean;
  value: string;
}
interface ModelUsageByDateRow {
  date: string;
  gpt_model: string;
  questions_count: number;
}
type LeaderboardMetric = 'tokens' | 'questions' | 'conversations' | 'sensitive';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-analytics',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    ChartComponent,
    TokenUsageMonitoringComponent,
  ],
  templateUrl: './analytics.component.html',
  styleUrl: './analytics.component.scss',
})
export class AnalyticsComponent implements OnInit {
  @ViewChild('userModalPieApex', { read: ChartComponent })
  private userModalPieApexChart?: ChartComponent;

  @ViewChild('leaderboardMetricDropdown')
  private leaderboardMetricDropdownRef?: ElementRef<HTMLElement>;
  modelUsageSeries: ApexAxisChartSeries = [];

  modelUsageChart: ApexChart = {
    type: 'bar',
    height: 300,
    toolbar: { show: false },
    background: 'transparent',
    animations: {
      enabled: true,
      speed: 700,
    },
    fontFamily: "'DM Sans', sans-serif",
  };

  modelUsageXAxis: ApexXAxis = {
    categories: [],
    axisBorder: { show: false },
    axisTicks: { show: false },
    labels: {
      style: {
        colors: '#7c83a0',
        fontSize: '11px',
        fontFamily: "'DM Mono', monospace",
      },
    },
  };

  modelUsageYAxis: ApexYAxis = {
    title: {
      text: 'Questions',
      style: { color: '#7c83a0', fontSize: '11px', fontWeight: 500 },
    },
    labels: {
      style: {
        colors: '#7c83a0',
        fontSize: '11px',
        fontFamily: "'DM Mono', monospace",
      },
    },
  };

  modelUsageStroke: ApexStroke = {
    show: true,
    width: 2,
    colors: ['transparent'],
  };

  modelUsageDataLabels: ApexDataLabels = { enabled: false };

  modelUsageTooltip: ApexTooltip = {
    enabled: true,
    theme: 'dark',
  };

  modelUsageColors = ['#6366f1', '#06b6d4', '#f59e0b', '#10b981', '#ec4899'];

  modelUsageGrid: ApexGrid = {
    borderColor: 'rgba(255,255,255,0.05)',
    strokeDashArray: 4,
    xaxis: { lines: { show: false } },
    yaxis: { lines: { show: true } },
    padding: { top: 0, right: 0, bottom: 0, left: 0 },
  };

  modelUsagePlotOptions: ApexPlotOptions = {
    bar: {
      horizontal: false,
      columnWidth: '52%',
      borderRadius: 6,
      borderRadiusApplication: 'end',
    },
  };

  modelUsageFill: ApexFill = {
    type: 'gradient',
    gradient: {
      type: 'vertical',
      shadeIntensity: 0.3,
      opacityFrom: 0.95,
      opacityTo: 0.65,
      stops: [0, 100],
    },
  };
  filterForm: FormGroup;
  loadingMain = signal(false);
  revokedUsersCount = 0;
  loadingRevokedUsers = false;
  activeUsersCount: number | null = null;
  loadingUser = signal(false);
  loadingModels = signal(false);
  loadingDailyActivity = signal(false);
  submittingExport = signal(false);
  showUserModal = signal(false);
  selectedUsername = signal<string | null>(null);
  showFiltersPanel = signal(false);
  showLeaderboardModal = signal(false);
  leaderboardRowCount = 0;
  leaderboardPage = 1;
  leaderboardPageInput = 1;
  leaderboardTotalPages = 1;
  leaderboardPageLoading = false;
  leaderboardLimit = 20;
  loadingLeaderboard = false;
  leaderboardMetric: LeaderboardMetric = 'tokens';
  leaderboardMetricMenuOpen = signal(false);
  readonly leaderboardMetricOptions: ReadonlyArray<{
    value: LeaderboardMetric;
    label: string;
  }> = [
    { value: 'tokens', label: 'Most Tokens' },
    { value: 'questions', label: 'Most Questions' },
    { value: 'conversations', label: 'Most Conversations' },
    { value: 'sensitive', label: 'Most Sensitive' },
  ];
  private readonly leaderboardClientPageSize = 20;
  loadingLeaderboardCard = false;
  leaderboardCardRows: Array<{
    rank: number;
    user: string;
    tokens: number;
  }> = [];
  leaderboardModalRows: Array<{
    rank: number;
    user: string;
    tokens: number;
  }> = [];

  private readonly leaderboardPreviewMax = 6;
  toastService = inject(ToastService);
  private azureAdService = inject(AzureAdService);
  mainAnalytics: any = null;
  userAnalytics: any = null;
  modelUsage: any[] = [];
  modelsList: GptModel[] = [];
  userSearchResults: string[] = [];
  private palette = [
    '#6366f1',
    '#06b6d4',
    '#f59e0b',
    '#10b981',
    '#ec4899',
    '#a78bfa',
    '#34d399',
  ];

  barColor(index: number): string {
    return this.palette[index % this.palette.length];
  }
  regionalSeries: ApexNonAxisChartSeries = [];
  regionalLabels: string[] = [];
  regionalChart: ApexChart = {
    type: 'pie',
    height: 150,
    toolbar: { show: false },
    background: 'transparent',
    fontFamily: "'Manrope', 'DM Sans', sans-serif",
    animations: { enabled: true, speed: 400 },
  };
  regionalLegend: ApexLegend = {
    show: false,
  };
  regionalColors = ['#10B981', '#3B82F6', '#A78BFA', '#EC4899'];

  regionalStroke: ApexStroke = {
    show: true,
    width: 2,
    colors: ['#ffffff'],
  };

  regionalDataLabels: ApexDataLabels = { enabled: false };

  regionalPlotOptions: ApexPlotOptions = {
    pie: {
      expandOnClick: false,
      offsetY: 0,
    },
  };
  userModalPieSeries: ApexNonAxisChartSeries = [];
  userModalPieLabels: string[] = [];
  userModalPieDisplayPercents: string[] = [];

  userModalPieChart: ApexChart = {
    type: 'pie',
    height: 180,
    offsetY: 0,
    toolbar: { show: false },
    background: 'transparent',
    fontFamily: "'Manrope', 'DM Sans', sans-serif",
  };
  userModalPieTooltip: ApexTooltip = {
    enabled: true,
    theme: 'light',
    y: {
      formatter: (val: number) => `${val} conversations`,
      title: {
        formatter: (seriesName: string) => `${seriesName}:`,
      },
    },
  };
  userModalPieStates: ApexStates = {
    hover: { filter: { type: 'none' } },
    active: { filter: { type: 'none' } },
  };
  userModalPieLegend: ApexLegend = { show: false };
  userModalPieColors = [
    '#86EFAC',
    '#4ADE80',
    '#22C55E',
    '#16A34A',
    '#15803D',
    '#166534',
  ];
  userModalPieStroke: ApexStroke = {
    show: true,
    width: 1.5,
    colors: ['#ffffff'],
  };
  userModalPieDataLabels: ApexDataLabels = {
    enabled: true,
    formatter: (val: string | number, opts: any): string => {
      const idx = opts?.seriesIndex ?? 0;
      const stored = this.userModalPieDisplayPercents[idx];
      if (stored !== undefined) {
        return `${stored}%`;
      }
      const n = typeof val === 'number' ? val : parseFloat(String(val));
      const pct = Number.isFinite(n) ? n.toFixed(1) : String(val);
      return `${pct}%`;
    },
    style: {
      fontSize: '6px',
      fontWeight: 600,
      fontFamily: "'Manrope', 'DM Sans', sans-serif",
      colors: ['#4b5563'],
    },
    background: {
      enabled: true,
      backgroundColor: '#ffffff',
      foreColor: '#4b5563',
      borderRadius: 6,
      padding: 4,
      borderWidth: 0,
      opacity: 1,
      dropShadow: { enabled: false },
    },
    dropShadow: { enabled: false },
  };
  userModalPiePlotOptions: ApexPlotOptions = {
    pie: {
      customScale: 0.88,
      expandOnClick: false,
      dataLabels: {
        offset: -16,
        minAngleToShowLabel: 2,
      },
    },
  };
  dailyActivitySeries: ApexAxisChartSeries = [];

  dailyActivityChart: ApexChart = {
    type: 'line',
    height: 400,
    toolbar: { show: false },
    zoom: { enabled: false },
    background: 'transparent',
    fontFamily: "'DM Sans', sans-serif",
    animations: { enabled: true, speed: 600 },
  };

  dailyActivityXAxis: ApexXAxis = {
    categories: [],
    axisBorder: { show: false },
    axisTicks: { show: false },
    title: {
      text: 'Period',
      offsetY: 4,
      style: {
        color: '#6b7280',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: "'Manrope', sans-serif",
      },
    },
    labels: {
      style: {
        colors: '#7c83a0',
        fontSize: '11px',
        fontFamily: "'DM Mono', monospace",
      },
    },
  };

  dailyActivityYAxis: ApexYAxis = {
    min: 0,
    tickAmount: 5,
    forceNiceScale: false,
    decimalsInFloat: 0,
    title: {
      text: 'No of Questions asked',
      rotate: -90,
      offsetX: 0,
      style: {
        color: '#6b7280',
        fontSize: '12px',
        fontWeight: 600,
        fontFamily: "'Manrope', sans-serif",
      },
    },
    labels: {
      formatter: (val: number) => String(Math.round(val)),
      style: {
        colors: '#7c83a0',
        fontSize: '11px',
        fontFamily: "'DM Mono', monospace",
      },
    },
  };

  dailyActivityStroke: ApexStroke = {
    curve: 'smooth',
    width: 2,
    colors: ['#10b981'],
  };

  dailyActivityColors = ['#10b981'];

  dailyActivityLegend: ApexLegend = {
    show: false,
    showForSingleSeries: true,
    position: 'top',
    horizontalAlign: 'right',
    floating: false,
    offsetY: -4,
    offsetX: 0,
    fontSize: '12px',
    fontWeight: 500,
    fontFamily: "'Manrope', sans-serif",
    labels: { colors: '#374151' },
    markers: {
      strokeWidth: 0,
      fillColors: ['#10b981'],
    },
    itemMargin: { horizontal: 0, vertical: 0 },
  };

  dailyActivityGrid: ApexGrid = {
    borderColor: 'rgba(17, 24, 39, 0.08)',
    strokeDashArray: 4,
    xaxis: { lines: { show: true } },
    yaxis: { lines: { show: true } },
    padding: { top: 4, right: 16, bottom: 16, left: 20 },
  };

  dailyActivityTooltip: ApexTooltip = {
    enabled: true,
    theme: 'dark',
    shared: false,
    intersect: true,
  };

  dailyActivityMarkers = {
    size: 5,
    strokeWidth: 2,
    strokeColors: ['#10b981'],
    colors: ['#ffffff'],
    hover: { size: 7 },
  };

  dailyActivityDataLabels: ApexDataLabels = { enabled: false };

  private readonly chatService = inject(ChatService);
  private readonly fb = inject(FormBuilder);
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    const today = new Date().toISOString().split('T')[0];
    this.filterForm = this.fb.group({
      username: [''],
      usernames: [[] as string[]],
      models: [[] as string[]],
      modelMatchAll: [false],
      startDate: [today],
      endDate: [today],
    });
  }

  ngOnInit(): void {
    this.loadMainAnalytics();
    this.loadModels();
    this.loadDailyActivityFromModelUsage();
    this.loadRevokedUsersCount();
  }

  onActiveUserCountChange(count: number): void {
    if (count != null) {
      this.activeUsersCount = count;
      this.cdr.markForCheck();
    }
  }

  loadActiveUsersCount(): void {
    this.chatService.getUserTokensDetails(1, undefined, 10).subscribe({
      next: (res: any) => {
        if (res?.active_user_count != null) {
          this.activeUsersCount = Number(res.active_user_count) || 0;
        }
        this.cdr.markForCheck();
      },
      error: (err: unknown) => {
        console.error(err);
        this.cdr.markForCheck();
      },
    });
  }
  private loadRevokedUsersCount(): void {
    this.loadingRevokedUsers = true;
    this.chatService
      .getRevokedUsers({ bot_type: 'kumaran', page: '1', limit: '1' })
      .subscribe({
        next: (res: any) => {
          const total = Number(
            res?.total ?? res?.count ?? res?.revoked_count ?? NaN,
          );
          if (!Number.isNaN(total)) {
            this.revokedUsersCount = total;
          } else {
            const list = res?.data ?? res?.revoked_users ?? res;
            this.revokedUsersCount = Array.isArray(list) ? list.length : 0;
          }
          this.loadingRevokedUsers = false;
          this.cdr.markForCheck();
        },
        error: (err) => {
          console.error('Error loading revoked users:', err);
          this.revokedUsersCount = 0;
          this.loadingRevokedUsers = false;
          this.cdr.markForCheck();
        },
      });
  }
  private getLast8DaysDateRange(): { start_date: string; end_date: string } {
    const end = new Date();
    end.setHours(0, 0, 0, 0);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return {
      start_date: formatDate(start, 'yyyy-MM-dd', 'en-US'),
      end_date: formatDate(end, 'yyyy-MM-dd', 'en-US'),
    };
  }
  private aggregateQuestionsByDate(
    rows: ModelUsageByDateRow[],
  ): Map<string, number> {
    const totals = new Map<string, number>();
    for (const row of rows) {
      if (!row?.date) continue;
      const count =
        typeof row.questions_count === 'number' &&
        !Number.isNaN(row.questions_count)
          ? row.questions_count
          : 0;
      totals.set(row.date, (totals.get(row.date) ?? 0) + count);
    }
    return totals;
  }
  private dailyActivityYMax(maxVal: number): number {
    if (maxVal <= 0) return 10;
    return Math.max(10, Math.ceil((maxVal * 1.15) / 4) * 4);
  }

  private applyDailyActivityChart(categories: string[], data: number[]): void {
    const maxVal = data.length ? Math.max(...data) : 0;
    const yMax = this.dailyActivityYMax(maxVal);

    this.dailyActivityXAxis = {
      ...this.dailyActivityXAxis,
      categories,
    };
    this.dailyActivityYAxis = {
      ...this.dailyActivityYAxis,
      min: 0,
      max: yMax,
      tickAmount: 5,
      forceNiceScale: false,
      decimalsInFloat: 0,
      labels: {
        ...this.dailyActivityYAxis.labels,
        formatter: (val: number) => String(Math.round(val)),
      },
    };
    this.dailyActivitySeries = [{ name: 'Questions', data }];
  }

  private buildDailyActivityFromModelUsage(rows: ModelUsageByDateRow[]): void {
    const totalsByDate = this.aggregateQuestionsByDate(rows);
    const categories: string[] = [];
    const data: number[] = [];

    for (let i = 7; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = formatDate(d, 'yyyy-MM-dd', 'en-US');
      categories.push(formatDate(d, 'MMM d', 'en-US'));
      data.push(totalsByDate.get(key) ?? 0);
    }

    this.applyDailyActivityChart(categories, data);
  }
  loadDailyActivityFromModelUsage(): void {
    const { start_date, end_date } = this.getLast8DaysDateRange();
    this.loadingDailyActivity.set(true);

    this.chatService
      .getModelUsage?.({ bot_type: 'kumaran', start_date, end_date })
      ?.subscribe({
        next: (res: unknown) => {
          const rows = Array.isArray(res) ? (res as ModelUsageByDateRow[]) : [];
          this.buildDailyActivityFromModelUsage(rows);
          this.loadingDailyActivity.set(false);
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          console.error(err);
          this.toastService.show('Failed to load daily activity', 'error');
          this.buildDailyActivityFromModelUsage([]);
          this.loadingDailyActivity.set(false);
          this.cdr.markForCheck();
        },
      });
  }
  loadMainAnalytics(): void {
    this.loadingMain.set(true);
    this.chatService
      .getReportingAnalytics?.({ bot_type: 'kumaran' })
      ?.subscribe({
        next: (res: any) => {
          this.mainAnalytics = res;
          if (res?.active_user_count != null) {
            this.activeUsersCount = Number(res.active_user_count) || 0;
          }
          this.updateRegionalChart();
          this.syncLeaderboardRowCountFromAnalytics(res);
          this.loadLeaderboardCardData();
          this.loadingMain.set(false);
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error(err);
          this.toastService.show('Failed to load main analytics', 'error');
          this.mainAnalytics = null;
          this.loadingMain.set(false);
          this.loadLeaderboardCardData();
          this.cdr.markForCheck();
        },
      });
  }
  loadModels(): void {
    this.loadingModels.set(true);
    this.chatService.getReportingModels({ bot_type: 'kumaran' }).subscribe({
      next: (res: any) => {
        const rawModels = Array.isArray(res?.report_gpt_model)
          ? res.report_gpt_model
          : Array.isArray(res)
            ? res
            : [];

        this.modelsList = rawModels
          .map((m: any) => {
            if (typeof m === 'string') {
              return {
                description: '',
                displayName: m,
                isDefault: false,
                isEnabled: true,
                value: m,
              } satisfies GptModel;
            }
            return {
              description: m.description ?? '',
              displayName: m.displayName || m.value,
              isDefault: !!m.isDefault,
              isEnabled: m.isEnabled !== false,
              value: m.value,
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
  userSearchInput = '';

  onUsernameSearchInput(event: Event): void {
    const val = (event.target as HTMLInputElement).value;
    this.userSearchInput = val;
    this.searchUsers(val);
  }

  searchUsers(query: string): void {
    this.filterForm.patchValue({ username: query });
    if (!query || query.length < 2) {
      this.userSearchResults = [];
      return;
    }

    this.chatService
      .searchReportingUsers?.({ username: query, bot_type: 'kumaran' })
      ?.subscribe({
        next: (res: any) => {
          this.userSearchResults = res?.username ?? [];
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error(err);
          this.toastService.show('Failed to search users', 'error');
          this.cdr.markForCheck();
        },
      });
  }

  pickUser(username: string): void {
    this.filterForm.patchValue({ username });
    this.userSearchResults = [];
  }

  addUsername(username: string): void {
    const current = (this.filterForm.get('usernames')?.value as string[]) ?? [];
    if (!current.includes(username)) {
      this.filterForm.patchValue({
        usernames: [...current, username],
      });
    }
    this.userSearchInput = '';
    this.userSearchResults = [];
  }

  removeUsername(username: string): void {
    const current = (this.filterForm.get('usernames')?.value as string[]) ?? [];
    this.filterForm.patchValue({
      usernames: current.filter((u) => u !== username),
    });
  }

  getSelectedUsernamesString(): string {
    const usernames = this.filterForm.get('usernames')?.value ?? [];
    return usernames.length > 0 ? usernames.join(', ') : '—';
  }
  loadUserAnalytics(): void {
    const payload = this.buildUserAnalyticsFilterPayload();

    this.userAnalytics = null;
    this.userModalPieLabels = [];
    this.userModalPieSeries = [];
    this.userModalPieDisplayPercents = [];
    this.loadingUser.set(true);
    this.chatService.getUserAnalytics?.(payload)?.subscribe({
      next: (res: any) => {
        this.userAnalytics = res;
        this.loadingUser.set(false);
        this.updateUserModalPieFromUserAnalytics(res);
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error(err);
        this.toastService.show('Failed to load user analytics', 'error');
        this.loadingUser.set(false);
        this.cdr.markForCheck();
      },
    });
  }
  loadModelUsage(): void {
    const v = this.filterForm.value;
    const payload: any = {
      bot_type: 'kumaran',
      start_date: v.startDate || undefined,
      end_date: v.endDate || undefined,
      ...this.buildModelFilterPayload(),
    };
    Object.keys(payload).forEach(
      (k) => payload[k] === undefined && delete payload[k],
    );

    this.chatService.getModelUsage?.(payload)?.subscribe({
      next: (res: any[]) => {
        this.modelUsage = res || [];
        this.updateModelUsageChart();
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error(err);
        this.toastService.show('Failed to load model usage', 'error');
        this.cdr.markForCheck();
      },
    });
  }
  exportAllUsers(): void {
    this.submittingExport.set(true);
    this.chatService
      .exportAllUsersXlsx?.({
        bot_type: 'kumaran',
        timezone_offset: 'Asia/Calcutta',
      })
      ?.subscribe({
        next: (blob: Blob) => {
          this.finishExport(
            blob,
            `users_all_${this.nowStamp()}.xlsx`,
            'Users exported successfully',
          );
          this.cdr.markForCheck();
        },
        error: (err: any) => {
          console.error(err);
          this.toastService.show('Export failed', 'error');
          this.submittingExport.set(false);
          this.cdr.markForCheck();
        },
      });
  }

  exportQuestions(): void {
    if (this.submittingExport()) {
      return;
    }

    const payload = this.buildQuestionsExportPayload();
    this.submittingExport.set(true);
    this.chatService.exportQuestionsXlsx?.(payload)?.subscribe({
      next: (blob: Blob) => {
        this.finishExport(
          blob,
          `questions_${this.nowStamp()}.xlsx`,
          'Questions exported successfully',
        );
        this.cdr.markForCheck();
      },
      error: (err: any) => {
        console.error(err);
        this.toastService.show('Export failed', 'error');
        this.submittingExport.set(false);
        this.cdr.markForCheck();
      },
    });
  }
  updateModelUsageChart(): void {
    if (!this.modelUsage?.length) return;

    this.modelUsageXAxis = {
      ...this.modelUsageXAxis,
      categories: this.modelUsage.map((r) => r.date),
    };
    this.modelUsageSeries = [
      {
        name: 'Questions',
        data: this.modelUsage.map((r) => r.questions_count),
      },
    ];
  }

  updateRegionalChart(): void {
    const raw = this.mainAnalytics?.regional_distribution;
    if (raw && typeof raw === 'object') {
      const entries = Object.entries(raw)
        .filter(([, v]) => typeof v === 'number')
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .slice(0, 6);
      this.regionalLabels = entries.map(([k]) => k);
      this.regionalSeries = entries.map(([, v]) => v as number);
      return;
    }

    const models = this.topModels();
    if (!models?.length) {
      this.regionalLabels = [];
      this.regionalSeries = [];
      return;
    }

    const top = models.slice(0, 6);
    this.regionalLabels = top.map((m) => m.model_name);
    this.regionalSeries = top.map((m) => Number(m.conversation_count ?? 0));
  }

  toggleFiltersPanel(): void {
    const open = !this.showFiltersPanel();
    this.showFiltersPanel.set(open);
    if (open) {
      this.showUserModal.set(false);
    }
  }

  closeUserModal(): void {
    this.showUserModal.set(false);
  }

  applyFiltersFromModal(): void {
    this.showFiltersPanel.set(false);
    this.showUserModal.set(true);
    this.loadUserAnalytics();
  }

  clearFilters(): void {
    const today = new Date().toISOString().split('T')[0];
    this.filterForm.patchValue({
      username: '',
      usernames: [],
      models: [],
      modelMatchAll: false,
      startDate: today,
      endDate: today,
    });
    this.userSearchInput = '';
    this.userSearchResults = [];
  }

  getSelectedModels(): string[] {
    const raw = this.filterForm.get('models')?.value;
    return Array.isArray(raw) ? raw.filter((m): m is string => !!m) : [];
  }

  isModelSelected(value: string): boolean {
    if (this.filterForm.get('modelMatchAll')?.value) {
      return false;
    }
    return this.getSelectedModels().includes(value);
  }

  toggleModel(value: string, event: Event): void {
    const input = event.target as HTMLInputElement;
    const checked = input.checked;

    if (this.filterForm.get('modelMatchAll')?.value) {
      this.filterForm.patchValue({
        modelMatchAll: false,
        models: checked ? [value] : [],
      });
      return;
    }

    const models = [...this.getSelectedModels()];
    const idx = models.indexOf(value);
    if (checked && idx < 0) {
      models.push(value);
    } else if (!checked && idx >= 0) {
      models.splice(idx, 1);
    }

    const allOptions = this.filterModelRadios().map((o) => o.value);
    const allIndividualSelected =
      allOptions.length > 0 && allOptions.every((v) => models.includes(v));

    if (allIndividualSelected) {
      input.checked = false;
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

  private reportingUsername(): string {
    return String(this.filterForm.value.username ?? '').trim();
  }

  private pruneReportingPayload(
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const out = { ...payload };
    Object.keys(out).forEach((k) => out[k] === undefined && delete out[k]);
    return out;
  }
  private buildModelFilterPayload(): Record<string, unknown> {
    if (this.filterForm.get('modelMatchAll')?.value) {
      return {};
    }

    const models = this.getSelectedModels();
    if (!models.length) {
      return {};
    }
    return { gpt_model: models };
  }
  private buildUserAnalyticsFilterPayload(): Record<string, unknown> {
    const v = this.filterForm.value;
    return this.pruneReportingPayload({
      usernames:
        v.usernames && v.usernames.length > 0 ? v.usernames : undefined,
      start_date: v.startDate || undefined,
      end_date: v.endDate || undefined,
      bot_type: 'kumaran',
      timezone_offset: 'Asia/Calcutta',
      ...this.buildModelFilterPayload(),
    });
  }
  private buildQuestionsExportPayload(): Record<string, unknown> {
    return this.buildUserAnalyticsFilterPayload();
  }
  filterModelRadios(): { label: string; value: string }[] {
    return this.modelsList.map((m) => ({
      label: m.displayName || m.value,
      value: m.value,
    }));
  }

  private extractModelUsageRows(res: any): { label: string; value: number }[] {
    const raw = res?.top_models_used ?? res?.top_models ?? res?.models_used;
    if (Array.isArray(raw) && raw.length) {
      return raw.map((m: any) => ({
        label: String(
          m.model_name ?? m.model_id ?? m.name ?? m.value ?? m.gpt_model ?? '—',
        ),
        value:
          Number(
            m.conversation_count ??
              m.questions_count ??
              m.total_tokens_used ??
              0,
          ) || 0,
      }));
    }
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      return Object.entries(raw)
        .filter(
          ([, v]) =>
            typeof v === 'number' || (typeof v === 'string' && v !== ''),
        )
        .map(([k, v]) => ({
          label: k,
          value: typeof v === 'number' ? v : Number(v) || 0,
        }));
    }
    return [];
  }

  private updateUserModalPieFromUserAnalytics(res: any): void {
    const rows = this.extractModelUsageRows(res);

    if (!rows.length) {
      this.userModalPieLabels = [];
      this.userModalPieSeries = [];
      this.userModalPieDisplayPercents = [];
      return;
    }

    const sum = rows.reduce((acc, r) => acc + r.value, 0);
    this.userModalPieDisplayPercents = rows.map((r) =>
      sum > 0 ? ((r.value / sum) * 100).toFixed(1) : '0.0',
    );

    this.userModalPieLabels = rows.map((r) => r.label);

    const eps = Math.max(sum * 0.00035, 0.25);
    this.userModalPieSeries = rows.map((r) => (r.value > 0 ? r.value : eps));
    const dynamicColors = [
      '#10B981',
      '#60A5FA',
      '#A78BFA',
      '#F472B6',
      '#F59E0B',
      '#14B8A6',
    ];
    this.userModalPieColors = this.userModalPieLabels.map(
      (_, i) => dynamicColors[i % dynamicColors.length],
    );

    const textColor = '#4b5563';
    this.userModalPieDataLabels = {
      enabled: false,
    };
  }
  responseTypePairs(data: any): { key: string; value: number }[] {
    if (!data) return [];
    return Object.keys(data).map((k) => ({ key: k, value: data[k] }));
  }
  userResponseTypePairs(): { key: string; value: number }[] {
    const ua = this.userAnalytics;
    const rawA = ua?.response_types;
    const rawB = ua?.reponse_types;
    const merged: Record<string, unknown> = {
      ...(typeof rawB === 'object' && rawB && !Array.isArray(rawB) ? rawB : {}),
      ...(typeof rawA === 'object' && rawA && !Array.isArray(rawA) ? rawA : {}),
    };
    const byNorm: Record<string, number> = {};
    for (const [k, v] of Object.entries(merged)) {
      const num = typeof v === 'number' ? v : Number(v);
      if (!Number.isFinite(num)) continue;
      const nk = this.responseTypeKeyNorm(k);
      byNorm[nk] = (byNorm[nk] ?? 0) + num;
    }

    const rows: { norms: string[]; label: string }[] = [
      { norms: ['cache'], label: 'Cache' },
      { norms: ['noncontent'], label: 'Non Content' },
      { norms: ['normal'], label: 'Normal' },
      { norms: ['sensitive'], label: 'Sensitive' },
    ];

    return rows.map((r) => {
      let value = 0;
      for (const n of r.norms) {
        value += byNorm[n] ?? 0;
      }
      if (value === 0 && r.norms.includes('noncontent')) {
        for (const [nk, val] of Object.entries(byNorm)) {
          if (
            nk !== 'noncontent' &&
            nk.includes('non') &&
            nk.includes('content')
          ) {
            value += val;
          }
        }
      }
      return { key: r.label, value };
    });
  }

  topModels(): any[] {
    return this.mainAnalytics?.top_models_used ?? [];
  }
  showLeaderboardFooter(): boolean {
    return this.leaderboardRowCount > this.leaderboardPreviewMax;
  }

  leaderboardRangeStart(): number {
    if (this.leaderboardRowCount === 0) return 0;
    const limit =
      this.leaderboardLimit > 0
        ? this.leaderboardLimit
        : this.leaderboardClientPageSize;
    return (this.leaderboardPage - 1) * limit + 1;
  }

  leaderboardRangeEnd(): number {
    const limit =
      this.leaderboardLimit > 0
        ? this.leaderboardLimit
        : this.leaderboardClientPageSize;
    return Math.min(this.leaderboardPage * limit, this.leaderboardRowCount);
  }

  openLeaderboardModal(): void {
    this.showLeaderboardModal.set(true);
    this.loadLeaderboardPage(1);
  }

  closeLeaderboardModal(): void {
    this.showLeaderboardModal.set(false);
  }

  refreshLeaderboardRowCount(): void {
    if (this.usesMainAnalyticsLeaderboard()) {
      const all = this.getMainAnalyticsLeaderboardRows(this.leaderboardMetric);
      this.applyMainAnalyticsLeaderboardMeta(all);
      this.leaderboardPageInput = this.leaderboardPage;
      return;
    }
    this.chatService.getUserTokensDetails(1, this.leaderboardMetric).subscribe({
      next: (res: any) => {
        this.applyLeaderboardMeta(res);
        this.cdr.markForCheck();
      },
      error: () => {
        this.leaderboardRowCount = 0;
        this.cdr.markForCheck();
      },
    });
  }

  private syncLeaderboardRowCountFromAnalytics(res: any): void {
    if (this.usesMainAnalyticsLeaderboardSource(res)) {
      const rows = this.getMainAnalyticsLeaderboardRows(
        this.leaderboardMetric,
        res,
      );
      this.leaderboardRowCount = rows.length;
      return;
    }
    const list = this.extractLeaderboardListFromAnalytics(res);
    if (list.length > 0) {
      this.leaderboardRowCount = list.length;
      return;
    }
  }
  private usesMainAnalyticsLeaderboard(): boolean {
    return this.usesMainAnalyticsLeaderboardSource(this.mainAnalytics);
  }

  private usesMainAnalyticsLeaderboardSource(source: unknown): boolean {
    if (!source || typeof source !== 'object') return false;
    const o = source as Record<string, unknown>;
    const keys = [
      'most_tokens_user',
      'most_questions_user',
      'most_conversations_user',
      'most_sensitive_questions_user',
    ];
    return keys.some((k) => Array.isArray(o[k]));
  }
  private getMainAnalyticsLeaderboardRows(
    metric: LeaderboardMetric,
    source: any = this.mainAnalytics,
  ): any[] {
    if (!source || typeof source !== 'object') return [];
    let key: string;
    switch (metric) {
      case 'tokens':
        key = 'most_tokens_user';
        break;
      case 'questions':
        key = 'most_questions_user';
        break;
      case 'conversations':
        key = 'most_conversations_user';
        break;
      case 'sensitive':
        key = 'most_sensitive_questions_user';
        break;
      default:
        return [];
    }
    const arr = source[key];
    return Array.isArray(arr) ? arr : [];
  }

  private applyMainAnalyticsLeaderboardMeta(allRows: unknown[]): void {
    const n = allRows.length;
    this.leaderboardRowCount = n;
    this.leaderboardLimit = this.leaderboardClientPageSize;
    this.leaderboardTotalPages = Math.max(
      1,
      Math.ceil(n / this.leaderboardClientPageSize),
    );
  }

  private extractLeaderboardListFromAnalytics(res: any): unknown[] {
    const candidates = [
      res?.leaderboard,
      res?.token_leaderboard,
      res?.top_users_by_tokens,
      res?.users_leaderboard,
      res?.top_users,
    ];
    for (const c of candidates) {
      if (Array.isArray(c) && c.length > 0) {
        return c;
      }
    }
    return [];
  }

  private applyLeaderboardMeta(res: any): void {
    if (res?.active_user_count != null) {
      this.activeUsersCount = Number(res.active_user_count) || 0;
    }
    this.leaderboardRowCount = Number(res?.total_count ?? 0) || 0;
    this.leaderboardPage = res?.page ?? this.leaderboardPage;
    this.leaderboardPageInput = this.leaderboardPage;
    this.leaderboardTotalPages = Math.max(
      1,
      Number(res?.total_pages ?? 1) || 1,
    );
    if (res?.limit != null) {
      this.leaderboardLimit = res.limit;
    }
  }

  loadLeaderboardPage(page?: number): void {
    const targetPage = page ?? this.leaderboardPage;
    const isFirst = this.leaderboardModalRows.length === 0;
    if (isFirst) {
      this.loadingLeaderboard = true;
    } else {
      this.leaderboardPageLoading = true;
    }

    if (this.usesMainAnalyticsLeaderboard()) {
      const all = this.getMainAnalyticsLeaderboardRows(this.leaderboardMetric);
      this.applyMainAnalyticsLeaderboardMeta(all);
      const safePage = Math.min(
        Math.max(targetPage, 1),
        this.leaderboardTotalPages,
      );
      this.leaderboardPage = safePage;
      this.leaderboardPageInput = safePage;
      const limit = this.leaderboardLimit;
      const start = (safePage - 1) * limit;
      const slice = all.slice(start, start + limit);
      this.leaderboardModalRows = this.mapTokenRowsToLeaderboard(
        slice,
        this.leaderboardMetric,
        start,
      );
      if (safePage === 1) {
        this.leaderboardCardRows = this.mapTokenRowsToLeaderboard(
          all,
          this.leaderboardMetric,
          0,
        ).slice(0, this.leaderboardPreviewMax);
      }
      this.loadingLeaderboard = false;
      this.leaderboardPageLoading = false;
      this.cdr.markForCheck();
      return;
    }

    this.chatService
      .getUserTokensDetails(targetPage, this.leaderboardMetric)
      .subscribe({
        next: (res: any) => {
          this.applyLeaderboardMeta(res);
          this.leaderboardModalRows = this.mapTokenRowsToLeaderboard(
            res?.data ?? [],
            this.leaderboardMetric,
          );
          if (targetPage === 1) {
            this.leaderboardCardRows = this.leaderboardModalRows.slice(
              0,
              this.leaderboardPreviewMax,
            );
          }
          this.loadingLeaderboard = false;
          this.leaderboardPageLoading = false;
          this.cdr.markForCheck();
        },
        error: (err: unknown) => {
          console.error(err);
          this.toastService.show('Failed to load leaderboard', 'error');
          this.loadingLeaderboard = false;
          this.leaderboardPageLoading = false;
          this.cdr.markForCheck();
        },
      });
  }

  goToLeaderboardPage(page: number): void {
    if (
      page < 1 ||
      page > this.leaderboardTotalPages ||
      page === this.leaderboardPage
    ) {
      this.leaderboardPageInput = this.leaderboardPage;
      return;
    }
    if (!this.showLeaderboardModal()) {
      this.showLeaderboardModal.set(true);
    }
    this.loadLeaderboardPage(page);
  }

  onLeaderboardPageInputSubmit(): void {
    const raw = this.leaderboardPageInput?.toString().trim();
    if (!raw) {
      this.leaderboardPageInput = this.leaderboardPage;
      return;
    }
    const val = Number.parseInt(raw, 10);
    if (!Number.isNaN(val) && val >= 1 && val <= this.leaderboardTotalPages) {
      this.goToLeaderboardPage(val);
    } else {
      this.leaderboardPageInput = this.leaderboardPage;
      this.toastService.show(
        `Please enter a page between 1 and ${this.leaderboardTotalPages}`,
        'error',
      );
    }
  }
  leaderboardMetricColumnLabel(): string {
    return this.leaderboardMetric === 'tokens' ? 'TOKENS' : 'COUNT';
  }

  leaderboardMetricLabel(): string {
    return (
      this.leaderboardMetricOptions.find(
        (o) => o.value === this.leaderboardMetric,
      )?.label ?? 'Most Tokens'
    );
  }

  toggleLeaderboardMetricMenu(): void {
    if (this.loadingLeaderboardCard) return;
    this.leaderboardMetricMenuOpen.update((open) => !open);
  }

  selectLeaderboardMetric(value: LeaderboardMetric): void {
    this.leaderboardMetricMenuOpen.set(false);
    if (this.leaderboardMetric === value) return;
    this.leaderboardMetric = value;
    this.onLeaderboardMetricChange();
  }

  @HostListener('document:click', ['$event'])
  onLeaderboardMetricDocumentClick(event: MouseEvent): void {
    if (!this.leaderboardMetricMenuOpen()) return;
    const root = this.leaderboardMetricDropdownRef?.nativeElement;
    if (root && !root.contains(event.target as Node)) {
      this.leaderboardMetricMenuOpen.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  closeLeaderboardMetricMenu(): void {
    this.leaderboardMetricMenuOpen.set(false);
  }

  onLeaderboardMetricChange(): void {
    this.leaderboardPage = 1;
    this.leaderboardPageInput = 1;
    if (this.showLeaderboardModal()) {
      this.loadLeaderboardPage(1);
    } else {
      this.loadLeaderboardCardData();
    }
  }

  loadLeaderboardCardData(): void {
    this.loadingLeaderboardCard = true;

    if (this.usesMainAnalyticsLeaderboard()) {
      const all = this.getMainAnalyticsLeaderboardRows(this.leaderboardMetric);
      this.applyMainAnalyticsLeaderboardMeta(all);
      this.leaderboardPage = 1;
      this.leaderboardPageInput = 1;
      this.leaderboardCardRows = this.mapTokenRowsToLeaderboard(
        all,
        this.leaderboardMetric,
        0,
      ).slice(0, this.leaderboardPreviewMax);
      this.loadingLeaderboardCard = false;
      this.cdr.markForCheck();
      return;
    }

    this.chatService.getUserTokensDetails(1, this.leaderboardMetric).subscribe({
      next: (res: any) => {
        this.applyLeaderboardMeta(res);
        this.leaderboardCardRows = this.mapTokenRowsToLeaderboard(
          res?.data ?? [],
          this.leaderboardMetric,
        ).slice(0, this.leaderboardPreviewMax);
        this.loadingLeaderboardCard = false;
        this.cdr.markForCheck();
      },
      error: (err: unknown) => {
        console.error(err);
        this.toastService.show('Failed to load leaderboard', 'error');
        this.leaderboardCardRows = [];
        this.loadingLeaderboardCard = false;
        this.cdr.markForCheck();
      },
    });
  }

  private leaderboardNumericFromRow(
    row: any,
    metric: LeaderboardMetric,
  ): number {
    switch (metric) {
      case 'questions':
        return (
          Number(
            row?.questions_count ??
              row?.total_questions ??
              row?.question_count ??
              0,
          ) || 0
        );
      case 'conversations':
        return (
          Number(
            row?.conversation_count ??
              row?.conversations_count ??
              row?.total_conversations ??
              0,
          ) || 0
        );
      case 'sensitive':
        return (
          Number(row?.sensitive_questions_count ?? row?.sensitive_count ?? 0) ||
          0
        );
      default:
        return Number(row?.total_tokens_used ?? row?.tokens_used ?? 0) || 0;
    }
  }

  private mapTokenRowsToLeaderboard(
    rows: any[],
    metric: LeaderboardMetric = 'tokens',
    rankBase?: number,
  ): Array<{
    rank: number;
    user: string;
    tokens: number;
  }> {
    const base =
      rankBase !== undefined && rankBase !== null
        ? rankBase
        : (this.leaderboardPage - 1) * this.leaderboardLimit;
    const byUser = new Map<string, number>();
    for (const row of rows) {
      const user = String(
        row?.user_value ?? row?.email ?? row?.username ?? row?.user_id ?? '—',
      );
      const v = this.leaderboardNumericFromRow(row, metric);
      byUser.set(user, (byUser.get(user) ?? 0) + v);
    }
    return [...byUser.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([user, tokens], index) => ({
        rank: base + index + 1,
        user,
        tokens,
      }));
  }

  calcTotalResponses(pairs: { key: string; value: number }[]): number {
    return pairs.reduce((sum, p) => sum + p.value, 0);
  }

  pct(value: number, total: number): number {
    return total === 0 ? 0 : +((value / total) * 100).toFixed(1);
  }

  private responseTypeKeyNorm(key: string): string {
    return key.toLowerCase().replace(/[\s_\-]+/g, '');
  }
  responseTypeBarColor(key: string): string {
    const k = this.responseTypeKeyNorm(key);
    if (k.includes('cache')) return '#EF4444';
    if (k.includes('noncontent')) return '#EF4444';
    if (k.includes('normal')) return '#10B981';
    if (k.includes('sensitive')) return '#3B82F6';
    return '#10B981';
  }
  responseTypeFillWidth(
    p: { key: string; value: number },
    total: number,
  ): string {
    const pc = this.pct(p.value, total);
    const k = this.responseTypeKeyNorm(p.key);
    const redZero =
      (k.includes('cache') || k.includes('noncontent')) && pc === 0;
    if (redZero) return '5px';
    if (pc === 0) return '0%';
    return `${pc}%`;
  }

  downloadBlob(blob: Blob, filename: string): void {
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
  private finishExport(
    blob: Blob,
    filename: string,
    successMessage: string,
  ): void {
    try {
      if (!blob?.size) {
        throw new Error('Export returned empty file');
      }
      this.downloadBlob(blob, filename);
      this.toastService.show(successMessage, 'success', 4500, 'bottom-banner');
    } catch (e) {
      console.error(e);
      const message = e instanceof Error ? e.message : 'Export failed';
      this.toastService.show(message, 'error');
    } finally {
      this.submittingExport.set(false);
    }
  }

  nowStamp(): string {
    return formatDate(new Date(), 'yyyyMMdd_HHmm', 'en-IN');
  }
}
