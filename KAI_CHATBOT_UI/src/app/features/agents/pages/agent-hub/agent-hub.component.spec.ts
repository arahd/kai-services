import { ComponentFixture, TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AgentHubComponent } from './agent-hub.component';
import { AgentService } from '../../services/agent.service';
import { AgentItem } from '../../models/agent.model';

describe('AgentHubComponent', () => {
  let component: AgentHubComponent;
  let fixture: ComponentFixture<AgentHubComponent>;
  let router: Router;

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
    getAgents: jasmine.createSpy('getAgents').and.returnValue(of(null)),
    isLoaded: signal(false),
    allAgents: () => [mockAgent],
    totalCount: () => 1,
    privateAgents: () => [mockAgent],
    groupAgents: () => [],
    publicAgents: () => [],
    isLoading: () => false,
    selectedAgent: {
      set: jasmine.createSpy('set'),
    },
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AgentHubComponent],
      providers: [
        provideRouter([]),
        { provide: AgentService, useValue: mockAgentService },
      ],
    }).compileComponents();

    router = TestBed.inject(Router);
    spyOn(router, 'navigate');

    fixture = TestBed.createComponent(AgentHubComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load agents', () => {
    expect(component).toBeTruthy();
    expect(mockAgentService.getAgents).toHaveBeenCalled();
  });

  it('should filter agents by search query', () => {
    component.searchQuery.set('Time date');
    expect(component.filteredAgents().length).toBe(1);

    component.searchQuery.set('Nonexistent Agent');
    expect(component.filteredAgents().length).toBe(0);
  });

  it('should filter agents by type and access', () => {
    component.selectedType.set('SIMPLE');
    expect(component.filteredAgents().length).toBe(1);

    component.selectedType.set('PIPELINE');
    expect(component.filteredAgents().length).toBe(0);
  });

  it('should navigate to chat on selectAgent', () => {
    component.selectAgent(mockAgent);
    expect(mockAgentService.selectedAgent.set).toHaveBeenCalledWith(mockAgent);
    expect(router.navigate).toHaveBeenCalledWith(['/agents', 'agent-1']);
  });
});
