import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminApiService } from '@features/admin-dashboard/services/admin-api.service';
import { PrivacyPolicyService } from './privacy-policy.service';
import { DEFAULT_PRIVACY_POLICY } from '../pages/privacy-policy/privacy-policy.data';

describe('PrivacyPolicyService', () => {
  let service: PrivacyPolicyService;
  let adminApiMock: jasmine.SpyObj<AdminApiService>;

  beforeEach(() => {
    adminApiMock = jasmine.createSpyObj<AdminApiService>('AdminApiService', [
      'getPrivacyPolicy',
    ]);

    TestBed.configureTestingModule({
      providers: [
        PrivacyPolicyService,
        { provide: AdminApiService, useValue: adminApiMock },
      ],
    });

    service = TestBed.inject(PrivacyPolicyService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch and normalize privacy policy from admin API', (done) => {
    const mockApiResponse = {
      success: true,
      policy_content: {
        policy: {
          title: 'Custom Policy',
          updated_date: 'October 1, 2026',
        },
        sections: [
          {
            order: 2,
            title: 'Section 2',
            description: 'Desc 2',
            items: ['Item 2'],
          },
          {
            order: 1,
            title: 'Section 1',
            description: 'Desc 1',
            items: ['Item 1'],
          },
        ],
      },
      configurations: {
        TEST_CAT: [
          {
            key: 'TEST_KEY',
            value: 'TEST_VAL',
            description: 'Test description',
          },
        ],
      },
    };

    adminApiMock.getPrivacyPolicy.and.returnValue(of(mockApiResponse));

    service.getPrivacyPolicy().subscribe((res) => {
      expect(res.success).toBeTrue();
      expect(res.policy_content.policy.title).toBe('Custom Policy');
      expect(res.policy_content.policy.updated_date).toBe('October 1, 2026');
      expect(res.policy_content.sections.length).toBe(2);
      // Verify sections are sorted by order
      expect(res.policy_content.sections[0].order).toBe(1);
      expect(res.policy_content.sections[1].order).toBe(2);
      expect(res.configurations['TEST_CAT']).toBeDefined();
      expect(res.configurations['TEST_CAT'][0].key).toBe('TEST_KEY');
      done();
    });
  });

  it('should fall back to default policy when admin API fails', (done) => {
    adminApiMock.getPrivacyPolicy.and.returnValue(
      throwError(() => new Error('Network error'))
    );

    service.getPrivacyPolicy().subscribe((res) => {
      expect(res.success).toBeTrue();
      expect(res.policy_content.policy.title).toBe(
        DEFAULT_PRIVACY_POLICY.policy_content.policy.title
      );
      expect(res.policy_content.sections.length).toBe(
        DEFAULT_PRIVACY_POLICY.policy_content.sections.length
      );
      expect(res.configurations['HR_PORTAL']).toBeDefined();
      done();
    });
  });

  it('should return default policy if API response is invalid or null', () => {
    const normalized = service.normalizeResponse(null);
    expect(normalized.policy_content.policy.title).toBe(
      DEFAULT_PRIVACY_POLICY.policy_content.policy.title
    );
  });
});
