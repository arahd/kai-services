import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ResumeDashboardSkeletonComponent } from '@features/hr-portal/components/resume-dashboard-skeleton/resume-dashboard-skeleton.component';

describe('ResumeDashboardSkeletonComponent', () => {
  let component: ResumeDashboardSkeletonComponent;
  let fixture: ComponentFixture<ResumeDashboardSkeletonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ResumeDashboardSkeletonComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ResumeDashboardSkeletonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
