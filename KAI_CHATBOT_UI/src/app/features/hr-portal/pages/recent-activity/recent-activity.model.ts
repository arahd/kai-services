export interface RecentActivityDto {
  id?: number | string;
  date_time: string;
  uploaded_file_name?: string | string[] | null;
  downloaded_file_name?: string | null;
  download_url?: string | null;
  status?: string | null;
  validation_score?: number | string | null;
  module?: string | null;
  process_type?: string | null;
  email_id?: string | null;
}

export interface RecentActivityApiResponse {
  success: boolean;
  count?: number;
  total_count?: number;
  page?: number;
  page_size?: number;
  data: RecentActivityDto[];
}

export interface RecentActivityPagedResult {
  records: RecentActivityUI[];
  totalCount: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface RecentActivityUI {
  id: string | number;
  date: string;
  time: string;
  dateTimeRaw: string;
  module: string;
  processType: string;
  uploadedFileName: string;
  uploadedFiles: string[];
  downloadedFileName: string;
  downloadUrl: string;
  status: string;
  validationScore?: string;
}
