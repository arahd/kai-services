import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
  inject,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import type { SidenavLayoutHost } from '@core/layout/sidenav-layout-host';
import { ConfigService } from '@core/services/config.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { TokenService } from '@core/services/token.service';
import { ProductCardComponent } from './components/product-card/product-card.component';
import { ProductAdminApiService } from './services/product-admin-api.service';

interface CapabilityProduct {
  title: string;
  description: string;
  badgeText: string;
  status: 'ACTIVE' | 'BETA';
  iconType: string;
  actionType: 'launch' | 'request';
  redirectUrl?: string;
  disabled?: boolean;
}

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-product',
  standalone: true,
  imports: [ProductCardComponent],
  templateUrl: './product.component.html',
  styleUrl: './product.component.scss',
})
export class ProductComponent implements OnInit, OnDestroy {
  private readonly router = inject(Router);
  private readonly sidenavLayout = inject(SidenavLayoutBridgeService);
  private readonly tokenService = inject(TokenService);
  private readonly configService = inject(ConfigService);
  private readonly storageService = inject(SessionStorageService);
  private readonly productAdminApi = inject(ProductAdminApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  private productSidenavStreaming = false;
  private authSub?: Subscription;

  readonly isLoadingRoles = signal<boolean>(false);
  readonly currentProductRoles = signal<string[]>([]);

  readonly capabilities: CapabilityProduct[] = [
    {
      title: 'Kumaran Agent Flow',
      description:
        'Orchestrate intelligent multi-agent AI workflows to automate complex business processes.',
      badgeText: 'ACTIVE',
      status: 'ACTIVE',
      iconType: 'agent-flow',
      actionType: 'launch',
    },
    {
      title: 'K-Agent',
      description:
        'Unified developer portal, application administration, and central identity synchronization.',
      badgeText: 'ACTIVE',
      status: 'ACTIVE',
      iconType: 'platform',
      actionType: 'launch',
    },
    {
      title: 'DocSpec',
      description:
        'Interactive document parsing, visual field annotation, and validation specification generation.',
      badgeText: 'ACTIVE',
      status: 'ACTIVE',
      iconType: 'doc-processing',
      actionType: 'launch',
    },
    {
      title: 'K-Spec',
      description: 'Spec Driven Development.',
      badgeText: 'ACTIVE',
      status: 'ACTIVE',
      iconType: 'platform',
      actionType: 'launch',
    },
    {
      title: 'Mainframe - Spring Batch App',
      description:
        'Modernize legacy Mainframe batch workloads to cloud-native Spring Batch applications.',
      badgeText: 'ACTIVE',
      status: 'ACTIVE',
      iconType: 'mainframe',
      actionType: 'launch',
    },
    /* {
       title: 'SprintSpec',
       description: 'AI-assisted sprint planning, user story generation, and technical specification writing.',
       badgeText: 'ACTIVE',
       status: 'ACTIVE',
       iconType: 'sprintspec',
       actionType: 'launch',
     },
     {
       title: 'Intelligent Document Processing (Financial Spreader)',
       description: 'AI-driven parsing and automated spreading of financial statements, balance sheets, and tax documents.',
       badgeText: 'ACTIVE',
       status: 'ACTIVE',
       iconType: 'doc-processing',
       actionType: 'request',
     },
     {
       title: 'GenAI PMO(Path Finder)',
       description: 'Project management office copilot for tracking milestones, analyzing risks, and charting critical paths.',
       badgeText: 'ACTIVE',
       status: 'ACTIVE',
       iconType: 'pmo',
       actionType: 'request',
     },
     {
       title: 'Oracle forms migration',
       description: 'Automated migration of legacy Oracle Forms applications to modern web-based frameworks.',
       badgeText: 'BETA',
       status: 'BETA',
       iconType: 'migration',
       actionType: 'request',
     },
     */
  ];

  get filteredCapabilities(): CapabilityProduct[] {
    // Strictly check ONLY product_roles (e.g. is_product_admin, is_k_agent_admin, is_kaf_user, is_k_spec_admin).
    // Do NOT check in roles (e.g. kai_kplatform_dev_admin, kai_kaf_dev_admin).
    const rawProductRoles =
      typeof this.tokenService?.getProductRoles === 'function'
        ? this.tokenService.getProductRoles()
        : this.currentProductRoles();
    const productRoles = (rawProductRoles || []).map((r) =>
      String(r).toLowerCase().trim(),
    );

    const isProductAdmin =
      productRoles.includes('is_product_admin') ||
      productRoles.some((r) => r.includes('product_admin'));

    const hasKaf = productRoles.some((role) => role.includes('kaf'));
    const hasKPlatform = productRoles.some((role) => {
      return (
        role.includes('k_agent') ||
        role.includes('kagent') ||
        role.includes('kplatform') ||
        role.includes('k-platform')
      );
    });
    const hasDocspec = productRoles.some(
      (role) => role.includes('docspec') || role.includes('doc_spec'),
    );
    const hasSdd = productRoles.some(
      (role) =>
        role.includes('kspec') ||
        role.includes('k_spec') ||
        role.includes('sdd'),
    );

    const mapped = this.capabilities.map((cap) => {
      if (cap.title === 'Kumaran Agent Flow') {
        return {
          ...cap,
          redirectUrl: this.configService.getKafUrl(),
          disabled: !hasKaf
        };
      }
      if (
        cap.title === 'K-Agent' ||
        cap.title === 'K-Platform' ||
        cap.title.toLowerCase().includes('k-agent') ||
        cap.title.toLowerCase().includes('k-platform')
      ) {
        return {
          ...cap,
          redirectUrl: this.configService.getKPlatformUrl(),
          disabled: !hasKPlatform,
        };
      }
      if (cap.title === 'DocSpec') {
        return {
          ...cap,
          redirectUrl: this.configService.getDocSpecUrl(),
          disabled: !hasDocspec,
        };
      }
      if (cap.title === 'K-Spec' || cap.title === 'SDD') {
        return {
          ...cap,
          redirectUrl: this.configService.getSdduiUrl(),
          disabled: !hasSdd,
        };
      }
      if (
        cap.title === 'Mainframe - Spring Batch App' ||
        cap.title.toLowerCase().includes('mainframe')
      ) {
        return {
          ...cap,
          redirectUrl: this.configService.getMainframeUrl(),
          disabled: false,
        };
      }
      return {
        ...cap,
        disabled: false,
      };
    });

    // Dynamically show only capabilities that have a valid URL configured in config.json
    return mapped.filter(
      (cap) => !!cap.redirectUrl && cap.redirectUrl.trim() !== '',
    );
  }

  get isProductAdmin(): boolean {
    const rawProductRoles =
      typeof this.tokenService?.getProductRoles === 'function'
        ? this.tokenService.getProductRoles()
        : this.currentProductRoles();
    const productRoles = (rawProductRoles || []).map((r) =>
      String(r).toLowerCase().trim(),
    );
    if (
      productRoles.includes('is_product_admin') ||
      productRoles.some((r) => r.includes('product_admin'))
    ) {
      return true;
    }
    if (typeof this.tokenService?.isProductAdmin === 'function') {
      return this.tokenService.isProductAdmin();
    }
    return false;
  }

  navigateToAdmin(): void {
    this.router.navigate(['/product/admin']);
  }

  private loadAuthRoles(): void {
    const fetchAuth = () => {
      this.isLoadingRoles.set(true);
      this.authSub = this.productAdminApi.getAuth().subscribe({
        next: (res) => {
          this.isLoadingRoles.set(false);
          if (res) {
            if (Array.isArray(res.product_roles)) {
              if (typeof this.tokenService?.setProductRoles === 'function') {
                this.tokenService.setProductRoles(res.product_roles);
              }
              this.currentProductRoles.set(res.product_roles);
            }
            if (Array.isArray(res.roles)) {
              if (typeof this.tokenService?.setRoles === 'function') {
                this.tokenService.setRoles(res.roles);
              }
            }
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isLoadingRoles.set(false);
          console.error('Failed to load auth roles:', err);
          this.cdr.markForCheck();
        },
      });
    };

    if (
      typeof this.configService?.isConfigLoaded === 'function' &&
      !this.configService.isConfigLoaded() &&
      typeof this.configService?.loadConfig === 'function'
    ) {
      this.configService
        .loadConfig()
        .catch(() => {})
        .finally(() => fetchAuth());
    } else {
      fetchAuth();
    }
  }

  ngOnInit() {
    const host: SidenavLayoutHost = {
      generatingStates: {},
      getStreaming: () => this.productSidenavStreaming,
      handleStreamingToggle: (next) => {
        this.productSidenavStreaming = next;
      },
      emitActiveChatOnInit: false,
      staticMode: false,
      onNewChat: () => {
        this.storageService.removeConversationId();
        this.storageService.removeLastActiveConversationId();
        this.router.navigate(['/chatbot']);
      },
      onChatSelected: (chat: any) => {
        const cid = chat?.conversationID;
        if (cid) {
          this.storageService.setConversationId(cid);
          this.storageService.setLastActiveConversationId(cid);
        }
        this.router.navigate(['/chatbot']);
      },
      onSearchModalToggle: (_open) => {},
      onContextMenuToggled: () => {},
      onInvalidConversation: () => {},
    };
    this.sidenavLayout.registerHost(host);

    this.loadAuthRoles();
  }

  ngOnDestroy() {
    this.authSub?.unsubscribe();
    this.sidenavLayout.unregisterHost();
  }
}
