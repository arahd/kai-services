import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  inject,
  OnInit,
  Output,
  ViewChild,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectStateService } from '../../services/project-state.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-create-project-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-project-modal.component.html',
  styleUrls: ['./create-project-modal.component.scss'],
})
export class CreateProjectModalComponent implements OnInit {
  private readonly projectState = inject(ProjectStateService);

  @Output() closed = new EventEmitter<void>();
  @Output() projectCreated = new EventEmitter<any>();

  @ViewChild('nameInput') nameInput?: ElementRef<HTMLInputElement>;

  projectName = '';
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  ngOnInit(): void {
    setTimeout(() => {
      this.nameInput?.nativeElement.focus();
    }, 100);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.isSubmitting()) {
      this.close();
    }
  }

  close(): void {
    this.closed.emit();
  }

  async onSubmit(): Promise<void> {
    const trimmed = this.projectName.trim();
    if (!trimmed || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.errorMessage.set(null);

    try {
      const created = await this.projectState.createProject(trimmed);
      if (created) {
        this.projectCreated.emit(created);
        this.close();
      }
    } catch (err: any) {
      const msg =
        err?.error?.error ||
        err?.message ||
        'Project name already exists for this user';
      this.errorMessage.set(msg);
    } finally {
      this.isSubmitting.set(false);
    }
  }
}

