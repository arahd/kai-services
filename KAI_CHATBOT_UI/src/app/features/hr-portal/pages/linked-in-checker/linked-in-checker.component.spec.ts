import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { LinkedInCheckerComponent } from '@features/hr-portal/pages/linked-in-checker/linked-in-checker.component';

describe('LinkedInCheckerComponent', () => {
  let component: LinkedInCheckerComponent;
  let fixture: ComponentFixture<LinkedInCheckerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LinkedInCheckerComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LinkedInCheckerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
