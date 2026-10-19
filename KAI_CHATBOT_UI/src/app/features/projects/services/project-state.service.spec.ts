import { TestBed } from '@angular/core/testing';
import { ProjectStateService } from './project-state.service';
import { ProjectApiService } from './project-api.service';
import { TokenService } from '@core/services/token.service';
import { ToastService } from '@core/services/toast.service';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { of } from 'rxjs';

describe('ProjectStateService', () => {
  let service: ProjectStateService;

  const mockProjectApi = {
    getProjects: jasmine.createSpy('getProjects').and.returnValue(
      of({
        count: 1,
        data: [
          {
            project_id: 6,
            project_name: 'SharePoint',
            created_at: '2026-08-20T10:00:00',
            username: 'test@kumaran.world',
            conversation_count: 5,
          },
        ],
        limit: 10,
        page: 1,
        total: 1,
        total_pages: 1,
      })
    ),
    createProject: jasmine.createSpy('createProject').and.returnValue(
      of({
        message: 'Project created successfully',
        project: {
          project_id: 7,
          project_name: 'New Project',
          created_at: '2026-09-01T11:00:00',
          username: 'test@kumaran.world',
        },
      })
    ),
    deleteProject: jasmine.createSpy('deleteProject').and.returnValue(
      of({ deleted_conversations: 1, message: 'Project deleted successfully', project_id: 6 })
    ),
    pinProject: jasmine.createSpy('pinProject').and.returnValue(
      of({ is_pinned: true, message: 'Project pin status updated', project_id: 10 })
    ),
    moveConversationToProject: jasmine.createSpy('moveConversationToProject').and.returnValue(
      of({ message: 'Conversation shared successfully' })
    ),
    shareConversationToProject: jasmine.createSpy('shareConversationToProject').and.returnValue(
      of({ message: 'Conversation shared successfully' })
    ),
  };



  const mockChatApi = {
    sendMessage: jasmine.createSpy('sendMessage').and.returnValue(
      of({ conversationID: 'conv-new-123', response: 'Hi! How can I help you?' })
    ),
    getProjectChatHistoryList: jasmine.createSpy('getProjectChatHistoryList').and.returnValue(
      of({ conversations: [], total_conversations: 0 })
    ),
    renameProject: jasmine.createSpy('renameProject').and.returnValue(
      of({ message: 'Project renamed successfully', project: { id: 6, project_name: 'Renamed SharePoint' } })
    ),
  };

  const mockTokenService = {
    getUserInfo: () => ({ email: 'test@kumaran.world', name: 'Test User' }),
  };

  const mockToast = {
    show: jasmine.createSpy('show'),
  };

  beforeEach(() => {
    mockProjectApi.getProjects.and.returnValue(
      of({
        count: 1,
        data: [
          {
            project_id: 6,
            project_name: 'SharePoint',
            created_at: '2026-08-20T10:00:00',
            username: 'test@kumaran.world',
            conversation_count: 5,
          },
        ],
        limit: 10,
        page: 1,
        total: 1,
        total_pages: 1,
      })
    );
    TestBed.configureTestingModule({
      providers: [
        ProjectStateService,
        { provide: ProjectApiService, useValue: mockProjectApi },
        { provide: ChatApiService, useValue: mockChatApi },
        { provide: TokenService, useValue: mockTokenService },
        { provide: ToastService, useValue: mockToast },
      ],
    });
    service = TestBed.inject(ProjectStateService);
  });

  it('should load projects and update signals', async () => {
    await service.loadProjects();
    expect(service.projects().length).toBe(1);
    expect(service.projects()[0].project_name).toBe('SharePoint');
  });

  it('should filter projects based on search query', async () => {
    await service.loadProjects();
    service.searchQuery.set('Share');
    expect(service.filteredProjects().length).toBe(1);

    service.searchQuery.set('NonExistent');
    expect(service.filteredProjects().length).toBe(0);
  });

  it('should pin and unpin projects', async () => {
    const project = { project_id: 10, project_name: 'P10', created_at: '', is_pinned: false } as any;
    service.projects.set([project]);
    expect(service.isProjectPinned(10)).toBeFalse();

    await service.togglePin(project);
    expect(service.isProjectPinned(10)).toBeTrue();
    expect(mockProjectApi.pinProject).toHaveBeenCalledWith(10);
    expect(mockToast.show).toHaveBeenCalledWith('Project pin status updated', 'success');

    mockProjectApi.pinProject.and.returnValue(
      of({ is_pinned: false, message: 'Project pin status updated', project_id: 10 })
    );
    await service.togglePin(service.projects()[0]);
    expect(service.isProjectPinned(10)).toBeFalse();
  });

  it('should delete project and update projects signal', async () => {
    await service.loadProjects();
    expect(service.projects().length).toBe(1);

    const success = await service.deleteProject(6);
    expect(success).toBeTrue();
    expect(mockProjectApi.deleteProject).toHaveBeenCalledWith(6);
    expect(service.projects().length).toBe(0);
    expect(mockToast.show).toHaveBeenCalledWith('Project deleted successfully', 'success');
  });

  it('should call newChat and return conversationID', async () => {
    const res = await service.newChat(1);
    expect(mockChatApi.sendMessage).toHaveBeenCalledWith(jasmine.objectContaining({
      language_type: 'en',
      query: 'Hi',
      bot_type: 'kumaran',
      userId: 'test@kumaran.world',
      project_id: '1',
    }));
    expect(res?.conversationID).toBe('conv-new-123');
  });

  it('should call chatApi.renameProject with POST payload and update signal', async () => {
    await service.loadProjects();
    const result = await service.renameProject(6, 'Renamed SharePoint');

    expect(result).toBeTrue();
    expect(mockChatApi.renameProject).toHaveBeenCalledWith({
      project_id: 6,
      project_name: 'Renamed SharePoint',
    });
    expect(service.projects()[0].project_name).toBe('Renamed SharePoint');
    expect(mockToast.show).toHaveBeenCalledWith('Project renamed successfully', 'success');
  });

  it('should sort pinned projects first and by updated_at or created_at descending', () => {
    service.projects.set([
      {
        project_id: 1,
        project_name: 'Alpha',
        created_at: '2026-09-10T10:00:00Z',
        updated_at: '2026-09-20T10:00:00Z',
        is_pinned: false,
      },
      {
        project_id: 2,
        project_name: 'Beta Pinned',
        created_at: '2026-09-01T10:00:00Z',
        is_pinned: true,
      },
      {
        project_id: 3,
        project_name: 'Gamma Newer',
        created_at: '2026-09-21T10:00:00Z',
        is_pinned: false,
      },
    ]);

    const sorted = service.filteredProjects();
    expect(sorted[0].project_id).toBe(2); // Pinned first
    expect(sorted[1].project_id).toBe(3); // 21 Sep
    expect(sorted[2].project_id).toBe(1); // 20 Sep (updated_at)
  });

  it('should compute totalPages correctly when total_pages is omitted from backend', async () => {
    mockProjectApi.getProjects.and.returnValue(
      of({
        data: [
          { project_id: 1, project_name: 'P1', created_at: '' },
          { project_id: 2, project_name: 'P2', created_at: '' },
        ],
        limit: 10,
        page: 1,
        total: 25,
      })
    );

    await service.loadProjects();
    expect(service.totalPages()).toBe(3);
    expect(service.totalCount()).toBe(25);
  });

  it('should call moveConversationToProject and toast success on moveConversationToProject', async () => {
    const success = await service.moveConversationToProject('conv-xyz', 6);
    expect(success).toBeTrue();
    expect(mockProjectApi.moveConversationToProject).toHaveBeenCalledWith({
      conversation_ids: ['conv-xyz'],
      project_id: 6,
    });
    expect(mockToast.show).toHaveBeenCalledWith(
      'Conversation shared successfully',
      'success'
    );
  });

});


