import {
  Component,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';

@Component({
  selector: 'app-session-expired-popup',
  standalone: true,
  imports: [CommonModule, ChatIconComponent],
  templateUrl: './session-expired-popup.component.html',
  styleUrls: ['./session-expired-popup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SessionExpiredPopupComponent {
  @Output() confirm = new EventEmitter<void>();
}
