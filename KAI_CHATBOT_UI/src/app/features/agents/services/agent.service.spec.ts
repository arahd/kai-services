import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AgentService } from './agent.service';
import { ConfigService } from '@core/services/config.service';
import { TokenService } from '@core/services/token.service';
import { SessionStorageService } from '@core/services/session-storage.service';
import { AgentItem, GetAgentsResponse } from '../models/agent.model';

describe('AgentService', () => {
  let service: AgentService;
  let httpMock: HttpTestingController;

  const mockConfigService = {
    getKPlatformUrl: () => 'https://kplatform-dev.kumaran.ai',
  };

  const mockTokenService = {
    getToken: () => 'mock-jwt-token',
  };

  const mockSessionStorage = {
    getJwtToken: () => 'mock-jwt-token',
  };

  const mockGetAgentsResponse: GetAgentsResponse = {
    status: 'success',
    count: {
      total: 3,
      by_access: { private: 1, group: 1, public: 1 },
      by_type: { simple: 1, pipeline: 1, pev: 1 },
    },
    is_admin: true,
    k_platform_role: 'kai_kplatform_dev_admin',
    pagination: { has_next: false, page: 1, page_size: 10 },
    private: [
      {
        id: 'agent-1',
        agent_name: 'Time date calculate agent',
        agent_type: 'SIMPLE',
        agent_access: 'PRIVATE',
        agent_url: 'https://kplatform-dev.kumaran.ai/simple/chat',
        description: 'Agent description',
        is_active: true,
        user_id: 'user@kumaran.world',
        user_identity: 'sso',
        user_role: 'kai_kplatform_dev_admin',
        created_at: '2026-08-25T10:45:10',
      },
    ],
    group: [
      {
        id: 'agent-2',
        agent_name: 'Summarizer Pipeline Agent',
        agent_type: 'PIPELINE',
        agent_access: 'GROUP',
        agent_url: 'https://kplatform-dev.kumaran.ai/pipeline/chat',
        is_active: true,
        user_id: 'user@kumaran.world',
        user_identity: 'sso',
        user_role: 'kai_kplatform_dev_admin',
        created_at: '2026-08-25T10:45:10',
      },
    ],
    public: [
      {
        id: 'agent-3',
        agent_name: 'PEV Agent',
        agent_type: 'PEV',
        agent_access: 'PUBLIC',
        agent_url: 'https://kplatform-dev.kumaran.ai/pev/chat',
        is_active: true,
        user_id: 'user@kumaran.world',
        user_identity: 'sso',
        user_role: 'kai_kplatform_dev_admin',
        created_at: '2026-08-25T10:45:10',
      },
    ],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AgentService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ConfigService, useValue: mockConfigService },
        { provide: TokenService, useValue: mockTokenService },
        { provide: SessionStorageService, useValue: mockSessionStorage },
      ],
    });

    service = TestBed.inject(AgentService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should fetch agents via GET /agent-config/api/v2/agent/get_agents', (done) => {
    service.getAgents().subscribe((res) => {
      expect(res).toEqual(mockGetAgentsResponse);
      expect(service.totalCount()).toBe(3);
      expect(service.privateAgents().length).toBe(1);
      expect(service.groupAgents().length).toBe(1);
      expect(service.publicAgents().length).toBe(1);
      expect(service.allAgents().length).toBe(3);
      done();
    });

    const req = httpMock.expectOne(
      (r) => r.url.includes('/agent-config/api/v2/agent/get_agents')
    );
    expect(req.request.method).toBe('GET');
    req.flush(mockGetAgentsResponse);
  });

  it('should handle SIMPLE agent chat dispatching', (done) => {
    const agent = mockGetAgentsResponse.private[0];
    service.sendAgentPrompt(agent, 'hi').subscribe((res) => {
      expect(res.message).toBe('Hello! How can I assist you today?');
      done();
    });

    const req = httpMock.expectOne('https://kplatform-dev.kumaran.ai/simple/chat');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ agent_id: 'agent-1', user_prompt: 'hi' });
    req.flush({
      model_response: { message: 'Hello! How can I assist you today?', status: true },
      status: true,
    });
  });

  it('should handle PIPELINE agent chat dispatching', (done) => {
    const agent = mockGetAgentsResponse.group[0];
    service.sendAgentPrompt(agent, 'test prompt').subscribe((res) => {
      expect(res.message).toBe('Summary output');
      done();
    });

    const req = httpMock.expectOne('https://kplatform-dev.kumaran.ai/pipeline/chat');
    expect(req.request.method).toBe('POST');
    req.flush({
      agent_id: 'agent-2',
      message: 'Summary output',
    });
  });

  it('should handle PEV agent chat dispatching and capture chatId', (done) => {
    const agent = mockGetAgentsResponse.public[0];
    service.sendAgentPrompt(agent, 'test pev').subscribe((res) => {
      expect(res.message).toBe('PEV output message');
      expect(res.chatId).toBe('chat-123');
      done();
    });

    const req = httpMock.expectOne('https://kplatform-dev.kumaran.ai/pev/chat');
    expect(req.request.method).toBe('POST');
    req.flush({
      status: 'success',
      model_response: {
        response: {
          chat_id: 'chat-123',
          message: 'PEV output message',
        },
        status: 'success',
      },
    });
  });
});
