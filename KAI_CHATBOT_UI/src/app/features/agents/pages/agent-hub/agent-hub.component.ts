import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AgentAccess, AgentItem, AgentType } from '../../models/agent.model';
import { AgentService } from '../../services/agent.service';

@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  selector: 'app-agent-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './agent-hub.component.html',
  styleUrls: ['./agent-hub.component.scss'],
})
export class AgentHubComponent implements OnInit {
  readonly agentService = inject(AgentService);
  private readonly router = inject(Router);

  readonly searchQuery = signal<string>('');
  readonly selectedType = signal<AgentType | 'ALL'>('ALL');
  readonly selectedAccess = signal<AgentAccess | 'ALL'>('ALL');

  readonly filteredAgents = computed(() => {
    const agents = this.agentService.allAgents();
    const query = this.searchQuery().toLowerCase().trim();
    const typeFilter = this.selectedType();
    const accessFilter = this.selectedAccess();

    return agents.filter((agent) => {
      // Type match
      if (typeFilter !== 'ALL' && agent.agent_type !== typeFilter) {
        return false;
      }
      // Access match
      if (accessFilter !== 'ALL' && agent.agent_access !== accessFilter) {
        return false;
      }
      // Search match
      if (query) {
        const nameMatch = agent.agent_name?.toLowerCase().includes(query);
        const descMatch = agent.description?.toLowerCase().includes(query);
        const userMatch = agent.user_id?.toLowerCase().includes(query);
        if (!nameMatch && !descMatch && !userMatch) {
          return false;
        }
      }
      return true;
    });
  });

  ngOnInit(): void {
    if (!this.agentService.isLoaded()) {
      this.agentService.getAgents().subscribe();
    }
  }

  selectAgent(agent: AgentItem): void {
    this.agentService.selectedAgent.set(agent);
    this.router.navigate(['/agents', agent.id]);
  }

  formatType(type: string): string {
    if (!type) return '';
    if (type.toUpperCase() === 'PEV') return 'PEV';
    return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
  }

  formatAccess(access: string): string {
    if (!access) return '';
    if (access.toUpperCase() === 'PRIVATE') return 'My Agents';
    return access.charAt(0).toUpperCase() + access.slice(1).toLowerCase();
  }
}
