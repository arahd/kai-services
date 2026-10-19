import { ComponentFixture, TestBed } from '@angular/core/testing';

import { CommonPopupComponent } from '@shared/components/common-popup/common-popup.component';

describe('CommonPopupComponent', () => {
  let component: CommonPopupComponent;
  let fixture: ComponentFixture<CommonPopupComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CommonPopupComponent]
    })
    .compileComponents();

    fixture = TestBed.createComponent(CommonPopupComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
