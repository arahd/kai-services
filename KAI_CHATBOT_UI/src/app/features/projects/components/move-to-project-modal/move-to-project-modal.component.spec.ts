import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MoveToProjectModalComponent } from './move-to-project-modal.component';
import { ProjectStateService } from '../../services/project-state.service';
import { signal } from '@angular/core';

describe('MoveToProjectModalComponent', () => {
  let component: MoveToProjectModalComponent;
  let fixture: ComponentFixture<MoveToProjectModalComponent>;

  const mockProjects = [
    { project_id: 1, project_name: 'Marketing Campaign', created_at: '2026-01-01' },
    { project_id: 2, project_name: 'Engineering Roadmap', created_at: '2026-01-02' },
  ];

  const mockProjectState = {
    projects: signal<any[]>(mockProjects),
    isLoading: signal<boolean>(false),
    isLoadingMore: signal<boolean>(false),
    hasMoreProjects: true,
    loadProjects: jasmine.createSpy('loadProjects').and.returnValue(Promise.resolve()),
    loadMoreProjects: jasmine.createSpy('loadMoreProjects').and.returnValue(Promise.resolve()),
    moveConversationToProject: jasmine.createSpy('moveConversationToProject').and.returnValue(Promise.resolve(true)),
  };

  beforeEach(async () => {
    mockProjectState.loadMoreProjects.calls.reset();
    await TestBed.configureTestingModule({
      imports: [MoveToProjectModalComponent],
      providers: [{ provide: ProjectStateService, useValue: mockProjectState }],
    }).compileComponents();

    fixture = TestBed.createComponent(MoveToProjectModalComponent);
    component = fixture.componentInstance;
    component.conversationId = 'conv-123';
    component.conversationTitle = 'Test Conversation';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should filter projects based on search query', () => {
    component.searchQuery.set('marketing');
    expect(component.availableProjects().length).toBe(1);
    expect(component.availableProjects()[0].project_name).toBe('Marketing Campaign');

    component.searchQuery.set('xyz');
    expect(component.availableProjects().length).toBe(0);
  });

  it('should select a project on click', () => {
    component.selectProject(2);
    expect(component.selectedProjectId()).toBe(2);
  });

  it('should emit close event on onClose', () => {
    spyOn(component.close, 'emit');
    component.onClose();
    expect(component.close.emit).toHaveBeenCalled();
  });

  it('should call moveConversationToProject and emit moved on confirm', async () => {
    spyOn(component.moved, 'emit');
    component.selectProject(1);

    await component.onConfirmMove();

    expect(mockProjectState.moveConversationToProject).toHaveBeenCalledWith('conv-123', 1);
    expect(component.moved.emit).toHaveBeenCalledWith(1);
  });

  it('should emit createProjectRequested on onCreateNewProject', () => {
    spyOn(component.close, 'emit');
    spyOn(component.createProjectRequested, 'emit');

    component.onCreateNewProject();

    expect(component.close.emit).toHaveBeenCalled();
    expect(component.createProjectRequested.emit).toHaveBeenCalled();
  });

  it('should trigger loadMoreProjects on onScroll when near bottom', () => {
    const mockElement = {
      scrollHeight: 500,
      scrollTop: 300,
      clientHeight: 150, // 500 - 300 - 150 = 50 <= 60 threshold
    } as HTMLElement;

    component.onScroll({ target: mockElement } as unknown as Event);

    expect(mockProjectState.loadMoreProjects).toHaveBeenCalled();
  });

  it('should not trigger loadMoreProjects on onScroll when not near bottom', () => {
    const mockElement = {
      scrollHeight: 500,
      scrollTop: 100,
      clientHeight: 150, // 500 - 100 - 150 = 250 > 60 threshold
    } as HTMLElement;

    component.onScroll({ target: mockElement } as unknown as Event);

    expect(mockProjectState.loadMoreProjects).not.toHaveBeenCalled();
  });
});

