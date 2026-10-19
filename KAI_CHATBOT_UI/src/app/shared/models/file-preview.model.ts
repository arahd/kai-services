/**
 * Centralized FilePreview model and upload-related types.
 * Previously duplicated in ChatStateService and AttachmentService.
 */

import { Subscription } from 'rxjs';

export interface FilePreview {
  file: File;
  name: string;
  size: number;
  previewUrl?: string | null;
  uploading: boolean;
  progress: number;
  uploaded: boolean;
  error?: string | null;
  docId?: string | number | null;
  exceeds_threshold?: boolean;
  uploadSub?: Subscription | null;
  originalName?: string;
}

export type TUploadFilter = 'all' | 'uploading' | 'uploaded' | 'failed';
