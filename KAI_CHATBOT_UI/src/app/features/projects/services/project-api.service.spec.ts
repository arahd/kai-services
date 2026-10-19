import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ProjectApiService } from './project-api.service';
import { ConfigService } from '@core/services/config.service';
import { AzureAdService } from '@core/auth/azure-ad.service';
import { SessionStorageService } from '@core/services/session-storage.service';

import { firstValueFrom } from 'rxjs';

describe('ProjectApiService', () => {
  let service: ProjectApiService;

  const mockConfigService = {
    loadConfig: () => Promise.resolve(),
    getAzureUrl: () => 'https://azure.test',
  };

  const mockAzureAdService = {
    getValidToken: () => Promise.resolve('test-token'),
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        ProjectApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: mockConfigService },
        { provide: AzureAdService, useValue: mockAzureAdService },
        {
          provide: SessionStorageService,
          useValue: { getJwtToken: () => 'mock-jwt-token', setJwtToken: () => {} },
        },
      ],
    });
    service = TestBed.inject(ProjectApiService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should call deleteProject with DELETE method and project_id', async () => {
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(
        new Response(
          JSON.stringify({
            deleted_conversations: 2,
            message: 'Project deleted successfully',
            project_id: 1,
          }),
          { status: 200 }
        )
      )
    );

    const res = await firstValueFrom(service.deleteProject(1));
    expect(res.project_id).toBe(1);
    expect(res.message).toBe('Project deleted successfully');
    expect(window.fetch).toHaveBeenCalledWith(
      'https://azure.test/transcript/project/delete',
      jasmine.objectContaining({
        method: 'DELETE',
        body: JSON.stringify({ project_id: 1 }),
      })
    );
  });

  it('should call pinProject with PUT method and project_id', async () => {
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(
        new Response(
          JSON.stringify({
            is_pinned: true,
            message: 'Project pin status updated',
            project_id: 2,
          }),
          { status: 200 }
        )
      )
    );

    const res = await firstValueFrom(service.pinProject(2));
    expect(res.project_id).toBe(2);
    expect(res.is_pinned).toBeTrue();
    expect(window.fetch).toHaveBeenCalledWith(
      'https://azure.test/transcript/project/pin',
      jasmine.objectContaining({
        method: 'PUT',
        body: JSON.stringify({ project_id: 2 }),
      })
    );
  });

  it('should call shareConversationToProject with POST method and payload', async () => {
    spyOn(window, 'fetch').and.returnValue(
      Promise.resolve(
        new Response(
          JSON.stringify({
            message: 'Conversation shared successfully',
          }),
          { status: 200 }
        )
      )
    );

    const payload = {
      conversation_ids: ['conv-1', 'conv-2'],
      project_id: 5,
    };
    const res = await firstValueFrom(service.moveConversationToProject(payload));
    expect(res.message).toBe('Conversation shared successfully');
    expect(window.fetch).toHaveBeenCalledWith(
      'https://azure.test/transcript/project/conversation/move',
      jasmine.objectContaining({
        method: 'POST',
        body: JSON.stringify(payload),
      })
    );
  });
});



