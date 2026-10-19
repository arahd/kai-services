import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  inject,
  OnInit,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs/operators';
import { CommonModule } from '@angular/common';
import { SidenavLayoutBridgeService } from '@core/layout/sidenav-layout-bridge.service';
import { TokenService } from '@core/services/token.service';
import { ChatModelService, ModelOption } from '@features/chatbot/services/chat-model.service';
import { ChatStateService } from '@features/chatbot/services/chat-state.service';

@Component({
  selector: 'app-mobile-header',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './mobile-header.component.html',
  styleUrls: ['./mobile-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileHeaderComponent implements OnInit {
  public readonly layoutBridge = inject(SidenavLayoutBridgeService);
  public readonly chatModelService = inject(ChatModelService);
  private readonly tokenService = inject(TokenService);
  private readonly chatState = inject(ChatStateService, { optional: true });
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly showModelSelector = signal<boolean>(false);
  mobileModelDropdownOpen = false;

  get selectedModel(): string {
    return this.chatModelService.selectedModel();
  }

  get selectedModelLabel(): string {
    return this.chatModelService.getSelectedModelLabel() || 'GPT-5.1';
  }

  get availableModels(): ModelOption[] {
    return this.chatModelService.models();
  }

  get isModelLocked(): boolean {
    return this.chatModelService.modelLocked();
  }

  ngOnInit(): void {
    this.checkRoute(this.router.url);
    this.router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((e) => {
        this.checkRoute(e.urlAfterRedirects);
      });

    if (this.chatModelService.models().length === 0) {
      const email = this.tokenService.getUserInfo()?.email || this.chatState?.userInfo?.email || null;
      this.chatModelService.loadModels(email);
    }
  }

  private checkRoute(rawUrl: string): void {
    const path = (rawUrl.split('?')[0] || '').split('#')[0] || '';
    const isWelcome = path === '/chatbot';
    const isProjectDetail = /^\/projects\/[^/]+$/.test(path);
    this.showModelSelector.set(isWelcome || isProjectDetail);
  }

  openSidebar(): void {
    this.layoutBridge.openMobileSidebar();
  }

  toggleModelDropdown(event: Event): void {
    event.stopPropagation();
    if (this.isModelLocked) return;
    this.mobileModelDropdownOpen = !this.mobileModelDropdownOpen;
  }

  selectModel(model: ModelOption, event: Event): void {
    event.stopPropagation();
    const email = this.tokenService.getUserInfo()?.email || this.chatState?.userInfo?.email || null;
    this.chatModelService.selectModel(model.value, email);
    this.mobileModelDropdownOpen = false;
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.mobileModelDropdownOpen = false;
  }
}
