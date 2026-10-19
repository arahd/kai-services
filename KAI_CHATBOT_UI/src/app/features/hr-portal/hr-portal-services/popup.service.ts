import { Injectable, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';

@Injectable({
  providedIn: 'root',
})
export class PopupService {
  private readonly _activePopup = signal<string>('');
  readonly activePopup = this._activePopup.asReadonly();
  readonly activePopup$ = toObservable(this._activePopup);

  private readonly _popupState = signal<boolean>(false);
  readonly popupState = this._popupState.asReadonly();
  readonly popupState$ = toObservable(this._popupState);

  setActivePopup(popupName: string) {
    this._activePopup.set(popupName);
  }

  openPopup() {
    this._popupState.set(true);
  }

  closePopup() {
    this._popupState.set(false);
  }
}
