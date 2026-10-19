import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { PrivacyPolicyComponent } from './privacy-policy.component';
import { PrivacyPolicyService } from '../../services/privacy-policy.service';
import { DEFAULT_PRIVACY_POLICY } from './privacy-policy.data';

describe('PrivacyPolicyComponent', () => {
  let component: PrivacyPolicyComponent;
  let fixture: ComponentFixture<PrivacyPolicyComponent>;
  let privacyServiceMock: jasmine.SpyObj<PrivacyPolicyService>;
  let routerMock: jasmine.SpyObj<Router>;

  beforeEach(async () => {
    privacyServiceMock = jasmine.createSpyObj<PrivacyPolicyService>(
      'PrivacyPolicyService',
      ['getPrivacyPolicy']
    );
    routerMock = jasmine.createSpyObj<Router>('Router', ['navigate']);

    privacyServiceMock.getPrivacyPolicy.and.returnValue(
      of(DEFAULT_PRIVACY_POLICY)
    );

    await TestBed.configureTestingModule({
      imports: [PrivacyPolicyComponent],
      providers: [
        { provide: PrivacyPolicyService, useValue: privacyServiceMock },
        { provide: Router, useValue: routerMock },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PrivacyPolicyComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render policy title and updated date in header', () => {
    const el: HTMLElement = fixture.nativeElement;
    const titleEl = el.querySelector('.policy-main-title');
    const dateEl = el.querySelector('.policy-updated-date');

    expect(titleEl?.textContent?.trim()).toBe('Privacy & Usage Policy');
    expect(dateEl?.textContent?.trim()).toBe('Updated: September 23, 2026');
  });

  it('should render TOC items and policy sections in order', () => {
    const el: HTMLElement = fixture.nativeElement;
    const tocItems = el.querySelectorAll('.toc-item');
    const sections = el.querySelectorAll('.policy-section');

    expect(tocItems.length).toBeGreaterThan(0);
    expect(sections.length).toBeGreaterThan(0);
  });

  it('should render configurations grouped by category', () => {
    const el: HTMLElement = fixture.nativeElement;
    const configSection = el.querySelector('.configurations-section');
    expect(configSection).toBeTruthy();

    const categoryBadges = el.querySelectorAll('.category-badge');
    const badgeTexts = Array.from(categoryBadges).map((b) =>
      b.textContent?.trim()
    );
    expect(badgeTexts).toContain('HR_PORTAL');
    expect(badgeTexts).toContain('DOCUMENT_GENERATION');

    const keyCodes = el.querySelectorAll('.config-key-code');
    const keyTexts = Array.from(keyCodes).map((k) => k.textContent?.trim());
    expect(keyTexts).toContain('JD_ANALYSIS_MAX_RESUMES_FRONTEND');
    expect(keyTexts).toContain('PPT_GENERATION_MAX_SLIDES');
  });

  it('should navigate to /chatbot when onBack is called and isModal is false', () => {
    component.isModal = false;
    component.onBack();
    expect(routerMock.navigate).toHaveBeenCalledWith(['/chatbot']);
  });

  it('should emit closeEvt when onBack is called and isModal is true', () => {
    component.isModal = true;
    spyOn(component.closeEvt, 'emit');
    component.onBack();
    expect(component.closeEvt.emit).toHaveBeenCalled();
    expect(routerMock.navigate).not.toHaveBeenCalled();
  });

  it('should format category title correctly', () => {
    expect(component.formatCategoryTitle('HR_PORTAL')).toBe('Hr Portal');
    expect(component.formatCategoryTitle('DOCUMENT_GENERATION')).toBe(
      'Document Generation'
    );
    expect(component.formatCategoryTitle('')).toBe('');
  });

  it('should update activeSectionOrder on scrollToSection', () => {
    component.scrollToSection(3);
    expect(component.activeSectionOrder()).toBe(3);
  });

  it('should update activeSectionOrder on scrollToConfigurations', () => {
    component.scrollToConfigurations();
    expect(component.activeSectionOrder()).toBe('configurations');
  });

  it('should fall back to default policy on service error', fakeAsync(() => {
    privacyServiceMock.getPrivacyPolicy.and.returnValue(
      throwError(() => new Error('Service failure'))
    );
    component.fetchPolicy();
    tick();

    expect(component.loading()).toBeFalse();
    expect(component.policyMeta().title).toBe('Privacy & Usage Policy');
  }));
});
