import {
  Component,
  ChangeDetectionStrategy,
  Input,
  Output,
  EventEmitter,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TooltipDirective } from '@shared/directives/tooltip.directive';
import { ChatIconComponent } from '@features/chatbot/components/chat-icon/chat-icon.component';
import { BaseMessageComponent } from '@features/chatbot/components/base-message.component';
import { FileTypePipe } from '@shared/pipes/file-type.pipe';

@Component({
  selector: 'app-user-message',
  standalone: true,
  imports: [CommonModule, TooltipDirective, ChatIconComponent, FileTypePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './user-message.component.html',
  styleUrls: ['./user-message.component.scss'],
})
export class UserMessageComponent extends BaseMessageComponent {
  @Input() userAvatar: string | null | undefined = null;
  @Input() userName = '';
  @Input() showEdit = true;

  get userInitial(): string {
    return this.userName ? this.userName.charAt(0).toUpperCase() : 'M';
  }

  @Output() editMessage = new EventEmitter<void>();
  @Output() toggleCollapse = new EventEmitter<void>();
  @Output() previewFile = new EventEmitter<{ file: any }>();
}
