import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CreateHrUserDto, HrUserAccess, UpdateHrUserDto } from '../../../../models/hr-access.model';

@Component({
  selector: 'app-user-form-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './user-form-modal.component.html',
  styleUrls: ['./user-form-modal.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UserFormModalComponent implements OnChanges {
  @Input() isOpen = false;
  @Input() isEditMode = false;
  @Input() user: HrUserAccess | null = null;
  @Input() isSubmitting = false;
  @Input() errorMessage = '';

  @Output() close = new EventEmitter<void>();
  @Output() save = new EventEmitter<{
    isEdit: boolean;
    userId?: number;
    payload: CreateHrUserDto | UpdateHrUserDto;
  }>();

  // Form State Signals
  userName = signal('');
  emailId = signal('');
  isAdmin = signal(false);

  // Resume Permissions
  resumeInternal = signal(false);
  resumeOffshore = signal(false);
  resumeOnsite = signal(false);

  // Visa Permissions
  visaBusiness = signal(false);
  visaExtension = signal(false);
  visaIct = signal(false);

  validationError = signal('');

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['isOpen'] && this.isOpen) {
      this.validationError.set('');
      if (this.isEditMode && this.user) {
        this.userName.set(this.user.user_name || '');
        this.emailId.set(this.user.email_id || '');
        this.isAdmin.set(!!this.user.is_admin);
        this.resumeInternal.set(!!this.user.resume_internal);
        this.resumeOffshore.set(!!this.user.resume_offshore);
        this.resumeOnsite.set(!!this.user.resume_onsite);
        this.visaBusiness.set(!!this.user.visa_business);
        this.visaExtension.set(!!this.user.visa_extension);
        this.visaIct.set(!!this.user.visa_ict);
      } else {
        // Default new user state
        this.userName.set('');
        this.emailId.set('');
        this.isAdmin.set(false);
        this.resumeInternal.set(false);
        this.resumeOffshore.set(true);
        this.resumeOnsite.set(false);
        this.visaBusiness.set(false);
        this.visaExtension.set(false);
        this.visaIct.set(false);
      }
    }
  }

  toggleAllResume(checked: boolean) {
    this.resumeInternal.set(checked);
    this.resumeOffshore.set(checked);
    this.resumeOnsite.set(checked);
  }

  toggleAllVisa(checked: boolean) {
    this.visaBusiness.set(checked);
    this.visaExtension.set(checked);
    this.visaIct.set(checked);
  }

  isAllResumeSelected(): boolean {
    return this.resumeInternal() && this.resumeOffshore() && this.resumeOnsite();
  }

  isAllVisaSelected(): boolean {
    return this.visaBusiness() && this.visaExtension() && this.visaIct();
  }

  onSubmit() {
    const name = this.userName().trim();
    const email = this.emailId().trim();

    if (!name) {
      this.validationError.set('Please enter a user name.');
      return;
    }

    if (!this.isEditMode) {
      if (!email) {
        this.validationError.set('Please enter an email address.');
        return;
      }
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        this.validationError.set('Please enter a valid email address.');
        return;
      }
    }

    this.validationError.set('');

    if (this.isEditMode && this.user?.id !== undefined) {
      const updatePayload: UpdateHrUserDto = {
        user_name: name,
        is_admin: this.isAdmin(),
        resume_internal: this.resumeInternal(),
        resume_offshore: this.resumeOffshore(),
        resume_onsite: this.resumeOnsite(),
        visa_business: this.visaBusiness(),
        visa_extension: this.visaExtension(),
        visa_ict: this.visaIct(),
      };
      this.save.emit({
        isEdit: true,
        userId: this.user.id,
        payload: updatePayload,
      });
    } else {
      const createPayload: CreateHrUserDto = {
        user_name: name,
        email_id: email,
        is_admin: this.isAdmin(),
        resume_internal: this.resumeInternal(),
        resume_offshore: this.resumeOffshore(),
        resume_onsite: this.resumeOnsite(),
        visa_business: this.visaBusiness(),
        visa_extension: this.visaExtension(),
        visa_ict: this.visaIct(),
      };
      this.save.emit({
        isEdit: false,
        payload: createPayload,
      });
    }
  }

  onBackdropClick(event: MouseEvent) {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close.emit();
    }
  }
}
