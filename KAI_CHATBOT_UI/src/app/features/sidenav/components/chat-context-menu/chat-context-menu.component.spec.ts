import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ChatContextMenuComponent } from '@features/sidenav/components/chat-context-menu/chat-context-menu.component';

describe('ChatContextMenuComponent', () => {
  let component: ChatContextMenuComponent;
  let fixture: ComponentFixture<ChatContextMenuComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ChatContextMenuComponent]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatContextMenuComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should emit pinEvt when pin action is triggered', () => {
    spyOn(component.pinEvt, 'emit');
    component.pinEvt.emit();
    expect(component.pinEvt.emit).toHaveBeenCalled();
  });

  it('should emit deleteEvt when delete action is triggered', () => {
    spyOn(component.deleteEvt, 'emit');
    const mockEvent = new MouseEvent('click');
    component.deleteEvt.emit(mockEvent);
    expect(component.deleteEvt.emit).toHaveBeenCalledWith(mockEvent);
  });

  it('should emit moveToProjectEvt when move to project action is triggered', () => {
    spyOn(component.moveToProjectEvt, 'emit');
    component.moveToProjectEvt.emit();
    expect(component.moveToProjectEvt.emit).toHaveBeenCalled();
  });

  it('should only show rename when showShare, showPin, showDelete, and showMoveToProject are false', () => {
    fixture.componentRef.setInput('showShare', false);
    fixture.componentRef.setInput('showPin', false);
    fixture.componentRef.setInput('showDelete', false);
    fixture.componentRef.setInput('showMoveToProject', false);
    fixture.componentRef.setInput('showRename', true);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Rename');
  });

  it('should display Move to Project when showMoveToProject is true', () => {
    fixture.componentRef.setInput('showShare', false);
    fixture.componentRef.setInput('showPin', false);
    fixture.componentRef.setInput('showDelete', false);
    fixture.componentRef.setInput('showRename', false);
    fixture.componentRef.setInput('showMoveToProject', true);
    fixture.detectChanges();

    const items = fixture.nativeElement.querySelectorAll('li');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Move to Project');
  });
});

