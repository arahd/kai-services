import { CommonModule, isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  DestroyRef,
  ElementRef,
  EventEmitter,
  Input,
  OnInit,
  Output,
  PLATFORM_ID,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';
import { PrivacyPolicyService } from '../../services/privacy-policy.service';
import {
  PolicyConfigurations,
  PolicyMeta,
  PolicySection,
} from './privacy-policy.model';
import { DEFAULT_PRIVACY_POLICY } from './privacy-policy.data';

@Component({
  selector: 'app-privacy-policy',
  standalone: true,
  imports: [CommonModule, ChatIconComponent],
  templateUrl: './privacy-policy.component.html',
  styleUrls: ['./privacy-policy.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PrivacyPolicyComponent implements OnInit {
  @Input() isModal = false;
  @Output() closeEvt = new EventEmitter<void>();

  @ViewChild('contentContainer') contentContainer?: ElementRef<HTMLElement>;

  private readonly privacyService = inject(PrivacyPolicyService);
  private readonly router = inject(Router);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly hostEl = inject(ElementRef);

  // ── Reactive Signals ────────────────────────────────────────────────────────
  loading = signal<boolean>(true);
  policyMeta = signal<PolicyMeta>(
    DEFAULT_PRIVACY_POLICY.policy_content.policy
  );
  sections = signal<PolicySection[]>(
    DEFAULT_PRIVACY_POLICY.policy_content.sections
  );
  configurations = signal<PolicyConfigurations>(
    DEFAULT_PRIVACY_POLICY.configurations
  );
  activeSectionOrder = signal<number | string>(1);

  readonly configCategories = computed(() =>
    Object.keys(this.configurations() || {})
  );

  readonly hasConfigurations = computed(() => {
    const cats = this.configCategories();
    return (
      cats.length > 0 &&
      cats.some(
        (cat) =>
          Array.isArray(this.configurations()[cat]) &&
          this.configurations()[cat].length > 0
      )
    );
  });

  private observer?: IntersectionObserver;

  ngOnInit(): void {
    this.fetchPolicy();
  }

  fetchPolicy(): void {
    this.loading.set(true);
    this.privacyService
      .getPrivacyPolicy()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          if (response?.policy_content) {
            this.policyMeta.set(
              response.policy_content.policy ||
                DEFAULT_PRIVACY_POLICY.policy_content.policy
            );
            this.sections.set(
              response.policy_content.sections?.length
                ? response.policy_content.sections
                : DEFAULT_PRIVACY_POLICY.policy_content.sections
            );
          }
          if (response?.configurations) {
            this.configurations.set(response.configurations);
          }
          this.loading.set(false);
          this.cdr.markForCheck();

          // Set up observer after view renders
          setTimeout(() => this.setupIntersectionObserver(), 100);
        },
        error: (err) => {
          console.error('[PrivacyPolicyComponent] Failed to load policy:', err);
          // Fall back gracefully to default policy
          this.policyMeta.set(DEFAULT_PRIVACY_POLICY.policy_content.policy);
          this.sections.set(DEFAULT_PRIVACY_POLICY.policy_content.sections);
          this.configurations.set(DEFAULT_PRIVACY_POLICY.configurations);
          this.loading.set(false);
          this.cdr.markForCheck();

          setTimeout(() => this.setupIntersectionObserver(), 100);
        },
      });
  }

  private setupIntersectionObserver(): void {
    if (!isPlatformBrowser(this.platformId)) return;

    if (this.observer) {
      this.observer.disconnect();
    }

    const host = this.hostEl.nativeElement as HTMLElement;
    const scrollRoot = host.querySelector(
      '.privacy-content-main-scroll'
    ) as HTMLElement | null;

    const options: IntersectionObserverInit = {
      root: scrollRoot,
      rootMargin: '-10% 0px -70% 0px',
      threshold: 0,
    };

    this.observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const orderAttr = entry.target.getAttribute('data-section-order');
          if (orderAttr) {
            const orderNum = Number(orderAttr);
            this.activeSectionOrder.set(isNaN(orderNum) ? orderAttr : orderNum);
            this.cdr.markForCheck();
          }
        }
      });
    }, options);

    const sectionElements = host.querySelectorAll('.policy-section');
    sectionElements.forEach((el) => this.observer?.observe(el));
  }

  scrollToSection(order: number): void {
    this.activeSectionOrder.set(order);
    const host = this.hostEl.nativeElement as HTMLElement;
    const target = host.querySelector(`#section-${order}`) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  scrollToConfigurations(): void {
    this.activeSectionOrder.set('configurations');
    const host = this.hostEl.nativeElement as HTMLElement;
    const target = host.querySelector(
      '#section-configurations'
    ) as HTMLElement | null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  formatCategoryTitle(categoryKey: string): string {
    if (!categoryKey) return '';
    return categoryKey
      .split('_')
      .map(
        (word) =>
          word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
      )
      .join(' ');
  }

  onBack(): void {
    if (this.isModal) {
      this.closeEvt.emit();
    } else {
      this.router.navigate(['/chatbot']);
    }
  }
}
