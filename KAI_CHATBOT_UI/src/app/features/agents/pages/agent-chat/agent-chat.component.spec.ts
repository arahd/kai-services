import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { ActivatedRoute, Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AgentChatComponent } from './agent-chat.component';
import { AgentService } from '../../services/agent.service';
import { ToastService } from '@core/services/toast.service';
import { AgentItem } from '../../models/agent.model';

describe('AgentChatComponent', () => {
  let component: AgentChatComponent;
  let fixture: ComponentFixture<AgentChatComponent>;
  let router: Router;
  let toastMock: jasmine.SpyObj<ToastService>;

  const mockAgent: AgentItem = {
    id: 'agent-1',
    agent_name: 'Time date calculate agent',
    agent_type: 'SIMPLE',
    agent_access: 'PRIVATE',
    agent_url: 'https://kplatform-dev.kumaran.ai/simple/chat',
    description: 'Calculates date time',
    is_active: true,
    user_id: 'user@kumaran.world',
    user_identity: 'sso',
    user_role: 'kai_kplatform_dev_admin',
    created_at: '2026-08-25T10:45:10',
  };

  const mockAgentService = {
    getAgentById: jasmine.createSpy('getAgentById').and.returnValue(mockAgent),
    getAgents: jasmine.createSpy('getAgents').and.returnValue(of(null)),
    isLoaded: signal(false),
    sendAgentPrompt: jasmine.createSpy('sendAgentPrompt').and.returnValue(
      of({ message: 'Response from agent', raw: {} })
    ),
    selectedAgent: {
      set: jasmine.createSpy('set'),
    },
  };

  beforeEach(async () => {
    toastMock = jasmine.createSpyObj('ToastService', ['show']);

    await TestBed.configureTestingModule({
      imports: [AgentChatComponent],
      providers: [
        provideRouter([]),
        { provide: AgentService, useValue: mockAgentService },
        { provide: ToastService, useValue: toastMock },
        {
          provide: ActivatedRoute,
          useValue: {
            params: of({ agentId: 'agent-1' }),
          },
        },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(AgentChatComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load the active agent', () => {
    expect(component).toBeTruthy();
    expect(component.agent()).toEqual(mockAgent);
    expect(component.messages().length).toBe(1);
    expect(component.messages()[0].sender).toBe('agent');
  });

  it('should send user prompt and append agent response', () => {
    component.userPrompt = 'Hello Agent';
    component.sendMessage();

    expect(mockAgentService.sendAgentPrompt).toHaveBeenCalledWith(
      mockAgent,
      'Hello Agent',
      undefined
    );
    expect(component.messages().length).toBe(3); // init greeting + user msg + agent response
    expect(component.messages()[1].message).toBe('Hello Agent');
    expect(component.messages()[2].message).toBe('Response from agent');
    expect(component.isSending()).toBeFalse();
  });

  it('should clear chat on clearChat()', () => {
    component.clearChat();
    expect(toastMock.show).toHaveBeenCalledWith('Conversation reset', 'info');
    expect(component.messages().length).toBe(1);
  });
});
