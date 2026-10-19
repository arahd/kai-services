import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output } from '@angular/core';
import { HrUserAccess } from '../../../../models/hr-access.model';

@Component({
  selector: 'app-delete-confirm-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './delete-confirm-modal.component.html',
  styleUrls: ['./delete-confirm-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class DeleteConfirmModalComponent {
  @Input() isOpen = false;
  @Input() user: HrUserAccess | null = null;
  @Input() isDeleting = false;
  @Input() errorMessage = '';

  @Output() close = new EventEmitter<void>();
  @Output() confirm = new EventEmitter<number>();

  onConfirm() {
    if (this.user?.id !== undefined) {
      this.confirm.emit(this.user.id);
    }
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }
}
