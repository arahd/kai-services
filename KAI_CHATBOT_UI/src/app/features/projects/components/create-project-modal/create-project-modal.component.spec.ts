import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CreateProjectModalComponent } from './create-project-modal.component';
import { ProjectStateService } from '../../services/project-state.service';
import { FormsModule } from '@angular/forms';

describe('CreateProjectModalComponent', () => {
  let component: CreateProjectModalComponent;
  let fixture: ComponentFixture<CreateProjectModalComponent>;

  const mockProjectState = {
    createProject: jasmine.createSpy('createProject').and.returnValue(
      Promise.resolve({
        project_id: 1,
        project_name: 'Test Project',
      })
    ),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CreateProjectModalComponent, FormsModule],
      providers: [{ provide: ProjectStateService, useValue: mockProjectState }],
    }).compileComponents();

    fixture = TestBed.createComponent(CreateProjectModalComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit closed event when close() is called', () => {
    spyOn(component.closed, 'emit');
    component.close();
    expect(component.closed.emit).toHaveBeenCalled();
  });

  it('should submit project and emit projectCreated', async () => {
    spyOn(component.projectCreated, 'emit');
    spyOn(component.closed, 'emit');

    component.projectName = 'Test Project';
    await component.onSubmit();

    expect(mockProjectState.createProject).toHaveBeenCalledWith('Test Project');
    expect(component.projectCreated.emit).toHaveBeenCalled();
    expect(component.closed.emit).toHaveBeenCalled();
  });
});

