export type AgentType = 'SIMPLE' | 'PIPELINE' | 'PEV';
export type AgentAccess = 'PRIVATE' | 'GROUP' | 'PUBLIC';

export interface AgentItem {
  id: string;
  agent_name: string;
  agent_type: AgentType;
  agent_access: AgentAccess;
  agent_url: string;
  description?: string;
  is_active: boolean;
  user_id: string;
  user_identity: string;
  user_role: string;
  created_at: string;
  updated_at?: string | null;
  deleted_at?: string | null;
  project_name?: string | null;
}

export interface GetAgentsResponse {
  status: string;
  count: {
    total: number;
    by_access: {
      private: number;
      group: number;
      public: number;
    };
    by_type: {
      simple: number;
      pipeline: number;
      pev: number;
    };
  };
  private: AgentItem[];
  group: AgentItem[];
  public: AgentItem[];
  pagination: {
    has_next: boolean;
    page: number;
    page_size: number;
  };
  is_admin: boolean;
  k_platform_role: string;
}

export interface AgentChatMessage {
  id: string;
  sender: 'user' | 'agent';
  message: string;
  timestamp: Date;
  chatId?: string;
  isLoading?: boolean;
}
