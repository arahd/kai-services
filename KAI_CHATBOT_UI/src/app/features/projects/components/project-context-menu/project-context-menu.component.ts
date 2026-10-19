import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  Output,
  inject,
} from '@angular/core';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-context-menu',
  standalone: true,
  imports: [],
  templateUrl: './project-context-menu.component.html',
  styleUrls: ['./project-context-menu.component.scss'],
})
export class ProjectContextMenuComponent {
  private readonly elementRef = inject(ElementRef);

  @Input() isPinned: boolean = false;
  @Input() position: { x: number; y: number } = { x: 0, y: 0 };
  @Input() showPinOption: boolean = true;

  @Output() pinEvt = new EventEmitter<void>();
  @Output() renameEvt = new EventEmitter<void>();
  @Output() deleteEvt = new EventEmitter<void>();
  @Output() closeEvt = new EventEmitter<void>();

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.elementRef.nativeElement.contains(event.target)) {
      this.closeEvt.emit();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeEvt.emit();
  }

  onPin(event: MouseEvent): void {
    event.stopPropagation();
    this.pinEvt.emit();
    this.closeEvt.emit();
  }

  onRename(event: MouseEvent): void {
    event.stopPropagation();
    this.renameEvt.emit();
    this.closeEvt.emit();
  }

  onDelete(event: MouseEvent): void {
    event.stopPropagation();
    this.deleteEvt.emit();
    this.closeEvt.emit();
  }
}

