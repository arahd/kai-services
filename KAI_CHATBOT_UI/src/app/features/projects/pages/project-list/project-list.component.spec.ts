import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ProjectListComponent } from './project-list.component';
import { ProjectStateService } from '../../services/project-state.service';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { ProjectItem } from '../../models/project.model';

describe('ProjectListComponent', () => {
  let component: ProjectListComponent;
  let fixture: ComponentFixture<ProjectListComponent>;

  const mockProjects: ProjectItem[] = [
    {
      project_id: 1,
      project_name: 'SharePoint',
      created_at: '2026-08-20T10:00:00',
      username: 'user@kumaran.world',
    },
  ];

  const projectsSignal = signal<ProjectItem[]>(mockProjects);
  const filteredProjectsSignal = signal<ProjectItem[]>(mockProjects);

  const mockProjectState = {
    loadProjects: jasmine.createSpy('loadProjects'),
    projects: projectsSignal,
    filteredProjects: filteredProjectsSignal,
    isLoading: signal(false),
    searchQuery: signal(''),
    isProjectPinned: jasmine.createSpy('isProjectPinned').and.returnValue(false),
    togglePin: jasmine.createSpy('togglePin'),
    activeProject: signal(null),
    deleteProject: jasmine.createSpy('deleteProject'),
    renameProject: jasmine.createSpy('renameProject').and.resolveTo(true),
  };

  const mockRouter = {
    navigate: jasmine.createSpy('navigate'),
  };

  beforeEach(async () => {
    projectsSignal.set(mockProjects);
    filteredProjectsSignal.set(mockProjects);

    await TestBed.configureTestingModule({
      imports: [ProjectListComponent],
      providers: [
        { provide: ProjectStateService, useValue: mockProjectState },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProjectListComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load projects on init', () => {
    expect(mockProjectState.loadProjects).toHaveBeenCalled();
  });

  it('should navigate to project detail on openProject', () => {
    component.openProject(mockProjects[0]);
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/projects', 1]);
  });

  it('should render header actions and table header when projects exist', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('.header-actions')).toBeTruthy();
    expect(el.querySelector('.table-columns-header')).toBeTruthy();
    expect(el.querySelector('.empty-state-initial')).toBeNull();
  });

  it('should render exact empty state design when projects list is empty and no search query', () => {
    projectsSignal.set([]);
    filteredProjectsSignal.set([]);
    fixture.detectChanges();

    const el: HTMLElement = fixture.nativeElement;
    // Header actions and table column header should be hidden
    expect(el.querySelector('.header-actions')).toBeNull();
    expect(el.querySelector('.table-columns-header')).toBeNull();

    // Empty state container
    const emptyState = el.querySelector('.empty-state-initial');
    expect(emptyState).toBeTruthy();

    // Illustration SVG
    const img = emptyState?.querySelector('img.empty-illustration');
    expect(img).toBeTruthy();
    expect(img?.getAttribute('src')).toBe('images/empty_projects.svg');

    // Title
    const title = emptyState?.querySelector('.empty-title');
    expect(title?.textContent?.trim()).toBe('No Projects yet');

    // Description
    const desc = emptyState?.querySelector('.empty-desc');
    expect(desc?.textContent).toContain('Create a project to organize your files, chats, and');
    expect(desc?.textContent).toContain('instructions in one place.');

    // Button
    const btn = emptyState?.querySelector('.empty-create-btn') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    expect(btn.textContent?.trim()).toBe('Create Project');

    // Clicking CTA button opens create modal
    spyOn(component, 'openCreateModal').and.callThrough();
    btn.click();
    expect(component.openCreateModal).toHaveBeenCalled();
    expect(component.showCreateModal()).toBeTrue();
  });

  it('should open rename modal on onMenuRename and prefill project name', () => {
    component.selectedProject.set(mockProjects[0]);
    component.onMenuRename();

    expect(component.showRenameModal()).toBeTrue();
    expect(component.projectToRename()).toEqual(mockProjects[0]);
    expect(component.renameValue).toBe('SharePoint');
  });

  it('should cancel rename and close modal', () => {
    component.selectedProject.set(mockProjects[0]);
    component.onMenuRename();

    component.cancelRename();
    expect(component.showRenameModal()).toBeFalse();
    expect(component.projectToRename()).toBeNull();
    expect(component.renameValue).toBe('');
  });

  it('should call state.renameProject with trimmed name on confirmRename', async () => {
    component.selectedProject.set(mockProjects[0]);
    component.onMenuRename();

    component.renameValue = 'Renamed SharePoint';
    await component.confirmRename();

    expect(mockProjectState.renameProject).toHaveBeenCalledWith(1, 'Renamed SharePoint');
    expect(component.showRenameModal()).toBeFalse();
    expect(component.projectToRename()).toBeNull();
  });

  it('should call state.togglePin on togglePin', () => {
    const event = new MouseEvent('click');
    spyOn(event, 'stopPropagation');
    component.togglePin(mockProjects[0], event);

    expect(event.stopPropagation).toHaveBeenCalled();
    expect(mockProjectState.togglePin).toHaveBeenCalledWith(mockProjects[0]);
  });

  it('should call state.togglePin on onMenuPin', () => {
    component.selectedProject.set(mockProjects[0]);
    component.onMenuPin();

    expect(mockProjectState.togglePin).toHaveBeenCalledWith(mockProjects[0]);
    expect(component.contextMenuOpen()).toBeFalse();
  });

  it('should open delete confirmation modal on onMenuDelete', () => {
    component.selectedProject.set(mockProjects[0]);
    component.onMenuDelete();

    expect(component.showConfirmModal()).toBeTrue();
    expect(component.projectToDelete()).toEqual(mockProjects[0]);
    expect(component.contextMenuOpen()).toBeFalse();
  });

  it('should cancel delete modal on cancelDelete', () => {
    component.selectedProject.set(mockProjects[0]);
    component.onMenuDelete();

    component.cancelDelete();
    expect(component.showConfirmModal()).toBeFalse();
    expect(component.projectToDelete()).toBeNull();
  });

  it('should call state.deleteProject on confirmDelete', async () => {
    component.selectedProject.set(mockProjects[0]);
    component.onMenuDelete();

    await component.confirmDelete();
    expect(mockProjectState.deleteProject).toHaveBeenCalledWith(1);
    expect(component.showConfirmModal()).toBeFalse();
    expect(component.projectToDelete()).toBeNull();
  });
});

