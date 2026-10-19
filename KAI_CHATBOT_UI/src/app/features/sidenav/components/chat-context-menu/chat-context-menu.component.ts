import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  Output,
} from '@angular/core';

import { SidenavIconComponent } from '@features/sidenav/components/sidenav-icon/sidenav-icon.component';
import { TooltipDirective } from '@shared/directives/tooltip.directive';

@Component({
  selector: 'app-chat-context-menu',
  standalone: true,
  imports: [CommonModule, TooltipDirective, SidenavIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './chat-context-menu.component.html',
  styleUrls: ['./chat-context-menu.component.scss'],
})
export class ChatContextMenuComponent {
  @Input() menuPosition: any = {};
  @Input() isPinned = false;
  @Input() disabled = false;
  @Input() disabledTooltip = '';
  @Input() showShare = true;
  @Input() showPin = true;
  @Input() showRename = true;
  @Input() showMoveToProject = false;
  @Input() showDelete = true;

  @Output() pinEvt = new EventEmitter<void>();
  @Output() deleteEvt = new EventEmitter<MouseEvent>();
  @Output() shareEvt = new EventEmitter<void>();
  @Output() renameEvt = new EventEmitter<void>();
  @Output() moveToProjectEvt = new EventEmitter<void>();
}

