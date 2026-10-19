export interface HRAnalyticsFilters {
  dateRange?: string;
  fromDate?: string;
  toDate?: string;
  module: string;
  user: string;
}

export interface HRDashboardSummary {
  total_reports: number;
  successful_reports: number;
  failed_reports: number;
  active_users: number;
  success_rate: number;
  total_tokens_used: number;
  average_tokens: number;
  jd_analysis_count: number;
}

export interface HRModuleCard {
  process: string;
  process_type: string;
  count: number;
}

export interface HRStatusDistribution {
  success: number;
  failed: number;
}

export interface HRModuleDistribution {
  module: string;
  count: number;
}

// 1. GET /api/hr/dashboard Response
export interface HRDashboardOverviewResponse {
  success?: boolean;
  summary: HRDashboardSummary;
  module_cards: HRModuleCard[];
  status_distribution: HRStatusDistribution;
  module_distribution: HRModuleDistribution[];
}

// 2. GET /api/hr/dashboard/report-trend Response
export interface HRReportTrendItem {
  date: string;
  [seriesKey: string]: any;
}

export interface HRReportTrendResponse {
  success: boolean;
  data: HRReportTrendItem[];
}

// 3. GET /api/hr/dashboard/top-users Response
export interface HRTopUserDto {
  rank?: number;
  user?: string;
  email_id?: string;
  module?: string;
  tokens?: number;
  token_used?: number;
  report_count?: number;
}

export interface HRTopUsersResponse {
  success: boolean;
  data: HRTopUserDto[];
}

// 4. GET /api/hr/dashboard/recent-activity Response
export interface HRRecentActivityDto {
  created_date?: string;
  date_time?: string;
  email_id?: string;
  user?: string;
  process?: string;
  process_type?: string;
  status?: string | null;
  token_used?: number;
  uploaded_file_name?: string | string[] | null;
  downloaded_file_name?: string;
  score?: string | number;
}

export interface HRRecentActivityResponse {
  success: boolean;
  data: HRRecentActivityDto[];
}

// Legacy combined interface for compatibility
export interface HRDashboardApiResponse {
  success?: boolean;
  summary?: HRDashboardSummary;
  module_cards?: HRModuleCard[];
  status_distribution?: HRStatusDistribution;
  module_distribution?: HRModuleDistribution[];
  report_trend?: HRReportTrendItem[];
  top_users?: HRTopUserDto[];
  recent_activity?: HRRecentActivityDto[];
}

// UI Models
export interface HRTopUserUI {
  rank: number;
  user: string;
  module: string;
  tokens: string;
  reportCount: number;
}

export interface RecentActivityUIItem {
  sNo: number;
  id: number | string;
  createdDate: string;
  date: string;
  time: string;
  user: string;
  module: string;
  processType: string;
  uploadedFileName: string;
  uploadedFiles: string[];
  tokensUsed: string;
  status: 'Success' | 'Failed';
}

export interface HRKpiMetric {
  title: string;
  value: string | number;
}

export interface HRKpiReport {
  totalRequests: HRKpiMetric;
  successRate: HRKpiMetric;
  failedRequests: HRKpiMetric;
  totalTokensUsed: HRKpiMetric;
  activeHrUsers: HRKpiMetric;
  averageTokens: HRKpiMetric;
  jdAnalysisCount: HRKpiMetric;
}

export interface SuccessFailureRatio {
  success: number;
  failed: number;
}

export interface HRTrendSeriesData {
  categories: string[];
  series: { name: string; data: number[] }[];
  totalCounts: number[];
}

export interface HRAnalyticsDashboardData {
  kpis: HRKpiReport;
  moduleCards: HRModuleCard[];
  moduleDistribution: HRModuleDistribution[];
  trends: HRTrendSeriesData;
  successFailureRatio: SuccessFailureRatio;
  topUsers: HRTopUserUI[];
  recentActivities: RecentActivityUIItem[];
}
