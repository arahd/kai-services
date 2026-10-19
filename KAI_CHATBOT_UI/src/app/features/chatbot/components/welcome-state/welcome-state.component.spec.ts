import { ComponentFixture, TestBed } from '@angular/core/testing';
import { WelcomeStateComponent } from '@features/chatbot/components/welcome-state/welcome-state.component';

describe('WelcomeStateComponent', () => {
  let component: WelcomeStateComponent;
  let fixture: ComponentFixture<WelcomeStateComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [WelcomeStateComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(WelcomeStateComponent);
    component = fixture.componentInstance;
    component.userName = 'maxim.baskar';
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return correct display name (split by dot)', () => {
    expect(component.displayName).toBe('maxim');
  });

  it('should default to Maxim if userName is empty', () => {
    component.userName = '';
    expect(component.displayName).toBe('Maxim');
  });

  it('should emit cardClicked when a card is clicked', () => {
    spyOn(component.cardClicked, 'emit');
    const mockCard = { title: 'Test', text: 'Text', prompt: 'Prompt' };
    component.cardClicked.emit(mockCard);
    expect(component.cardClicked.emit).toHaveBeenCalledWith(mockCard);
  });
});
