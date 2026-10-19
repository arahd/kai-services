export interface PolicyMeta {
  title: string;
  updated_date: string;
  intro?: string;
}

export interface PolicySection {
  order: number;
  title: string;
  description?: string;
  items?: string[];
  subtext?: string;
}

export interface PolicyConfigurationItem {
  key: string;
  value: string;
  description: string;
}

export type PolicyConfigurations = Record<string, PolicyConfigurationItem[]>;

export interface PrivacyPolicyContent {
  policy: PolicyMeta;
  sections: PolicySection[];
}

export interface PrivacyPolicyApiResponse {
  success: boolean;
  policy_content: PrivacyPolicyContent;
  configurations: PolicyConfigurations;
}
