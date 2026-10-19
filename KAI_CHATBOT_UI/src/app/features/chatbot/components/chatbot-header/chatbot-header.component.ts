import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
  inject,
  OnInit,
  PLATFORM_ID,
  HostListener,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { ThemeService, ThemeMode } from '@core/services/theme.service';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';

@Component({
  selector: 'app-chatbot-header',
  standalone: true,
  imports: [ChatIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chatbot-header.component.html',
  styleUrls: ['./chatbot-header.component.scss'],
})
export class ChatbotHeaderComponent implements OnInit {
  @Input() collapsed = false;
  @Input() userInfo: any = null;
  @Input() models: Array<{ value: string; label: string; description?: string }> = [];

  @Output() toggleSettings = new EventEmitter<void>();
  @Output() toggleMobileSidebar = new EventEmitter<void>();

  isMobile = false;
  private readonly MOBILE_BREAKPOINT = 767;

  private readonly themeService = inject(ThemeService);
  private platformId = inject(PLATFORM_ID);

  get theme(): ThemeMode {
    return this.themeService.themeSignal();
  }

  ngOnInit(): void {
    this.checkMobile();
  }

  @HostListener('window:resize')
  checkMobile() {
    if (isPlatformBrowser(this.platformId)) {
      this.isMobile = window.innerWidth <= this.MOBILE_BREAKPOINT;
    }
  }

  onMenuClick() {
    this.toggleMobileSidebar.emit();
  }

  get greeting(): string {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Good Morning';
    if (hour >= 12 && hour < 17) return 'Good Afternoon';
    return 'Good Evening'; // 5pm onwards (no "Good Night")
  }

  setTheme(next: ThemeMode) {
    this.themeService.setTheme(next);
  }

  capitalizeFirstLetter(value?: string | null): string {
    const v = (value ?? '').trim();
    if (!v) return '';
    return v.charAt(0).toUpperCase() + v.slice(1);
  }

}
