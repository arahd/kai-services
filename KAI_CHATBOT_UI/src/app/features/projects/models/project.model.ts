export interface ProjectItem {
  project_id: number;
  project_name: string;
  created_at: string;
  updated_at?: string;
  description?: string | null;
  conversation_count?: number;
  username?: string;
  username_id?: number;
  is_deleted?: boolean;
  is_pinned?: boolean;
}

export interface ProjectListRequest {
  bot_type: string;
  page: number;
  limit: number;
  username: string;
}

export interface ProjectListResponse {
  count?: number;
  data: ProjectItem[];
  limit: number;
  page: number;
  total: number;
  total_pages?: number;
}

export interface CreateProjectPayload {
  bot_type: string;
  project_name: string;
  username?: string;
}

export interface CreateProjectResponse {
  message: string;
  project: ProjectItem;
}

export interface ProjectConversation {
  conversationID: string;
  title: string;
  created_at: string;
  updated_at?: string;
  message_count?: number;
  is_pinned?: boolean;
  bot_type?: string;
  gpt_model_name?: string;
  greetings?: string;
  language_type?: string;
  project_id?: number;
  startTime?: string;
  userID?: string;
}

