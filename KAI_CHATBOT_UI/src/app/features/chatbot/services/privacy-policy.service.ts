import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { AdminApiService } from '@features/admin-dashboard/services/admin-api.service';
import {
  PrivacyPolicyApiResponse,
  PolicySection,
  PolicyConfigurations,
} from '../pages/privacy-policy/privacy-policy.model';
import { DEFAULT_PRIVACY_POLICY } from '../pages/privacy-policy/privacy-policy.data';

@Injectable({
  providedIn: 'root',
})
export class PrivacyPolicyService {
  private readonly adminApi = inject(AdminApiService);

  /**
   * Fetches privacy policy content and configurations from the backend API.
   * If the API fails or is offline, falls back gracefully to default policy content.
   */
  getPrivacyPolicy(): Observable<PrivacyPolicyApiResponse> {
    return this.adminApi.getPrivacyPolicy().pipe(
      map((res: any) => this.normalizeResponse(res)),
      catchError((error) => {
        console.warn(
          '[PrivacyPolicyService] Backend call failed, using default privacy policy:',
          error
        );
        return of(DEFAULT_PRIVACY_POLICY);
      })
    );
  }

  /**
   * Normalizes arbitrary API response structure into strongly-typed PrivacyPolicyApiResponse.
   */
  normalizeResponse(res: any): PrivacyPolicyApiResponse {
    if (!res || typeof res !== 'object') {
      return DEFAULT_PRIVACY_POLICY;
    }

    const rawContent =
      res.policy_content || res.data?.policy_content || res.data || {};
    const rawPolicy = rawContent.policy || {};

    const title =
      rawPolicy.title || DEFAULT_PRIVACY_POLICY.policy_content.policy.title;
    const updated_date =
      rawPolicy.updated_date ||
      DEFAULT_PRIVACY_POLICY.policy_content.policy.updated_date;
    const intro =
      rawPolicy.intro ||
      rawContent.intro ||
      DEFAULT_PRIVACY_POLICY.policy_content.policy.intro;

    let sections: PolicySection[] = Array.isArray(rawContent.sections)
      ? rawContent.sections
      : [];

    if (sections.length === 0) {
      sections = DEFAULT_PRIVACY_POLICY.policy_content.sections;
    } else {
      // Sort sections by order
      sections = [...sections].sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    const rawConfigurations: PolicyConfigurations =
      res.configurations ||
      res.data?.configurations ||
      DEFAULT_PRIVACY_POLICY.configurations;

    return {
      success: res.success ?? true,
      policy_content: {
        policy: {
          title,
          updated_date,
          intro,
        },
        sections,
      },
      configurations: rawConfigurations,
    };
  }
}
