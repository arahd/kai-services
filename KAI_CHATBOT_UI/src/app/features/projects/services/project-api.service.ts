import { Injectable, inject } from '@angular/core';
import { from, Observable } from 'rxjs';
import { ConfigService } from '@core/services/config.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import {
  CreateProjectPayload,
  CreateProjectResponse,
  ProjectListRequest,
  ProjectListResponse,
} from '../models/project.model';

@Injectable({ providedIn: 'root' })
export class ProjectApiService {
  private readonly configService = inject(ConfigService);
  private readonly azureAdService = inject(AzureAdService);
  private readonly storageService = inject(SessionStorageService);

  private getBaseUrl(): string {
    return this.configService.getAzureUrl();
  }

  private async requestWithAuth<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    body?: unknown,
    fallbackEndpoint?: string
  ): Promise<T> {
    await this.configService.loadConfig();
    const baseUrl = this.getBaseUrl();
    let url = `${baseUrl}${endpoint}`;
    let token = this.storageService.getJwtToken() || '';

    const buildOptions = (authToken: string): RequestInit => {
      const opts: RequestInit = {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authToken}`,
        },
      };
      if (body !== undefined && method !== 'GET') {
        opts.body = JSON.stringify(body);
      }
      return opts;
    };

    let res = await fetch(url, buildOptions(token));

    if (res.status === 404 && fallbackEndpoint) {
      url = `${baseUrl}${fallbackEndpoint}`;
      res = await fetch(url, buildOptions(token));
    }

    if (res.status === 401) {
      try {
        token = await this.azureAdService.getValidToken();
        this.storageService.setJwtToken(token);
        res = await fetch(url, buildOptions(token));
      } catch (err) {
        throw err;
      }
    }

    if (!res.ok) {
      let errObj: any = {};
      try {
        errObj = await res.json();
      } catch {
        errObj = { message: res.statusText };
      }
      throw { status: res.status, error: errObj };
    }

    const text = await res.text();
    try {
      return text ? JSON.parse(text) : ({} as T);
    } catch {
      return text as unknown as T;
    }
  }

  private async postWithAuth<T>(endpoint: string, body: unknown): Promise<T> {
    return this.requestWithAuth<T>('POST', endpoint, body);
  }

  /**
   * Fetches the paginated list of projects for a user.
   * Endpoint: POST /transcript/project/list
   */
  getProjects(payload: ProjectListRequest): Observable<ProjectListResponse> {
    return from(this.postWithAuth<ProjectListResponse>('/transcript/project/list', payload));
  }

  /**
   * Creates a new project.
   * Endpoint: POST /conversation/project/create
   */
  createProject(payload: CreateProjectPayload): Observable<CreateProjectResponse> {
    return from(this.postWithAuth<CreateProjectResponse>('/conversation/project/create', payload));
  }

  /**
   * Deletes a project.
   * Endpoint: DELETE /transcript/project/delete (fallback /project/delete)
   */
  deleteProject(projectId: number): Observable<{ deleted_conversations?: number; message: string; project_id: number }> {
    return from(
      this.requestWithAuth<{ deleted_conversations?: number; message: string; project_id: number }>(
        'DELETE',
        '/transcript/project/delete',
        { project_id: projectId },
        '/project/delete'
      )
    );
  }

  /**
   * Pins or unpins a project.
   * Endpoint: PUT /transcript/project/pin (fallback /project/pin)
   */
  pinProject(projectId: number): Observable<{ is_pinned: boolean; message: string; project_id: number }> {
    return from(
      this.requestWithAuth<{ is_pinned: boolean; message: string; project_id: number }>(
        'PUT',
        '/transcript/project/pin',
        { project_id: projectId },
        '/project/pin'
      )
    );
  }

  /**
   * Renames an existing project.
   */
  renameProject(projectId: number, projectName: string): Observable<any> {
    return from(
      this.postWithAuth<any>('/conversation/project/rename', {
        project_id: projectId,
        project_name: projectName,
      })
    );
  }

  /**
   * Moves conversations into a project.
   * Endpoint: POST /transcript/project/conversation/move
   */
  moveConversationToProject(payload: {
    conversation_ids: string[];
    project_id: number;
  }): Observable<{ message: string }> {
    return from(
      this.postWithAuth<{ message: string }>('/transcript/project/conversation/move', payload)
    );
  }

  /**
   * Backwards-compatible alias for moveConversationToProject.
   */
  shareConversationToProject(payload: {
    conversation_ids: string[];
    project_id: number;
  }): Observable<{ message: string }> {
    return this.moveConversationToProject(payload);
  }
}


