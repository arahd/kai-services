import { Injectable, computed, inject, signal } from '@angular/core';
import { ProjectApiService } from './project-api.service';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { TokenService } from '@core/services/token.service';
import { ToastService } from '@core/services/toast.service';
import {
  CreateProjectPayload,
  ProjectConversation,
  ProjectItem,
} from '../models/project.model';
import { SendMessagePayload } from '@shared/models';
import { firstValueFrom } from 'rxjs';

@Injectable({ providedIn: 'root' })
export class ProjectStateService {
  private readonly projectApi = inject(ProjectApiService);
  private readonly chatApi = inject(ChatApiService);
  private readonly tokenService = inject(TokenService);
  private readonly toast = inject(ToastService);

  readonly projects = signal<ProjectItem[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly isLoadingMore = signal<boolean>(false);
  readonly searchQuery = signal<string>('');
  readonly currentPage = signal<number>(1);
  readonly totalPages = signal<number>(1);
  readonly totalCount = signal<number>(0);
  readonly limit = signal<number>(20);

  readonly activeProject = signal<ProjectItem | null>(null);
  readonly projectConversations = signal<ProjectConversation[]>([]);
  readonly isLoadingConversations = signal<boolean>(false);
  readonly projectConvCurrentPage = signal<number>(1);
  readonly projectConvTotalPages = signal<number>(1);
  readonly projectConvTotalCount = signal<number>(0);

  readonly showCreateModal = signal<boolean>(false);

  /**
   * Filtered project list by search query and sorted with pinned items first.
   */
  readonly filteredProjects = computed(() => {
    const query = this.searchQuery().trim().toLowerCase();
    let list = this.projects();

    if (query) {
      list = list.filter((p) => p.project_name?.toLowerCase().includes(query));
    }

    return [...list].sort((a, b) => {
      const aPinned = !!a.is_pinned;
      const bPinned = !!b.is_pinned;
      if (aPinned && !bPinned) return -1;
      if (!aPinned && bPinned) return 1;
      const timeA = new Date(a.updated_at || a.created_at || 0).getTime();
      const timeB = new Date(b.updated_at || b.created_at || 0).getTime();
      return timeB - timeA;
    });
  });

  private getUsername(): string {
    const info = this.tokenService.getUserInfo();
    return info?.email || info?.preferred_username || info?.upn || '';
  }

  isProjectPinned(projectId: number): boolean {
    const proj = this.projects().find((p) => p.project_id === projectId);
    return !!proj?.is_pinned;
  }

  async togglePin(project: ProjectItem): Promise<boolean> {
    const currentStatus = this.isProjectPinned(project.project_id);
    const newStatus = !currentStatus;

    // Optimistically update project in state
    this.projects.update((list) =>
      list.map((p) =>
        p.project_id === project.project_id ? { ...p, is_pinned: newStatus } : p
      )
    );

    try {
      const res = await firstValueFrom(this.projectApi.pinProject(project.project_id));
      const backendPinned = res?.is_pinned !== undefined ? !!res.is_pinned : newStatus;
      if (backendPinned !== newStatus) {
        this.projects.update((list) =>
          list.map((p) =>
            p.project_id === project.project_id ? { ...p, is_pinned: backendPinned } : p
          )
        );
      }
      this.toast.show(
        res?.message || (backendPinned ? 'Project pinned' : 'Project unpinned'),
        'success'
      );
      return true;
    } catch (err) {
      // Revert on failure
      this.projects.update((list) =>
        list.map((p) =>
          p.project_id === project.project_id ? { ...p, is_pinned: currentStatus } : p
        )
      );
      this.toast.show('Failed to update project pin status', 'error');
      console.error('Failed to toggle pin on project:', err);
      return false;
    }
  }

  /**
   * Loads the list of projects from the backend (always page 1).
   * Replaces the existing project list.
   */
  async loadProjects(page: number = 1, isSilent: boolean = false): Promise<void> {
    if (!isSilent) {
      this.isLoading.set(true);
    }
    try {
      const username = this.getUsername();
      const res = await firstValueFrom(
        this.projectApi.getProjects({
          bot_type: 'kumaran',
          page,
          limit: this.limit(),
          username,
        })
      );

      if (res && Array.isArray(res.data) && res.data.length > 0) {
        this.projects.set(res.data);
        const limit = res.limit || this.limit() || 10;
        const total = res.total ?? res.count ?? res.data.length;
        this.currentPage.set(res.page || 1);
        this.totalPages.set(res.total_pages || Math.ceil(total / limit) || 1);
        this.totalCount.set(total);
      } else {
        this.projects.set([]);
        this.totalCount.set(0);
        this.currentPage.set(1);
        this.totalPages.set(1);
      }
    } catch {
      this.projects.set([]);
      this.totalCount.set(0);
    } finally {
      this.isLoading.set(false);
    }
  }

  /**
   * Appends the next page of projects to the existing list.
   * Call this when the user clicks "Load More".
   */
  async loadMoreProjects(): Promise<void> {
    if (this.isLoadingMore() || this.isLoading()) return;
    const nextPage = this.currentPage() + 1;
    if (nextPage > this.totalPages()) return;

    this.isLoadingMore.set(true);
    try {
      const username = this.getUsername();
      const res = await firstValueFrom(
        this.projectApi.getProjects({
          bot_type: 'kumaran',
          page: nextPage,
          limit: this.limit(),
          username,
        })
      );

      if (res && Array.isArray(res.data) && res.data.length > 0) {
        // Append without duplicates
        const existing = new Set(this.projects().map((p) => p.project_id));
        const fresh = res.data.filter((p: ProjectItem) => !existing.has(p.project_id));
        this.projects.update((list) => [...list, ...fresh]);
        const limit = res.limit || this.limit() || 10;
        const total = res.total ?? res.count ?? this.totalCount();
        this.currentPage.set(res.page || nextPage);
        this.totalPages.set(res.total_pages || Math.ceil(total / limit) || this.totalPages());
        this.totalCount.set(total);
      }
    } catch (err) {
      console.error('Failed to load more projects:', err);
    } finally {
      this.isLoadingMore.set(false);
    }
  }

  /** True when there are more pages available to load. */
  get hasMoreProjects(): boolean {
    return this.currentPage() < this.totalPages();
  }

  /**
   * Creates a new project using POST /conversation/project/create.
   * Throws on error — no offline fallback.
   */
  async createProject(projectName: string): Promise<ProjectItem | null> {
    const trimmed = projectName.trim();
    if (!trimmed) return null;

    const payload: CreateProjectPayload = {
      bot_type: 'kumaran',
      project_name: trimmed,
      username: this.getUsername(),
    };

    const res = await firstValueFrom(this.projectApi.createProject(payload));
    if (res && res.project) {
      this.toast.show(res.message || 'Project created successfully', 'success');
      await this.loadProjects(1, true);
      return res.project;
    }
    return null;
  }

  /**
   * Loads a project by ID.
   */
  async getOrFetchProject(projectId: number): Promise<ProjectItem | null> {
    const existing = this.projects().find((p) => p.project_id === projectId);
    if (existing) {
      this.activeProject.set(existing);
      return existing;
    }

    await this.loadProjects(1, true);
    const found = this.projects().find((p) => p.project_id === projectId);
    if (found) {
      this.activeProject.set(found);
      return found;
    }
    return null;
  }

  /**
   * Loads conversations associated with a project.
   * Uses POST /transcript/chat/history/project/conversations.
   * Sets an empty list if the API fails or returns no data.
   */
  async loadProjectConversations(projectId: number, page: number = 1): Promise<void> {
    this.isLoadingConversations.set(true);
    try {
      const username = this.getUsername();
      const res = await firstValueFrom(
        this.chatApi.getProjectChatHistoryList({
          user_string: username,
          bot_type: 'kumaran',
          project_id: projectId,
          page_number: page,
          page_size: 20,
        })
      );
      if (res?.conversations?.length > 0) {
        const mapped: ProjectConversation[] = res.conversations.map((c: any) => ({
          conversationID: c.conversationID,
          title: c.conversationName || 'Untitled',
          created_at: c.created_at || c.startTime || '',
          updated_at: c.updated_at,
          is_pinned: c.is_pinned,
          bot_type: c.bot_type,
          gpt_model_name: c.gpt_model_name,
          greetings: c.greetings,
          language_type: c.language_type,
          project_id: c.project_id,
          startTime: c.startTime,
          userID: c.userID,
        }));
        this.projectConversations.set(mapped);
        this.projectConvTotalCount.set(res.total_conversations);
        this.projectConvTotalPages.set(
          Math.ceil(res.total_conversations / (res.page_size || 20))
        );
        this.projectConvCurrentPage.set(res.page_number);
      } else {
        this.projectConversations.set([]);
      }
    } catch {
      this.projectConversations.set([]);
    } finally {
      this.isLoadingConversations.set(false);
    }
  }

  /**
   * Loads full conversation messages for a project conversation.
   * Uses POST /transcript/chat/history/project/conversation.
   */
  loadProjectConversationMessages(
    projectId: number,
    conversationId: string
  ): Promise<any> {
    const username = this.getUsername();
    return firstValueFrom(
      this.chatApi.getProjectChatHistoryConversation({
        user_string: username,
        bot_type: 'kumaran',
        project_id: projectId,
        conversation_id: conversationId,
      })
    );
  }

  /**
   * Deletes a project using DELETE /project/delete.
   */
  async deleteProject(projectId: number): Promise<boolean> {
    try {
      const res = await firstValueFrom(this.projectApi.deleteProject(projectId));
      this.projects.update((list) => list.filter((p) => p.project_id !== projectId));
      if (this.activeProject()?.project_id === projectId) {
        this.activeProject.set(null);
        sessionStorage.removeItem('kai_active_project_id');
        sessionStorage.removeItem('kai_active_project_name');
        sessionStorage.removeItem('kai_active_project_conversation_id');
        sessionStorage.removeItem('kai_project_active_conv');
      }
      this.toast.show(res?.message || 'Project deleted successfully', 'success');
      return true;
    } catch (err) {
      this.toast.show('Failed to delete project', 'error');
      console.error('Failed to delete project:', err);
      return false;
    }
  }

  /**
   * Renames an existing project using POST /conversation/project/rename.
   */
  async renameProject(projectId: number, newName: string): Promise<boolean> {
    const trimmed = newName.trim();
    if (!trimmed) return false;

    try {
      await firstValueFrom(
        this.chatApi.renameProject({
          project_id: projectId,
          project_name: trimmed,
        })
      );
      this.projects.update((list) =>
        list.map((p) =>
          p.project_id === projectId ? { ...p, project_name: trimmed } : p
        )
      );
      if (this.activeProject()?.project_id === projectId) {
        this.activeProject.update((p) => (p ? { ...p, project_name: trimmed } : null));
        sessionStorage.setItem('kai_active_project_name', trimmed);
      }
      this.toast.show('Project renamed successfully', 'success');
      return true;
    } catch (err) {
      this.toast.show('Failed to rename project', 'error');
      console.error('Failed to rename project:', err);
      return false;
    }
  }

  /**
   * Initializes a new chat session for a project and returns the generated conversationID.
   * Sends the initial 'Hi' message to chatservice with project_id.
   */
  async newChat(projectId: number): Promise<{ conversationID: string; response?: any } | null> {
    const username = this.getUsername();
    const payload: SendMessagePayload = {
      language_type: 'en',
      query: 'Hi',
      bot_type: 'kumaran',
      userId: username,
      project_id: String(projectId),
    };

    try {
      const res = await firstValueFrom(this.chatApi.sendMessage(payload));
      if (res?.conversationID) {
        return { conversationID: res.conversationID, response: res };
      }
    } catch (err) {
      console.error('Failed to generate project conversationId via newChat:', err);
    }
    return null;
  }

  /**
   * Moves/shares a conversation to an existing project.
   * Uses POST /transcript/project/conversation/move.
   */
  async moveConversationToProject(
    conversationId: string,
    projectId: number
  ): Promise<boolean> {
    try {
      const res = await firstValueFrom(
        this.projectApi.moveConversationToProject({
          conversation_ids: [conversationId],
          project_id: projectId,
        })
      );

      this.toast.show(
        res?.message || 'Conversation moved to project successfully',
        'success'
      );
      // Refresh project list to update conversation counts
      await this.loadProjects(1, true);
      if (this.activeProject()?.project_id === projectId) {
        await this.loadProjectConversations(projectId, 1);
      }
      return true;
    } catch (err: any) {
      const errorMsg =
        err?.error?.message || err?.message || 'Failed to move conversation to project';
      this.toast.show(errorMsg, 'error');
      console.error('Failed to move conversation to project:', err);
      return false;
    }
  }
}

