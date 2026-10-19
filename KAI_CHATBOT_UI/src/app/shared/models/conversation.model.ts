import { ChatMessage } from '@shared/models/chat-message.model';
import { FilePreview } from '@shared/models/file-preview.model';

export interface Conversation {
  id: number;
  title: string;
  messages: ChatMessage[];
  conversationID?: string;
  augSrc?: any[];
  draftMessage?: string;
  draftAttachments?: FilePreview[];
  draftQueue?: any[];
  tempId?: string | null;
  lockedModel?: string | null;
  is_project_chat?: boolean;
  project_id?: string | number;
}

export function isProjectChat(chat: any): boolean {
  if (!chat) return false;
  if (chat.is_project_chat) return true;
  if (chat.project_id != null && chat.project_id !== '' && chat.project_id !== 'null' && chat.project_id !== 0) return true;
  if (chat.projectId != null && chat.projectId !== '' && chat.projectId !== 'null' && chat.projectId !== 0) return true;
  if (chat.project_name || chat.projectName) return true;
  return false;
}
