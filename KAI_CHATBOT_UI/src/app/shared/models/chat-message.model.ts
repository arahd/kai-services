/**
 * Centralized ChatMessage and related types.
 * Previously defined inline in ChatStateService; now shared across the app.
 */

export type MessageSender = 'user' | 'bot';
export type MessageStatus = 'pending' | 'streaming' | 'completed' | 'error' | 'failed';
export type MessageType = 'text' | 'image' | 'document';

export interface ChatImage {
  url: string;
  name: string;
}

export interface ChatDocument {
  url: string;
  name: string;
  extension: string;
}

export interface ChatMessage {
  sender: MessageSender;
  message: any;
  timestamp: Date;
  html?: string;
  editable?: boolean;
  botResponseComplete?: boolean;
  responseType: any;
  formatted?: string;
  augSrc?: any[];
  attachments?: import('./file-preview.model').FilePreview[];
  images?: ChatImage[];
  generated_image_ids?: string[];
  isImageLoading?: boolean;
  imageLoadError?: boolean;
  documents?: ChatDocument[];
  generated_document_ids?: string[];
  isDocumentLoading?: boolean;
  documentLoadError?: boolean;
  collapsed?: boolean;
  canCollapse?: boolean;
  status?: MessageStatus;
  isPlaceholder?: boolean;
  type?: MessageType;
  content?: any;
  imageUrl?: string;
  role?: string;
  suggestions?: string[];
  canRetry?: boolean;
}
