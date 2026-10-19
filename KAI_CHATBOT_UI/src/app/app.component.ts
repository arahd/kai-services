import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  inject,
  NgZone,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { ToastService } from '@core/services/toast.service';
import { TokenService } from '@core/services/token.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { SidenavComponent } from '@features/sidenav/sidenav.component';
import { ToastComponent } from '@shared/components/toast/toast.component';
import { filter } from 'rxjs/operators';

/** Paths that render full-page without the app chrome (sidenav). */
const PUBLIC_PATH_PREFIXES = [
  '/login',
  '/request-access',
  '/chatbot/s',
] as const;

import { MobileHeaderComponent } from '@core/layout/mobile-header/mobile-header.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ToastComponent, SidenavComponent, MobileHeaderComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent implements OnInit, OnDestroy, AfterViewInit {
  mobileSidebarOpen = false;
  title = 'kai';
  @ViewChild(ToastComponent) toastComponent!: ToastComponent;
  @ViewChild('rootSidenav') private rootSidenav?: SidenavComponent;

  protected readonly layoutBridge = inject(SidenavLayoutBridgeService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastService = inject(ToastService);
  private readonly azureAd = inject(AzureAdService);
  private readonly tokenService = inject(TokenService);

  readonly showAppChrome = signal(false);
  readonly isWelcomeRoute = signal(false);

  private inactivityTimer: any;
  private readonly INACTIVITY_TIME = 3 * 60 * 60 * 1000; // 3 hours in ms
  private boundResetTimer = this.resetTimer.bind(this);

  private ngZone = inject(NgZone);

  ngOnInit() {
    this.ngZone.runOutsideAngular(() => {
      window.addEventListener('mousemove', this.boundResetTimer);
      window.addEventListener('keydown', this.boundResetTimer);
      window.addEventListener('click', this.boundResetTimer);
      window.addEventListener('scroll', this.boundResetTimer, true);
    });
    this.resetTimer();

    this.applyChromeForUrl(this.router.url);
    this.maybeRedirectFromLogin(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.applyChromeForUrl(e.urlAfterRedirects);
        this.maybeRedirectFromLogin(e.urlAfterRedirects);
        queueMicrotask(() => this.syncSidenavBridgeRef());
      });
  }

  ngAfterViewInit() {
    this.toastService.register(this.toastComponent);
    this.syncSidenavBridgeRef();
  }

  ngOnDestroy() {
    window.removeEventListener('mousemove', this.boundResetTimer);
    window.removeEventListener('keydown', this.boundResetTimer);
    window.removeEventListener('click', this.boundResetTimer);
    window.removeEventListener('scroll', this.boundResetTimer, true);
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
  }

  private resetTimer() {
    if (this.inactivityTimer) {
      clearTimeout(this.inactivityTimer);
    }
    this.inactivityTimer = setTimeout(() => {
      this.ngZone.run(() => {
        this.logout();
      });
    }, this.INACTIVITY_TIME);
  }

  private readonly storageService = inject(SessionStorageService);

  private logout() {
    console.log('Logging out due to 3 hours of inactivity.');
    try {
      this.tokenService.clearToken();
      this.storageService.clear();
      location.reload();
    } catch {
      // no-op
    }
    this.azureAd.logout();
    this.router.navigate(['/login']);
  }

  private applyChromeForUrl(rawUrl: string) {
    const path = (rawUrl.split('?')[0] || '').split('#')[0] || '';
    this.isWelcomeRoute.set(path === '/chatbot');
    const isPublic = PUBLIC_PATH_PREFIXES.some(
      (p) => path === p || path.startsWith(`${p}/`),
    );
    this.showAppChrome.set(!isPublic);
    if (isPublic) {
      this.layoutBridge.setSidenavInstance(null);
    }
  }

  private maybeRedirectFromLogin(rawUrl: string) {
    const path = (rawUrl.split('?')[0] || '').split('#')[0] || '';
    if (path !== '/login') return;

    const token = this.tokenService.getToken();
    const roles = this.tokenService.getRoles();
    if (!token || roles.length === 0) return;

    // If we're already authenticated but still on /login (often due to AAD hash fragments),
    // move to the default authenticated landing route.
    this.router.navigate(['/chatbot'], { replaceUrl: true });
  }

  private syncSidenavBridgeRef() {
    if (!this.showAppChrome()) {
      this.layoutBridge.setSidenavInstance(null);
      return;
    }
    queueMicrotask(() => {
      const sidenav = this.rootSidenav;
      this.layoutBridge.setSidenavInstance(sidenav ?? null);
    });
  }
}
