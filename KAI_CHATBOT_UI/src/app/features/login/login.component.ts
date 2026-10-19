import { Component, inject, OnInit, OnDestroy, ChangeDetectionStrategy, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AzureAdService, UserInfo } from '@core/auth/azure-ad.service';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { TokenService } from '@core/services/token.service';
import { ToastService } from '@core/services/toast.service';
import { ChatService } from '@features/chatbot/services/chat.service';
import { Subscription } from 'rxjs';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-login',
  imports: [CommonModule],
  standalone: true,
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.scss']
})
export class LoginComponent implements OnInit, OnDestroy {
  readonly loading = signal(false);
  readonly loadingMessage = signal('Signing in...');
  errorMessage: string | null = null;
  // ✅ Modern DI syntax
  private azureAd = inject(AzureAdService);
  private router = inject(Router);
  // private http = inject(HttpClient);
  private tokenService = inject(TokenService);
  private toastService = inject(ToastService);
  private chatservice = inject(ChatService);

  private authSubscription?: Subscription;
  private hasLoggedIn = false;

  private readonly onPageShow = (event: PageTransitionEvent): void => {
    // If restored from BFCache or user clicked browser back without auth callback parameters
    if (event.persisted || !this.azureAd.isRedirectCallback()) {
      this.loading.set(false);
    }
  };

  ngOnInit(): void {
    // 1. Listen for browser Back / BFCache restore
    if (typeof window !== 'undefined') {
      window.addEventListener('pageshow', this.onPageShow);
    }

    // 2. If returning from Microsoft verification with OAuth code/hash, maintain loader
    if (this.azureAd.isRedirectCallback()) {
      this.loading.set(true);
      this.loadingMessage.set('Verifying account...');
    } else {
      this.loading.set(false);
    }

    // 3. Subscribe to user info from AzureAdService
    this.authSubscription = this.azureAd.getUserInfoObservable().subscribe(async (userInfo: UserInfo | null) => {
      if (userInfo && !this.hasLoggedIn) {
        this.hasLoggedIn = true;
        this.loading.set(true);
        this.loadingMessage.set('Verifying account...');
        console.log('User info received:', userInfo);
        try {
          // Get a valid token
          const accessToken = await this.azureAd.getValidToken();
          this.tokenService.setToken(accessToken);

          // Optionally schedule automatic refresh
          this.azureAd.scheduleTokenRefresh((newToken: string) => {
            this.tokenService.setToken(newToken);
          });
          this.chatservice.sendTokenToBackend({ token: accessToken }).subscribe({
            next: (response) => {
              const roles: string[] = response?.roles ?? [];
              const rawProductRoles = response?.product_roles ?? response?.productRoles ?? [];
              const productRoles: string[] = Array.isArray(rawProductRoles)
                ? rawProductRoles
                : [];

              // Store roles and product roles globally for sidenav, products and guards securely
              this.tokenService.setRoles(roles);
              this.tokenService.setProductRoles(productRoles);

              const isAdmin = this.tokenService.isAdmin();
              const isUser = this.tokenService.isUser();

              if (isAdmin || isUser) {
                const msg = isAdmin ? 'Logged in as Admin' : 'Logged in successfully';
                this.toastService.show(msg, 'success');
                this.router.navigate(['/chatbot']);
                return;
              }

              // No access
              this.loading.set(false);
              this.toastService.show('No Access - Request Required', 'error');
              this.router.navigate(['/request-access']);
            },
            error: (err) => {
              console.error('Failed to send token to backend:', err);
              this.loading.set(false);
              this.errorMessage = 'We encountered an issue while signing you in. Please check your network or SSO access.';
              this.toastService.show('Failed to log in', 'error');
              this.hasLoggedIn = false;
            }
          });
        } catch (err) {
          console.error('Failed to get token:', err);
          this.loading.set(false);
          this.hasLoggedIn = false;
        }
      }
    });
  }

  ngOnDestroy(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pageshow', this.onPageShow);
    }
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  /** Trigger Azure AD login redirect */
  login(): void {
    this.errorMessage = null;
    this.loading.set(true);
    this.loadingMessage.set('Redirecting to Microsoft...');
    this.azureAd.login().catch((err) => {
      console.error('Failed to initiate login redirect:', err);
      this.loading.set(false);
      this.errorMessage = 'Failed to redirect to Microsoft. Please try again.';
    });
  }

  contactTeams() {
    const adminEmail = 'karthikeyan.subbaroyan@kumaran.com';
    const message = 'Hi Admin Team, I am unable to log in to KAI Chatbot.';
    const webUrl = `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(adminEmail)}&message=${encodeURIComponent(message)}`;
    window.open(webUrl, '_blank');
  }

  contactOutlook() {
    const adminEmail = 'karthikeyan.subbaroyan@kumaran.com';
    const subject = 'KAI Chatbot Login Issue';
    const message = 'Hi Admin Team, I encountered an issue while logging in to KAI Chatbot.';
    const mailtoUrl = `mailto:${encodeURIComponent(adminEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`;
    window.location.href = mailtoUrl;
  }
}
