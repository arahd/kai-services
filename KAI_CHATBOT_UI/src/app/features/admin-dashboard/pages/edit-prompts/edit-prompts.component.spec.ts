import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { EditPromptsComponent } from '@features/admin-dashboard/pages/edit-prompts/edit-prompts.component';

describe('EditPromptsComponent', () => {
  let component: EditPromptsComponent;
  let fixture: ComponentFixture<EditPromptsComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPromptsComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting()
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(EditPromptsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
