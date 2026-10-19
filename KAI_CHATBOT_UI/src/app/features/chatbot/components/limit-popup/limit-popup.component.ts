import { Component, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';

@Component({
  selector: 'app-limit-popup',
  standalone: true,
  imports: [CommonModule, ChatIconComponent],
  templateUrl: './limit-popup.component.html',
  styleUrls: ['./limit-popup.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LimitPopupComponent {
  @Output() close = new EventEmitter<void>();
}
