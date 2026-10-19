import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  OnInit,
  Output,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProjectItem } from '../../models/project.model';
import { ProjectStateService } from '../../services/project-state.service';
import { SidenavIconComponent } from '@features/sidenav/components/sidenav-icon/sidenav-icon.component';

@Component({
  selector: 'app-move-to-project-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, SidenavIconComponent],
  templateUrl: './move-to-project-modal.component.html',
  styleUrls: ['./move-to-project-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MoveToProjectModalComponent implements OnInit {
  protected readonly projectState = inject(ProjectStateService);

  @Input({ required: true }) conversationId!: string;
  @Input() conversationTitle: string = '';

  @Output() close = new EventEmitter<void>();
  @Output() moved = new EventEmitter<number>();
  @Output() createProjectRequested = new EventEmitter<void>();

  @ViewChild('searchInput') searchInput?: ElementRef<HTMLInputElement>;

  readonly searchQuery = signal<string>('');
  readonly selectedProjectId = signal<number | null>(null);
  readonly isSubmitting = signal<boolean>(false);
  readonly errorMessage = signal<string>('');

  /**
   * Filtered list of projects by user's search query.
   */
  readonly availableProjects = computed<ProjectItem[]>(() => {
    const list = this.projectState.projects();
    const query = this.searchQuery().trim().toLowerCase();
    if (!query) {
      return list;
    }
    return list.filter((p) => p.project_name?.toLowerCase().includes(query));
  });

  ngOnInit(): void {
    if (this.projectState.projects().length === 0) {
      this.projectState.loadProjects(1, true);
    }
    setTimeout(() => {
      this.searchInput?.nativeElement.focus();
    }, 100);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (!this.isSubmitting()) {
      this.onClose();
    }
  }

  selectProject(projectId: number): void {
    this.selectedProjectId.set(projectId);
    this.errorMessage.set('');
  }

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (!el) return;

    const threshold = 60;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight <= threshold;

    if (
      isNearBottom &&
      this.projectState.hasMoreProjects &&
      !this.projectState.isLoadingMore() &&
      !this.projectState.isLoading()
    ) {
      this.projectState.loadMoreProjects();
    }
  }

  onClose(): void {
    this.close.emit();
  }


  onCreateNewProject(): void {
    this.close.emit();
    this.createProjectRequested.emit();
  }

  async onConfirmMove(): Promise<void> {
    const projId = this.selectedProjectId();
    if (!projId || !this.conversationId || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.errorMessage.set('');

    const success = await this.projectState.moveConversationToProject(
      this.conversationId,
      projId
    );

    this.isSubmitting.set(false);

    if (success) {
      this.moved.emit(projId);
    } else {
      this.errorMessage.set('Failed to move conversation. Please try again.');
    }
  }
}
