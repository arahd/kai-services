import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { UserManagementComponent } from './user-management.component';
import { FormsModule } from '@angular/forms';
import { AdminApiService } from '../../services/admin-api.service';
import { ReportingApiService } from '../../services/reporting-api.service';
import { ToastService } from '@core/services/toast.service';
import { of, throwError } from 'rxjs';
import {
  UserManagementResponse,
  UserManagementUser,
  TeamRecord,
  TeamsListResponse,
  TeamMembersResponse,
} from '@shared/models';

describe('UserManagementComponent', () => {
  let component: UserManagementComponent;
  let fixture: ComponentFixture<UserManagementComponent>;
  let mockAdminApi: jasmine.SpyObj<AdminApiService>;
  let mockReportingApi: jasmine.SpyObj<ReportingApiService>;
  let mockToastService: jasmine.SpyObj<ToastService>;

  const mockUsers: UserManagementUser[] = [
    {
      username: 'ethan.kumaran',
      email: 'ethan@kumaran.com',
      role: 'User',
      access: 'Enabled',
      input_token_limit: 39000,
      output_token_limit: 15000,
      maximum_token_limit: 54000,
      input_tokens_used: 1000,
      output_tokens_used: 500,
      total_daily_usage: 1500,
      total_tokens: 1500,
      allow_sensitive_search: false,
    },
    {
      username: 'sophia.anderson',
      email: 'sophia@anderson.com',
      role: 'Admin',
      access: 'Disabled',
      input_token_limit: 50000,
      output_token_limit: 20000,
      maximum_token_limit: 70000,
      input_tokens_used: 0,
      output_tokens_used: 0,
      total_daily_usage: 0,
      total_tokens: 0,
      allow_sensitive_search: true,
    },
  ];

  const mockResponse: UserManagementResponse = {
    page: 1,
    page_size: 10,
    total_records: 2,
    users: mockUsers,
  };

  const mockTeams: TeamRecord[] = [
    {
      group_id: 1,
      group_name: 'AI Engineering',
      member_count: 2,
      input_token_limit: 200000,
      output_token_limit: 50000,
      overall_input_token_usage: 10,
      overall_output_token_usage: 10,
      daily_input_token_usage: 100,
      daily_output_token_usage: 100,
    },
  ];

  const mockTeamsResponse: TeamsListResponse = {
    teams: mockTeams,
  };

  const mockTeamMembersResponse: TeamMembersResponse = {
    group_id: 1,
    group_name: 'AI Engineering',
    member_count: 2,
    members: [
      { email: 'sudhanshu.prakash@kumaran.world' },
      { email: 'suresh.rajendran@kumaran.world' },
    ],
  };

  beforeEach(async () => {
    mockAdminApi = jasmine.createSpyObj('AdminApiService', [
      'getUserManagementUsers',
      'updateUserManagement',
      'resetUserTokens',
      'getTeams',
      'getTeamMembers',
      'createTeam',
      'updateTeam',
      'deleteTeam',
      'addTeamMembers',
      'removeTeamMembers',
      'getUserManagementSummary',
    ]);
    mockToastService = jasmine.createSpyObj('ToastService', ['show']);

    mockAdminApi.getUserManagementUsers.and.returnValue(of(mockResponse));
    mockAdminApi.getUserManagementSummary.and.returnValue(
      of({
        total_users: 28,
        disabled_access: 0,
        daily_tokens_consumed: 82812,
      })
    );
    mockAdminApi.updateUserManagement.and.returnValue(
      of({ message: 'User updated successfully', email: 'ethan@kumaran.com' })
    );
    mockAdminApi.resetUserTokens.and.returnValue(
      of({ message: 'Token usage reset successfully', email: 'ethan@kumaran.com' })
    );
    mockAdminApi.getTeams.and.returnValue(of(mockTeamsResponse));
    mockAdminApi.getTeamMembers.and.returnValue(of(mockTeamMembersResponse));
    mockAdminApi.createTeam.and.returnValue(
      of({
        message: 'Team created successfully',
        team: {
          group_id: 5,
          group_name: 'New Team',
          input_token_limit: 100000,
          output_token_limit: 100000,
        },
      })
    );
    mockAdminApi.updateTeam.and.returnValue(
      of({
        message: 'Team updated successfully',
        team: {
          group_id: 1,
          group_name: 'AI Engineering',
          input_token_limit: 250000,
          output_token_limit: 150000,
        },
      })
    );
    mockAdminApi.deleteTeam.and.returnValue(
      of({ group_id: 1, message: 'Team deleted successfully' })
    );
    mockAdminApi.addTeamMembers.and.returnValue(
      of({
        group_id: 1,
        members: ['sanjay.kasi@kumaran.world'],
        message: 'Members added successfully',
      })
    );
    mockAdminApi.removeTeamMembers.and.returnValue(
      of({
        group_id: 1,
        members: ['sudhanshu.prakash@kumaran.world'],
        message: 'Members removed successfully',
      })
    );

    mockReportingApi = jasmine.createSpyObj('ReportingApiService', [
      'searchReportingUsers',
    ]);
    mockReportingApi.searchReportingUsers.and.returnValue(
      of({ username: ['test.user@kumaran.world', 'other.user@kumaran.world'] })
    );

    await TestBed.configureTestingModule({
      imports: [UserManagementComponent, FormsModule],
      providers: [
        { provide: AdminApiService, useValue: mockAdminApi },
        { provide: ReportingApiService, useValue: mockReportingApi },
        { provide: ToastService, useValue: mockToastService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(UserManagementComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load users on init', () => {
    expect(component).toBeTruthy();
    expect(mockAdminApi.getUserManagementUsers).toHaveBeenCalledWith({
      page: 1,
      page_size: 10,
      search: undefined,
      access: undefined,
      role: undefined,
    });
    expect(component.users().length).toBe(2);
    expect(component.totalRecords()).toBe(2);
  });

  it('should display paged users and calculate metrics', () => {
    component.userSummary.set(null);
    expect(component.pagedUsers().length).toBe(2);
    expect(component.totalUsersCount()).toBe(2);
    expect(component.disabledUsersCount()).toBe(1);
    expect(component.totalDailyTokensUsed()).toBe(1500);
  });

  it('should trigger search with debounce', fakeAsync(() => {
    mockAdminApi.getUserManagementUsers.calls.reset();
    component.onSearchChange('saran');
    tick(400);
    expect(mockAdminApi.getUserManagementUsers).toHaveBeenCalledWith(
      jasmine.objectContaining({ search: 'saran', page: 1 })
    );
  }));

  it('should filter by role', () => {
    component.onRoleFilterChange('Admin');
    expect(component.roleFilter()).toBe('Admin');
    expect(mockAdminApi.getUserManagementUsers).toHaveBeenCalled();
  });

  it('should filter by access', () => {
    component.onAccessFilterChange('Disabled');
    expect(component.accessFilter()).toBe('Disabled');
    expect(mockAdminApi.getUserManagementUsers).toHaveBeenCalledWith(
      jasmine.objectContaining({ access: 'Disabled', page: 1 })
    );
  });

  it('should paginate correctly', () => {
    component.totalRecords.set(30);
    expect(component.currentPage()).toBe(1);
    component.nextPage();
    expect(component.currentPage()).toBe(2);
    component.prevPage();
    expect(component.currentPage()).toBe(1);
    component.goToPage(3);
    expect(component.currentPage()).toBe(3);
  });

  it('should open and close manage panel', fakeAsync(() => {
    const user = mockUsers[0];
    component.openManagePanel(user);
    tick(15);
    expect(component.manageState()).toBeTruthy();
    expect(component.manageState()!.user.email).toBe(user.email);
    expect(component.panelOpen()).toBe(true);

    component.closeManagePanel();
    expect(component.panelOpen()).toBe(false);
    tick(300);
    expect(component.manageState()).toBeNull();
  }));

  it('should auto-calculate maxTokenLimit when input or output limit is modified', () => {
    const user = mockUsers[0];
    component.openManagePanel(user);
    component.updateManageField('inputTokenLimit', 60000);
    expect(component.manageState()!.maxTokenLimit).toBe(60000 + user.output_token_limit);

    component.updateManageField('outputTokenLimit', 40000);
    expect(component.manageState()!.maxTokenLimit).toBe(100000);
  });

  it('should save user updates via updateUserManagement API', () => {
    const user = mockUsers[0];
    component.openManagePanel(user);
    component.updateManageField('sensitiveQuestions', true);
    component.saveChanges();

    expect(mockAdminApi.updateUserManagement).toHaveBeenCalledWith({
      email: user.email,
      allow_sensitive_search: true,
      input_token_limit: 39000,
      output_token_limit: 15000,
    });
    expect(mockToastService.show).toHaveBeenCalledWith(
      'User updated successfully',
      'success'
    );
  });

  it('should reset tokens via resetUserTokens API after confirmation', () => {
    const user = mockUsers[0];
    component.openManagePanel(user);
    component.resetTokens();
    expect(component.confirmModal()).toBeTruthy();
    component.handleModalConfirm();

    expect(mockAdminApi.resetUserTokens).toHaveBeenCalledWith({ email: user.email });
    expect(mockToastService.show).toHaveBeenCalledWith(
      'Token usage reset successfully',
      'success'
    );
    expect(component.manageState()!.inputTokensUsed).toBe(0);
    expect(component.manageState()!.outputTokensUsed).toBe(0);
    expect(component.manageState()!.totalDailyUsage).toBe(0);
  });

  it('should switch tabs between users and teams', () => {
    expect(component.activeTab()).toBe('users');
    component.setActiveTab('teams');
    expect(component.activeTab()).toBe('teams');
    expect(mockAdminApi.getTeams).toHaveBeenCalled();
  });

  it('should create a team via createTeam API', () => {
    component.openCreateTeamModal();
    expect(component.teamModalOpen()).toBe(true);
    component.updateTeamFormField('group_name', 'New Team');
    component.updateTeamFormField('input_token_limit', 100000);
    component.updateTeamFormField('output_token_limit', 100000);
    component.saveTeam();

    expect(mockAdminApi.createTeam).toHaveBeenCalledWith({
      group_name: 'New Team',
      input_token_limit: 100000,
      output_token_limit: 100000,
    });
    expect(mockToastService.show).toHaveBeenCalledWith(
      'Team created successfully',
      'success'
    );
    expect(component.teamModalOpen()).toBe(false);
  });

  it('should update team limits via updateTeam API', () => {
    const team = mockTeams[0];
    component.openEditTeamModal(team);
    expect(component.teamModalOpen()).toBe(true);
    expect(component.teamModalMode()).toBe('edit');
    component.updateTeamFormField('input_token_limit', 250000);
    component.updateTeamFormField('output_token_limit', 150000);
    component.saveTeam();

    expect(mockAdminApi.updateTeam).toHaveBeenCalledWith({
      group_id: team.group_id,
      input_token_limit: 250000,
      output_token_limit: 150000,
    });
    expect(mockToastService.show).toHaveBeenCalledWith(
      'Team updated successfully',
      'success'
    );
  });

  it('should delete a team after user confirms', () => {
    const team = mockTeams[0];
    component.deleteTeam(team);
    expect(component.confirmModal()).toBeTruthy();

    component.handleModalConfirm();

    expect(mockAdminApi.deleteTeam).toHaveBeenCalledWith(team.group_id);
    expect(mockToastService.show).toHaveBeenCalledWith(
      'Team deleted successfully',
      'success'
    );
  });

  it('should open team members modal and load members', () => {
    const team = mockTeams[0];
    component.openMembersModal(team);
    expect(component.membersModalOpen()).toBe(true);
    expect(mockAdminApi.getTeamMembers).toHaveBeenCalledWith(team.group_id);
    expect(component.teamMembers().length).toBe(2);
  });

  it('should add a member to the team', () => {
    const team = mockTeams[0];
    component.openMembersModal(team);
    component.newMemberEmail.set('sanjay.kasi@kumaran.world');
    component.addMember();

    expect(mockAdminApi.addTeamMembers).toHaveBeenCalledWith({
      group_id: team.group_id,
      members: ['sanjay.kasi@kumaran.world'],
    });
    expect(mockToastService.show).toHaveBeenCalledWith(
      'Members added successfully',
      'success'
    );
  });

  it('should remove a member from the team after confirmation', () => {
    const team = mockTeams[0];
    component.openMembersModal(team);
    component.removeMember('sudhanshu.prakash@kumaran.world');
    expect(component.confirmModal()).toBeTruthy();

    component.handleModalConfirm();

    expect(mockAdminApi.removeTeamMembers).toHaveBeenCalledWith({
      group_id: team.group_id,
      members: ['sudhanshu.prakash@kumaran.world'],
    });
    expect(mockToastService.show).toHaveBeenCalledWith(
      'Members removed successfully',
      'success'
    );
  });

  it('should search reporting users and multi-select members to add', fakeAsync(() => {
    const team = mockTeams[0];
    component.openMembersModal(team);
    tick();

    component.onNewMemberEmailInput('test');
    tick(250);

    expect(mockReportingApi.searchReportingUsers).toHaveBeenCalledWith({
      username: 'test',
      bot_type: 'kumaran',
    });
    expect(component.memberSuggestions()).toContain('test.user@kumaran.world');
    expect(component.showMemberSuggestions()).toBeTrue();

    component.toggleMemberSelection('test.user@kumaran.world');
    expect(component.isMemberSelectedToAdd('test.user@kumaran.world')).toBeTrue();
    expect(component.selectedMembersToAdd()).toEqual(['test.user@kumaran.world']);

    component.toggleMemberSelection('other.user@kumaran.world');
    expect(component.selectedMembersToAdd()).toEqual([
      'test.user@kumaran.world',
      'other.user@kumaran.world',
    ]);

    component.addMember();

    expect(mockAdminApi.addTeamMembers).toHaveBeenCalledWith({
      group_id: team.group_id,
      members: ['test.user@kumaran.world', 'other.user@kumaran.world'],
    });
    expect(component.selectedMembersToAdd()).toEqual([]);
  }));

  it('should load user management summary and populate KPI metrics', () => {
    expect(mockAdminApi.getUserManagementSummary).toHaveBeenCalled();
    expect(component.totalUsersCount()).toBe(28);
    expect(component.disabledUsersCount()).toBe(0);
    expect(component.totalDailyTokensUsed()).toBe(82812);
  });
});
