import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
  OnDestroy,
  signal,
  HostListener,
  ElementRef,
  viewChild,
  effect,
} from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProjectStateService } from '../../services/project-state.service';
import { ProjectItem } from '../../models/project.model';
import { CreateProjectModalComponent } from '../../components/create-project-modal/create-project-modal.component';
import { ChatContextMenuComponent } from '@features/sidenav/components/chat-context-menu/chat-context-menu.component';
import { SidenavIconComponent } from '@features/sidenav/components/sidenav-icon/sidenav-icon.component';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-project-list',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DatePipe,
    CreateProjectModalComponent,
    ChatContextMenuComponent,
    SidenavIconComponent,
  ],
  templateUrl: './project-list.component.html',
  styleUrls: ['./project-list.component.scss'],
})
export class ProjectListComponent implements OnInit, OnDestroy {
  readonly state = inject(ProjectStateService);
  private readonly router = inject(Router);

  // Sentinel element for IntersectionObserver-based infinite scroll
  readonly scrollSentinel = viewChild<ElementRef<HTMLDivElement>>('scrollSentinel');
  private observer: IntersectionObserver | null = null;

  // Search input binding
  searchQuery = '';

  readonly hasProjects = computed(
    () => (this.state.projects?.() ?? []).length > 0
  );

  // Modal dialog state
  readonly showCreateModal = signal<boolean>(false);

  // Context menu state
  readonly contextMenuOpen = signal<boolean>(false);
  readonly selectedProject = signal<ProjectItem | null>(null);
  readonly menuPosition = signal<any>({});

  // Rename modal state (using conversation rename popup design)
  readonly showRenameModal = signal<boolean>(false);
  readonly projectToRename = signal<ProjectItem | null>(null);
  renameValue = '';

  // Delete modal state
  readonly showConfirmModal = signal<boolean>(false);
  readonly projectToDelete = signal<ProjectItem | null>(null);

  constructor() {
    // Re-attach the observer whenever the sentinel element appears/disappears
    // (e.g. when hasMoreProjects changes and the sentinel enters/leaves the DOM)
    effect(() => {
      const sentinel = this.scrollSentinel();
      this.disconnectObserver();
      if (sentinel) {
        this.connectObserver(sentinel.nativeElement);
      }
    });
  }

  ngOnInit(): void {
    this.state.loadProjects();
  }

  ngOnDestroy(): void {
    this.disconnectObserver();
  }

  private connectObserver(el: HTMLElement): void {
    this.observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry.isIntersecting && this.state.hasMoreProjects) {
          this.state.loadMoreProjects();
        }
      },
      {
        // Trigger 120px before the sentinel fully enters the viewport
        // so the next page starts loading before the user hits the very bottom.
        rootMargin: '0px 0px 120px 0px',
        threshold: 0,
      },
    );
    this.observer.observe(el);
  }

  private disconnectObserver(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  onSearchChange(val: string): void {
    this.searchQuery = val;
    this.state.searchQuery.set(val);
  }

  openCreateModal(): void {
    this.showCreateModal.set(true);
  }

  closeCreateModal(): void {
    this.showCreateModal.set(false);
  }

  onProjectCreated(newProject: ProjectItem): void {
    this.closeCreateModal();
    if (newProject?.project_id) {
      this.openProject(newProject);
    }
  }

  openProject(project: ProjectItem): void {
    this.state.activeProject.set(project);
    sessionStorage.setItem('kai_active_project_id', String(project.project_id));
    sessionStorage.setItem('kai_active_project_name', project.project_name);
    sessionStorage.removeItem('kai_active_project_conversation_id');
    this.router.navigate(['/projects', project.project_id]);
  }

  togglePin(project: ProjectItem, event: MouseEvent): void {
    event.stopPropagation();
    this.state.togglePin(project);
  }

  openContextMenu(project: ProjectItem, event: MouseEvent): void {
    event.stopPropagation();
    const btnRect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    this.selectedProject.set(project);

    const viewportHeight = window.innerHeight;
    const menuHeight = 60;
    const margin = 8;

    let top: string | null = `${btnRect.bottom + margin}px`;
    let bottom: string | null = null;
    let transformOrigin = 'top right';

    if (btnRect.bottom + menuHeight + margin > viewportHeight) {
      top = null;
      bottom = `${viewportHeight - btnRect.top + margin}px`;
      transformOrigin = 'bottom right';
    }

    this.menuPosition.set({
      position: 'fixed',
      top,
      bottom,
      right: `${window.innerWidth - btnRect.right}px`,
      left: null,
      'transform-origin': transformOrigin,
      'z-index': '10001',
    });
    this.contextMenuOpen.set(true);
  }

  closeContextMenu(): void {
    this.contextMenuOpen.set(false);
    this.selectedProject.set(null);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.contextMenuOpen()) return;
    const target = event.target as HTMLElement;
    if (!target.closest('app-chat-context-menu') && !target.closest('.options-btn')) {
      this.closeContextMenu();
    }
  }

  onMenuPin(): void {
    const proj = this.selectedProject();
    if (proj) {
      this.state.togglePin(proj);
    }
    this.closeContextMenu();
  }

  onMenuRename(): void {
    const proj = this.selectedProject();
    if (proj) {
      this.projectToRename.set(proj);
      this.renameValue = proj.project_name;
      this.showRenameModal.set(true);
    }
    this.closeContextMenu();
  }

  cancelRename(): void {
    this.showRenameModal.set(false);
    this.projectToRename.set(null);
    this.renameValue = '';
  }

  async confirmRename(): Promise<void> {
    const proj = this.projectToRename();
    const newName = this.renameValue.trim();
    if (!proj || !newName) {
      this.cancelRename();
      return;
    }

    if (newName === proj.project_name) {
      this.cancelRename();
      return;
    }

    const success = await this.state.renameProject(proj.project_id, newName);
    if (success) {
      this.cancelRename();
    }
  }

  onMenuDelete(): void {
    const proj = this.selectedProject();
    if (proj) {
      this.projectToDelete.set(proj);
      this.showConfirmModal.set(true);
    }
    this.closeContextMenu();
  }

  cancelDelete(): void {
    this.showConfirmModal.set(false);
    this.projectToDelete.set(null);
  }

  async confirmDelete(): Promise<void> {
    const proj = this.projectToDelete();
    if (proj) {
      await this.state.deleteProject(proj.project_id);
    }
    this.cancelDelete();
  }
}
