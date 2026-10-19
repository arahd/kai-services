
export interface SendMessagePayload {
  language_type: string;
  query: string;
  bot_type: string;
  userId: string;
  model?: string;
  conversationID?: string | null;
  project_id?: string | number | null;
  is_stream?: boolean;
  is_from_upload?: boolean;
  uploaded_doc_ids?: (string | number)[];
  uploaded_file_names?: string[];
  exceeds_threshold?: boolean[];
  existing_filenames?: string[];
  existing_doc_ids?: string[];
  existing_threshold?: boolean[];
}

export interface EndChatPayload {
  conversationID: string;
  bot_type: string;
}

export interface SuggestionsPayload {
  conversationID: string | null;
}

export interface SuggestionsResponse {
  follow_up_questions?: string[];
}

export interface PendingUser {
  _id: number;
  email: string;
  approved: string;
  models: { _id: number; model_name: string }[];
}

export interface RegisteredUserModel {
  _id: number;
  model_name: string;
}

export interface RegisteredUser {
  email: string;
  name?: string;
  models?: {
    email: string;
    models: RegisteredUserModel[];
  };
  approved_time?: string;
}

export interface ApprovePayload {
  email: string;
  approved: 'yes' | 'no';
  models: string[];
}

export interface FetchPromptPayload {
  prompt_name: string;
}

export interface FetchPromptResponse {
  content: string;
  message?: string;
  prompt_name?: string;
}

export interface UpdatePromptPayload {
  prompt_name: string;
  content: string;
}

export interface UpdatePromptResponse {
  message?: string;
  prompt_name?: string;
}

export interface ConversationHistoryPayload {
  user_string: string;
  bot_type: string;
  language_type: string;
}

// --- New Chat History API Models ---

export interface ChatHistoryListPayload {
  user_string: string;
  bot_type: string;
}

export interface ChatHistoryConversationPayload {
  user_string: string;
  bot_type: string;
  conversation_id: string;
}

export interface ChatHistoryConversationItem {
  bot_type: string;
  conversationID: string;
  conversationName: string;
  created_at: string | null;
  gpt_model_name: string;
  greetings: string;
  is_pinned: boolean;
  language_type: string;
  project_id?: number;
  startTime: string;
  updated_at: string;
  userID: string;
  summary?: string;
  summary_index?: number;
}

export interface ProjectConversationsParams {
  user_string: string;
  bot_type: string;
  project_id: string | number;
  page_number?: number;
  page_size?: number;
}

export interface ProjectConversationsResponse {
  conversations: ChatHistoryConversationItem[];
  page_number: number;
  page_size: number;
  project_id: string;
  total_conversations: number;
  username: string;
}

export interface ChatHistoryMessageItem {
  augContent: string;
  augSrc: any[];
  generated_document_ids: string[];
  generated_document_prompt: string;
  generated_documents_tokens_consumed: string;
  generated_image_ids: string[];
  image_prompt: string | null;
  image_tokens_used: string | null;
  model: string;
  question: string;
  response: string;
  responseType: string;
  time_difference: string;
  timestamp: string;
  tokens_consumed: any;
  uploaded_files: any[];
  user_role: string[];
}

export interface ChatHistoryConversationResponse {
  bot_type: string;
  conversation: ChatHistoryMessageItem[];
  conversationID: string;
  conversationName: string | null;
  created_at: string | null;
  gpt_model_name: string;
  greetings: string;
  is_pinned: boolean;
  language_type: string;
  project_id?: number;
  startTime: string;
  updated_at: string;
  userID: string;
}

export interface ProjectConversationParams {
  user_string: string;
  bot_type: string;
  project_id: string | number;
  conversation_id: string;
}

export interface DeleteChatPayload {
  conversationID: string;
  project_id?: string | number;
}

export interface PinChatPayload {
  conversationID: string;
  project_id?: string | number;
}

export interface RenameChatPayload {
  conversationID: string;
  conversationName: string;
  project_id?: string | number;
}

export interface ShareChatPayload {
  conversationID: string;
  date_info: string;
  user_string: string;
  bot_type: string;
  project_id?: string | number;
}

export interface BugReportsPayload {
  bot_type: string;
  page: number;
  limit: number;
  filter?: { search?: string; status?: string };
}

export interface UpdateBugStatusPayload {
  ticket_number: string;
  state: string;
}

export interface BugAttachmentPayload {
  attachment_id: number;
}

// --- User Management Models ---

export type UserRole = 'Admin' | 'Bot Admin' | 'User';
export type UserAccess = 'Enabled' | 'Disabled';

export interface UserManagementUser {
  username?: string;
  email: string;
  role: UserRole;
  access: UserAccess;
  allow_sensitive_search?: boolean;
  input_token_limit: number;
  output_token_limit: number;
  maximum_token_limit: number;
  input_tokens_used: number;
  output_tokens_used: number;
  total_daily_usage: number;
  total_tokens: number;
}

export interface UserManagementQueryParams {
  page: number;
  page_size: number;
  search?: string;
  access?: 'Enabled' | 'Disabled';
  role?: string;
}

export interface UserManagementResponse {
  page: number;
  page_size: number;
  total_records: number;
  users: UserManagementUser[];
}

export interface UserManagementSummaryResponse {
  total_users: number;
  disabled_access: number;
  daily_tokens_consumed: number;
  enabled_access?: number;
}

export interface UpdateUserPayload {
  email: string;
  allow_sensitive_search: boolean;
  input_token_limit: number;
  output_token_limit: number;
}

export interface UpdateUserResponse {
  message: string;
  email: string;
}

export interface ResetTokensPayload {
  email: string;
}

export interface ResetTokensResponse {
  message: string;
  email: string;
}

// --- Teams Management Models (Task 915) ---

export interface TeamMember {
  email: string;
}

export interface TeamRecord {
  group_id: number;
  group_name: string;
  member_count: number;
  input_token_limit: number;
  output_token_limit: number;
  overall_input_token_usage: number;
  overall_output_token_usage: number;
  daily_input_token_usage: number;
  daily_output_token_usage: number;
}

export interface TeamsListResponse {
  teams: TeamRecord[];
}

export interface TeamMembersResponse {
  group_id: number;
  group_name: string;
  member_count: number;
  members: TeamMember[];
}

export interface CreateTeamPayload {
  group_name: string;
  input_token_limit: number;
  output_token_limit: number;
}

export interface UpdateTeamPayload {
  group_id: number;
  input_token_limit: number;
  output_token_limit: number;
}

export interface TeamMutationResponse {
  message: string;
  team: {
    group_id: number;
    group_name: string;
    input_token_limit: number;
    output_token_limit: number;
  };
}

export interface DeleteTeamResponse {
  group_id: number;
  message: string;
}

export interface TeamMembersMutationPayload {
  group_id: number;
  members: string[];
}

export interface TeamMembersMutationResponse {
  group_id: number;
  members: string[];
  message: string;
}
