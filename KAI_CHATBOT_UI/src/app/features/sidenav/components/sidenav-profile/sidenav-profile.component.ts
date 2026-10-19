import { Component, ChangeDetectionStrategy, Input, Output, EventEmitter, inject, OnInit, PLATFORM_ID, HostListener, ViewChild } from '@angular/core';
import { CommonModule, isPlatformBrowser } from '@angular/common';
import { TooltipDirective } from '@shared/directives/tooltip.directive';
import { HelpMenuComponent } from '@features/chatbot/components/help-menu/help-menu.component';
import { ThemeService, ThemeMode, ColorTheme, THEME_PALETTES } from '@core/services/theme.service';
import { Router } from '@angular/router';
import { SidenavIconComponent } from '@features/sidenav/components/sidenav-icon/sidenav-icon.component';

@Component({
  selector: 'app-sidenav-profile',
  standalone: true,
  imports: [CommonModule, TooltipDirective, HelpMenuComponent, SidenavIconComponent],
  templateUrl: './sidenav-profile.component.html',
  styleUrls: ['./sidenav-profile.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SidenavProfileComponent implements OnInit {
  @Input() userInitial = '';
  @Input() userInfo: any = null;
  @Input() collapsed = false;
  private _popoverOpen = false;
  @Input()
  set popoverOpen(val: boolean) {
    this._popoverOpen = val;
    if (!val) {
      this.showHelpSubmenu = false;
    }
  }
  get popoverOpen(): boolean {
    return this._popoverOpen;
  }

  @Input() popoverPosition: any = {};
  @Input() streaming = true;
  @Input() models: any[] = [];

  @Output() togglePopoverEvt = new EventEmitter<MouseEvent>();
  @Output() logoutEvt = new EventEmitter<void>();
  @Output() streamingToggleEvt = new EventEmitter<boolean>();
  @Output() openSettingsEvt = new EventEmitter<void>();

  showHelpSubmenu = false;

  @ViewChild('helpMenu') helpMenu!: HelpMenuComponent;

  private readonly themeService = inject(ThemeService);
  private readonly router = inject(Router);
  isMobile = false;
  private readonly MOBILE_BREAKPOINT = 767;
  private platformId = inject(PLATFORM_ID);

  get isSettingsSupportedPage(): boolean {
    return this.themeService.isThemeSupportedUrl(this.router.url);
  }

  /** Available color themes for the picker */
  readonly colorThemes: { key: ColorTheme; label: string; accent: string }[] = (
    Object.keys(THEME_PALETTES) as ColorTheme[]
  ).map((key) => ({
    key,
    label: THEME_PALETTES[key].label,
    accent: THEME_PALETTES[key].accent,
  }));

  ngOnInit() {
    this.checkMobile();
  }

  @HostListener('window:resize')
  checkMobile() {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobile = window.innerWidth <= this.MOBILE_BREAKPOINT;
    }
  }

  onToggleStreaming(event: any) {
    this.streamingToggleEvt.emit(event.target.checked);
  }

  get theme(): ThemeMode {
    return this.themeService.themeSignal();
  }

  setTheme(next: ThemeMode) {
    this.themeService.setTheme(next);
  }

  get colorTheme(): ColorTheme {
    return this.themeService.colorThemeSignal();
  }

  setColorTheme(next: ColorTheme) {
    this.themeService.setColorTheme(next);
  }

  openSettings() {
    this.openSettingsEvt.emit();
    this.togglePopoverEvt.emit(undefined);
  }

  openHelp() {
    this.showHelpSubmenu = !this.showHelpSubmenu;
  }

  triggerWalkthrough() {
    if (this.helpMenu) {
      this.helpMenu.startWalkthrough();
    }
    this.togglePopoverEvt.emit(undefined);
  }

  triggerUserManual() {
    if (this.helpMenu) {
      this.helpMenu.openUserManual();
    }
    this.togglePopoverEvt.emit(undefined);
  }

  triggerHelpCenter() {
    if (this.helpMenu) {
      this.helpMenu.openHelpCenter();
    }
    this.togglePopoverEvt.emit(undefined);
  }

  triggerPrivacyPolicy() {
    if (this.helpMenu) {
      this.helpMenu.openPrivacyPolicy();
    }
    this.togglePopoverEvt.emit(undefined);
  }

  triggerRaiseBug() {
    if (this.helpMenu) {
      this.helpMenu.raiseBug();
    }
    this.togglePopoverEvt.emit(undefined);
  }

  triggerFeatureRequest() {
    if (this.helpMenu) {
      this.helpMenu.raiseFeatureRequest();
    }
    this.togglePopoverEvt.emit(undefined);
  }
}
