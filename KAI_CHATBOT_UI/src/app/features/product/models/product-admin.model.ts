export interface ProductPermissionItem {
  key: string;
  label: string;
  description?: string;
  enabled: boolean;
}

export type ProductRoleTier = 'admin' | 'dev' | 'user' | 'simple' | 'none';

export interface ProductRoleOption {
  key: string;
  label: string;
  tier: ProductRoleTier;
  description?: string;
}

export interface ProductSuite {
  id: string;
  name: string;
  roles: ProductRoleOption[];
  shortName?: string;
  icon?: string;
  description?: string;
}

export interface UserProductRoleBadge {
  productId?: string;
  product: string;
  role: string;
  tier: ProductRoleTier | 'global';
}

export interface ProductGroupViewModel {
  suite: ProductSuite;
  isEnabled: boolean;
  activeRoleKey: string | null;
  activeRoleTier: ProductRoleTier;
  activeRoleLabel: string;
}

export interface ProductUserRow {
  id?: number;
  username: string;
  enabled_count?: number;
  total_count?: number;
  permissions?: Record<string, boolean>;
  is_product_admin?: boolean;
  is_kaf_admin?: boolean;
  is_kaf_dev?: boolean;
  is_kaf_user?: boolean;
  is_k_agent_admin?: boolean;
  is_k_agent_simple?: boolean;
  is_k_agent_user?: boolean;
  is_docspec_admin?: boolean;
  is_docspec_user?: boolean;
  is_k_spec_admin?: boolean;
  kplatform?: boolean;
  kaf?: boolean;
  docspec?: boolean;
  kspec?: boolean;
  [key: string]: any;
}

export interface GetProductUserPayload {
  bot_type: string;
  username: string;
}

export interface UpdateProductUserPayload {
  bot_type: string;
  username: string;
  column_name: string;
  column_value: boolean;
}

export interface ProductUsersListResponse {
  success?: boolean;
  data?: ProductUserRow[];
  users?: ProductUserRow[];
  results?: ProductUserRow[];
  total_count?: number;
  total_pages?: number;
  page?: number;
  limit?: number;
  message?: string;
}

export interface ProductUserDetailResponse {
  success?: boolean;
  data?: Record<string, any>;
  username?: string;
  bot_type?: string;
  is_product_admin?: boolean;
  [key: string]: any;
}
