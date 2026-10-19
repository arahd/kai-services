export interface HrUserAccess {
  id?: number;
  user_name: string;
  email_id: string;
  is_admin: boolean;
  resume_internal: boolean;
  resume_offshore: boolean;
  resume_onsite: boolean;
  visa_business: boolean;
  visa_extension: boolean;
  visa_ict: boolean;
  success?: boolean;
}

export interface HrUsersListResponse {
  data: HrUserAccess[];
  success: boolean;
}

export interface HrApiResponse {
  message: string;
  success: boolean;
}

export type CreateHrUserDto = Omit<HrUserAccess, 'id' | 'success'>;
export type UpdateHrUserDto = Partial<Omit<HrUserAccess, 'id' | 'email_id' | 'success'>>;
