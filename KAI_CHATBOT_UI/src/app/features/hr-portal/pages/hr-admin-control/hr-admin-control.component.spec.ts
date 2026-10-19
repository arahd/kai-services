import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { ToastService } from '@core/services/toast.service';
import { HrAdminService } from '../../hr-portal-services/hr-admin.service';
import { HrPermissionService } from '../../hr-portal-services/hr-permission.service';
import { HrAdminControlComponent } from './hr-admin-control.component';
import { HrUserAccess, HrUsersListResponse } from '../../models/hr-access.model';

describe('HrAdminControlComponent', () => {
  let component: HrAdminControlComponent;
  let fixture: ComponentFixture<HrAdminControlComponent>;

  const mockUsers: HrUserAccess[] = [
    {
      id: 1,
      user_name: 'Diana Michael',
      email_id: 'diana.michael@kumaran.com',
      is_admin: true,
      resume_internal: true,
      resume_offshore: true,
      resume_onsite: true,
      visa_business: true,
      visa_extension: true,
      visa_ict: true,
    },
    {
      id: 2,
      user_name: 'Vishal Balasubramanian',
      email_id: 'vishal.balasubramanian@kumaran.com',
      is_admin: false,
      resume_internal: false,
      resume_offshore: true,
      resume_onsite: true,
      visa_business: false,
      visa_extension: false,
      visa_ict: true,
    },
  ];

  const mockHrAdminService = {
    getUsers: jasmine.createSpy('getUsers').and.returnValue(
      of({ data: mockUsers, success: true } as HrUsersListResponse),
    ),
    createUser: jasmine.createSpy('createUser').and.returnValue(
      of({ message: 'User created successfully', success: true }),
    ),
    updateUser: jasmine.createSpy('updateUser').and.returnValue(
      of({ message: 'User updated successfully', success: true }),
    ),
    deleteUser: jasmine.createSpy('deleteUser').and.returnValue(
      of({ message: 'User deleted successfully', success: true }),
    ),
  };

  const mockHrPermissionService = {
    loadAccessControl: jasmine.createSpy('loadAccessControl').and.returnValue(
      of(mockUsers[0]),
    ),
    isAdmin: () => true,
  };

  const mockToastService = {
    show: jasmine.createSpy('show'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HrAdminControlComponent],
      providers: [
        { provide: HrAdminService, useValue: mockHrAdminService },
        { provide: HrPermissionService, useValue: mockHrPermissionService },
        { provide: ToastService, useValue: mockToastService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HrAdminControlComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create and load users list', () => {
    expect(component).toBeTruthy();
    expect(mockHrAdminService.getUsers).toHaveBeenCalled();
    expect(component.users().length).toBe(2);
    expect(component.totalUsers()).toBe(2);
    expect(component.adminCount()).toBe(1);
  });

  it('should filter users by search term', () => {
    component.searchTerm.set('vishal');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].user_name).toBe('Vishal Balasubramanian');
  });

  it('should filter users by role', () => {
    component.roleFilter.set('admin');
    expect(component.filteredUsers().length).toBe(1);
    expect(component.filteredUsers()[0].user_name).toBe('Diana Michael');
  });

  it('should open and close edit modal', () => {
    component.openEditModal(mockUsers[1]);
    expect(component.isFormModalOpen()).toBeTrue();
    expect(component.isEditMode()).toBeTrue();
    expect(component.selectedUser()).toEqual(mockUsers[1]);

    component.closeFormModal();
    expect(component.isFormModalOpen()).toBeFalse();
    expect(component.selectedUser()).toBeNull();
  });
});
