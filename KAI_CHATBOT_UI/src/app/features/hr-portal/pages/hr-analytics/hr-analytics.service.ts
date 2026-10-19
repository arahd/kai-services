import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { getUserTimezone } from '@core/utils/timezone.util';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import {
  HRAnalyticsDashboardData,
  HRAnalyticsFilters,
  HRDashboardOverviewResponse,
  HRModuleCard,
  HRModuleDistribution,
  HRRecentActivityDto,
  HRRecentActivityResponse,
  HRReportTrendItem,
  HRReportTrendResponse,
  HRTopUserDto,
  HRTopUsersResponse,
  RecentActivityUIItem,
} from './hr-analytics.model';
import { extractUploadedFileList } from '../hr-history/hr-history.service';

@Injectable({
  providedIn: 'root',
})
export class HrAnalyticsService {
  private http = inject(HttpClient);
  private configService = inject(ConfigService);
  private storageService = inject(SessionStorageService);
  private tokenService = inject(TokenService);

  private getApiUrl(endpoint: string): string {
    const baseUrl = (this.configService.getHrPortalUrl() || '').replace(/\/$/, '');
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${baseUrl}${cleanEndpoint}`;
  }

  private getAuthHeaders(): HttpHeaders {
    const token = this.tokenService.getToken() || this.storageService.getJwtToken() || '';
    let headers = new HttpHeaders({
      'Content-Type': 'application/json',
      'X-Timezone': getUserTimezone(),
    });
    if (token) {
      headers = headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  private buildParams(filters?: HRAnalyticsFilters): HttpParams {
    let params = new HttpParams();
    if (!filters) return params;

    if (filters.fromDate) {
      params = params.set('from_date', filters.fromDate);
    }
    if (filters.toDate) {
      params = params.set('to_date', filters.toDate);
    }
    if (filters.dateRange && filters.dateRange !== 'all') {
      params = params.set('date_range', filters.dateRange);
    }
    if (filters.module && filters.module !== 'all') {
      params = params.set('module', filters.module);
    }
    if (filters.user && filters.user !== 'all') {
      params = params.set('email_id', filters.user);
    }
    return params;
  }

  /**
   * 1. GET /api/hr/dashboard
   * Summary Cards, Module Cards, Success vs Failed Distribution, Module Distribution
   */
  getDashboardOverview(filters?: HRAnalyticsFilters): Observable<HRDashboardOverviewResponse> {
    const url = this.getApiUrl('/hr/dashboard');
    const params = this.buildParams(filters);

    return this.http
      .get<HRDashboardOverviewResponse>(url, { headers: this.getAuthHeaders(), params })
      .pipe(
        catchError((err) => {
          console.warn('[HrAnalyticsService] getDashboardOverview failed:', err);
          return of({
            summary: {
              total_reports: 0,
              successful_reports: 0,
              failed_reports: 0,
              active_users: 0,
              success_rate: 0,
              total_tokens_used: 0,
              average_tokens: 0,
              jd_analysis_count: 0,
            },
            module_cards: [],
            status_distribution: { success: 0, failed: 0 },
            module_distribution: [],
          });
        }),
      );
  }

  /**
   * 2. GET /api/hr/dashboard/report-trend
   * Analytics Trend Graph, Resume Analytics Graph, JD Analysis Graph, Visa Analytics Graph
   */
  getReportTrend(filters?: HRAnalyticsFilters): Observable<HRReportTrendResponse> {
    const url = this.getApiUrl('/hr/dashboard/report-trend');
    const params = this.buildParams(filters);

    return this.http
      .get<HRReportTrendResponse>(url, { headers: this.getAuthHeaders(), params })
      .pipe(
        catchError((err) => {
          console.warn('[HrAnalyticsService] getReportTrend failed:', err);
          return of({ success: false, data: [] });
        }),
      );
  }

  /**
   * 3. GET /api/hr/dashboard/top-users
   * Top HR Users Table
   */
  getTopUsers(filters?: HRAnalyticsFilters): Observable<HRTopUsersResponse> {
    const url = this.getApiUrl('/hr/dashboard/top-users');
    const params = this.buildParams(filters);

    return this.http
      .get<HRTopUsersResponse>(url, { headers: this.getAuthHeaders(), params })
      .pipe(
        catchError((err) => {
          console.warn('[HrAnalyticsService] getTopUsers failed:', err);
          return of({ success: false, data: [] });
        }),
      );
  }

  /**
   * 4. GET /api/hr/dashboard/recent-activity
   * Recent Activity Table
   */
  getRecentActivity(filters?: HRAnalyticsFilters): Observable<HRRecentActivityResponse> {
    const url = this.getApiUrl('/hr/dashboard/recent-activity');
    const params = this.buildParams(filters).set('tz', getUserTimezone());

    return this.http
      .get<HRRecentActivityResponse>(url, { headers: this.getAuthHeaders(), params })
      .pipe(
        catchError((err) => {
          console.warn('[HrAnalyticsService] getRecentActivity failed:', err);
          return of({ success: false, data: [] });
        }),
      );
  }

  /**
   * Fetches all 4 split endpoints concurrently and aggregates them into the dashboard view model
   */
  getDashboardData(filters?: HRAnalyticsFilters): Observable<HRAnalyticsDashboardData> {
    return forkJoin({
      overview: this.getDashboardOverview(filters),
      trendRes: this.getReportTrend(filters),
      topUsersRes: this.getTopUsers(filters),
      recentActivityRes: this.getRecentActivity(filters),
    }).pipe(
      map(({ overview, trendRes, topUsersRes, recentActivityRes }) =>
        this.transformCombinedResponses(
          overview,
          trendRes?.data || [],
          topUsersRes?.data || [],
          recentActivityRes?.data || [],
        ),
      ),
      catchError((err) => {
        console.error('[HrAnalyticsService] getDashboardData aggregated error:', err);
        return of(this.getEmptyDashboardData());
      }),
    );
  }

  /**
   * GET /hr/history/users
   */
  getUsers(): Observable<string[]> {
    const url = this.getApiUrl('/hr/history/users');
    return this.http.get<{ success: boolean; data: string[] }>(url, { headers: this.getAuthHeaders() }).pipe(
      map((res) => (res && res.success && Array.isArray(res.data) ? res.data : [])),
      catchError(() => of([])),
    );
  }

  /**
   * GET /hr/history/modules
   */
  getModules(): Observable<string[]> {
    const url = this.getApiUrl('/hr/history/modules');
    return this.http.get<{ success: boolean; data: string[] }>(url, { headers: this.getAuthHeaders() }).pipe(
      map((res) => (res && res.success && Array.isArray(res.data) ? res.data : [])),
      catchError(() => of([])),
    );
  }

  /**
   * GET /hr/history/process-types
   */
  getProcessTypes(): Observable<string[]> {
    const url = this.getApiUrl('/hr/history/process-types');
    return this.http.get<{ success: boolean; data: string[] }>(url, { headers: this.getAuthHeaders() }).pipe(
      map((res) => (res && res.success && Array.isArray(res.data) ? res.data : [])),
      catchError(() => of([])),
    );
  }

  /**
   * Aggregates and transforms all 4 API results
   */
  private transformCombinedResponses(
    overview: HRDashboardOverviewResponse,
    trendData: HRReportTrendItem[],
    topUsersData: HRTopUserDto[],
    recentActivityData: HRRecentActivityDto[],
  ): HRAnalyticsDashboardData {
    const summary = overview?.summary || {
      total_reports: 0,
      successful_reports: 0,
      failed_reports: 0,
      active_users: 0,
      success_rate: 0,
      total_tokens_used: 0,
      average_tokens: 0,
      jd_analysis_count: 0,
    };

    const statusDist = overview?.status_distribution || {
      success: summary.successful_reports || 0,
      failed: summary.failed_reports || 0,
    };

    const moduleCards: HRModuleCard[] = (
      Array.isArray(overview?.module_cards) ? overview.module_cards : []
    ).map((card) => ({
      process: card.process || 'Resume',
      process_type: card.process_type || card.process || 'General',
      count: card.count ?? 0,
    }));

    const moduleDist: HRModuleDistribution[] = Array.isArray(overview?.module_distribution)
      ? overview.module_distribution
      : [];

    // Parse Top Users
    const topUsers = (Array.isArray(topUsersData) ? topUsersData : []).map((u, i) => ({
      rank: u.rank || i + 1,
      user: u.user || u.email_id || 'Unknown',
      module: u.module || 'Resume',
      tokens: (u.tokens ?? u.token_used ?? 0).toLocaleString(),
      reportCount: u.report_count ?? 0,
    }));

    // Parse Recent Activity
    const recentActivities: RecentActivityUIItem[] = (
      Array.isArray(recentActivityData) ? recentActivityData : []
    ).map((item, i) => {
      const rawStatus = (item.status || '').toUpperCase();
      let statusText: 'Success' | 'Failed' = 'Success';
      if (rawStatus === 'FAILED') {
        statusText = 'Failed';
      } else if (rawStatus === 'SUCCESS') {
        statusText = 'Success';
      } else if (!item.status) {
        statusText = 'Success';
      }

      const rawDate = item.created_date || item.date_time;
      const { date: dateStr, time: timeStr, full: fullDateStr } = this.formatDateTime(rawDate);

      const files = extractUploadedFileList(item.uploaded_file_name || item.downloaded_file_name);

      return {
        sNo: i + 1,
        id: i + 1,
        createdDate: fullDateStr,
        date: dateStr,
        time: timeStr,
        user: item.email_id || item.user || 'Unknown',
        module: item.process || 'Resume',
        processType: item.process_type || item.process || '-',
        uploadedFileName: files.join(', ') || '-',
        uploadedFiles: files,
        tokensUsed: (item.token_used ?? 0).toLocaleString(),
        status: statusText,
      };
    });

    // Parse & sort Trend Data
    const rawTrend = Array.isArray(trendData) ? [...trendData] : [];
    rawTrend.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const categories: string[] = [];
    const seriesMap = new Map<string, number[]>();
    const totalCounts: number[] = [];

    // Discover dynamic series keys (e.g. "Resume_Formatter", "Resume_JD Analysis", etc.)
    const dynamicKeys = new Set<string>();
    rawTrend.forEach((item) => {
      Object.keys(item).forEach((k) => {
        if (k !== 'date' && k !== 'success' && typeof item[k] === 'number') {
          dynamicKeys.add(k);
        }
      });
    });

    // Initialize series lists
    dynamicKeys.forEach((key) => {
      seriesMap.set(key, []);
    });

    rawTrend.forEach((item) => {
      if (item.date) {
        categories.push(this.formatTrendDate(item.date));

        let dayTotal = 0;
        dynamicKeys.forEach((key) => {
          const val = typeof item[key] === 'number' ? item[key] : 0;
          seriesMap.get(key)!.push(val);
          dayTotal += val;
        });

        if (dynamicKeys.size === 0) {
          // If no specific breakdown keys, check for count
          const count = typeof (item as any).count === 'number' ? (item as any).count : 0;
          dayTotal = count;
        }
        totalCounts.push(dayTotal);
      }
    });

    // Convert seriesMap to ApexCharts series
    const chartSeries: { name: string; data: number[] }[] = [];
    if (dynamicKeys.size > 0) {
      dynamicKeys.forEach((key) => {
        const formattedName = key.replace(/_/g, ' ');
        chartSeries.push({
          name: formattedName,
          data: seriesMap.get(key) || [],
        });
      });
    } else if (totalCounts.length > 0) {
      chartSeries.push({
        name: 'Reports Processed',
        data: totalCounts,
      });
    }

    return {
      kpis: {
        totalRequests: {
          title: 'Total Requests',
          value: (summary.total_reports ?? 0).toLocaleString(),
        },
        successRate: {
          title: 'Success Rate',
          value: `${(summary.success_rate ?? 0).toFixed(1)}%`,
        },
        failedRequests: {
          title: 'Failed Requests',
          value: (summary.failed_reports ?? 0).toLocaleString(),
        },
        totalTokensUsed: {
          title: 'Total Tokens Used',
          value: (summary.total_tokens_used ?? 0).toLocaleString(),
        },
        activeHrUsers: {
          title: 'Active HR Users',
          value: `${summary.active_users ?? 0} Users`,
        },
        averageTokens: {
          title: 'Average Tokens / Report',
          value: (summary.average_tokens ?? 0).toLocaleString(),
        },
        jdAnalysisCount: {
          title: 'JD Analysis Count',
          value: (summary.jd_analysis_count ?? 0).toLocaleString(),
        },
      },
      moduleCards,
      moduleDistribution: moduleDist,
      trends: {
        categories,
        series: chartSeries,
        totalCounts,
      },
      successFailureRatio: {
        success: statusDist.success ?? 0,
        failed: statusDist.failed ?? 0,
      },
      topUsers,
      recentActivities,
    };
  }

  private formatTrendDate(dateStr: string): string {
    try {
      const parts = dateStr.split('-');
      if (parts.length === 3) {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const monthName = months[parseInt(parts[1], 10) - 1] || parts[1];
        return `${monthName} ${parseInt(parts[2], 10)}`;
      }
      return dateStr;
    } catch {
      return dateStr;
    }
  }

  formatDateTime(raw?: string): { date: string; time: string; full: string } {
    if (!raw || raw === '-') return { date: '-', time: '', full: '-' };
    const trimmed = String(raw).trim();

    try {
      const isoCandidate = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
      let d = new Date(isoCandidate);
      if (isNaN(d.getTime())) {
        d = new Date(trimmed);
      }
      if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = d.toLocaleString('en-US', { month: 'short' });
        const year = d.getFullYear();
        const date = `${day} ${month} ${year},`;
        const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
        return { date, time, full: `${date} ${time}` };
      }
    } catch {}

    if (trimmed.includes(',')) {
      const lastCommaIndex = trimmed.lastIndexOf(',');
      const datePart = trimmed.substring(0, lastCommaIndex).trim();
      const timePart = trimmed.substring(lastCommaIndex + 1).trim();
      return { date: `${datePart},`, time: timePart, full: trimmed };
    }

    return { date: trimmed, time: '', full: trimmed };
  }

  private formatDate(raw?: string): string {
    if (!raw) return '-';
    try {
      const parsed = new Date(raw.replace(' ', 'T'));
      if (isNaN(parsed.getTime())) return raw;
      return parsed.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return raw;
    }
  }

  private getEmptyDashboardData(): HRAnalyticsDashboardData {
    return {
      kpis: {
        totalRequests: { title: 'Total Requests', value: '0' },
        successRate: { title: 'Success Rate', value: '0%' },
        failedRequests: { title: 'Failed Requests', value: '0' },
        totalTokensUsed: { title: 'Total Tokens Used', value: '0' },
        activeHrUsers: { title: 'Active HR Users', value: '0 Users' },
        averageTokens: { title: 'Average Tokens / Report', value: '0' },
        jdAnalysisCount: { title: 'JD Analysis Count', value: '0' },
      },
      moduleCards: [],
      moduleDistribution: [],
      trends: {
        categories: [],
        series: [],
        totalCounts: [],
      },
      successFailureRatio: {
        success: 0,
        failed: 0,
      },
      topUsers: [],
      recentActivities: [],
    };
  }
}
