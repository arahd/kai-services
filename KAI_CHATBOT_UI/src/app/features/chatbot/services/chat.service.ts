import { Injectable, inject, signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { Observable, Subject } from 'rxjs';
import { ChatApiService } from '@features/chatbot/services/chat-api.service';
import { AdminApiService } from '@features/admin-dashboard/services/admin-api.service';
import { ReportingApiService } from '@features/admin-dashboard/services/reporting-api.service';
import { PromptApiService } from '@features/admin-dashboard/services/prompt-api.service';
import {
  ApprovePayload,
  PendingUser,
  RegisteredUser,
  SendMessagePayload,
  EndChatPayload,
  SuggestionsPayload,
  ConversationHistoryPayload
} from '@shared/models';

export { ApprovePayload, PendingUser, RegisteredUser, SendMessagePayload };

/**
 * @deprecated This monolithic service has been split into:
 * - ChatApiService
 * - AdminApiService
 * - ReportingApiService
 * - PromptApiService
 * 
 * Please inject those domain-specific services directly instead of using ChatService.
 * This class remains temporarily to ensure backward compatibility for components 
 * that have not yet been migrated.
 */
@Injectable({
  providedIn: 'root',
})
export class ChatService {
  private readonly chatApi = inject(ChatApiService);
  private readonly adminApi = inject(AdminApiService);
  private readonly reportingApi = inject(ReportingApiService);
  private readonly promptApi = inject(PromptApiService);

  // ---------------------------------------------------------
  // DELEGATED TO CHAT API SERVICE
  // ---------------------------------------------------------
  sendMessage(payload: SendMessagePayload): Observable<any> { return this.chatApi.sendMessage(payload); }
  sendMessageStream(payload: SendMessagePayload): Observable<string> { return this.chatApi.sendMessageStream(payload); }
  getConversationHistory(payload: ConversationHistoryPayload, page: number = 1, limit: number = 20): Observable<any> { return this.chatApi.getConversationHistory(payload, page, limit); }
  getGeneratedImage(payload: { conversation_id: string; image_id: string }): Observable<any> { return this.chatApi.getGeneratedImage(payload); }
  getGeneratedImagePublic(payload: { conversation_id: string; image_id: string }): Observable<any> { return this.chatApi.getGeneratedImagePublic(payload); }
  getGeneratedDocument(payload: { conversation_id: string; generated_document_id: string }): Observable<any> { return this.chatApi.getGeneratedDocument(payload); }
  getUploadedDocument(payload: { conversation_id: string }): Observable<any> { return this.chatApi.getUploadedDocument(payload); }
  endChat(payload: EndChatPayload): Observable<any> { return this.chatApi.endChat(payload); }
  deleteChat(payload: { conversationID: string; project_id?: string | number }): Observable<any> { return this.chatApi.deleteChat(payload); }
  pinChat(conversationID: string, projectId?: string | number): Observable<any> { return this.chatApi.pinChat(conversationID, projectId); }
  renameChat(payload: { conversationID: string; conversationName: string; project_id?: string | number }): Observable<any> { return this.chatApi.renameChat(payload); }
  shareChat(payload: { conversationID: string; date_info: string; user_string: string; bot_type: string; project_id?: string | number }): Observable<any> { return this.chatApi.shareChat(payload); }
  getSharedChat(token: string): Observable<any> { return this.chatApi.getSharedChat(token); }
  searchChat(payload: any): Observable<any> { return this.chatApi.searchChat(payload); }
  getChatInformation(payload: any): Observable<any> { return this.chatApi.getChatInformation(payload); }
  getSuggesstions(payload: SuggestionsPayload): Observable<any> { return this.chatApi.getSuggestions(payload); }
  chatSummarization(payload: { conversationID: string }): Observable<any> { return this.chatApi.chatSummarization(payload); }
  getNewChatHistoryList(payload: any, page: number = 1, limit: number = 20): Observable<any> { return this.chatApi.getNewChatHistoryList(payload, page, limit); }
  getNewChatHistoryConversation(payload: any): Observable<any> { return this.chatApi.getNewChatHistoryConversation(payload); }
  getProjectChatHistoryList(params: any): Observable<any> { return this.chatApi.getProjectChatHistoryList(params); }
  getProjectChatHistoryConversation(params: any): Observable<any> { return this.chatApi.getProjectChatHistoryConversation(params); }

  // ---------------------------------------------------------
  // DELEGATED TO ADMIN API SERVICE
  // ---------------------------------------------------------
  getPendingUserDetails(): Observable<PendingUser[]> { return this.adminApi.getPendingUserDetails(); }
  getRegisteredUserDetails(): Observable<RegisteredUser[]> { return this.adminApi.getRegisteredUserDetails(); }
  approveAccess(payload: ApprovePayload): Observable<any> { return this.adminApi.approveAccess(payload); }
  getAvailableModels(): Observable<string[]> { return this.adminApi.getAvailableModels(); }
  updateUserLatestModel(payload: any): Observable<any> { return this.adminApi.updateUserLatestModel(payload); }
  fetchUserLatestModel(userId: string): Observable<any> { return this.adminApi.fetchUserLatestModel(userId); }
  unblockUser(userId: string): Observable<any> { return this.adminApi.unblockUser(userId); }
  blockUser(userId: string): Observable<any> { return this.adminApi.blockUser(userId); }
  revokeUser(data: any): Observable<any> { return this.adminApi.revokeUser(data); }
  activateUser(data: any): Observable<any> { return this.adminApi.activateUser(data); }
  resetApiUser(payload: { username: string; project_id: string }): Observable<any> { return this.adminApi.resetApiUser(payload); }
  sendTokenToBackend(payload: any): Observable<any> { return this.adminApi.sendTokenToBackend(payload); }
  requestAccess(payload: any): Observable<any> { return this.adminApi.requestAccess(payload); }
  setSensitiveQuestionsAllowance(userId: string, allow: boolean): Observable<any> { return this.adminApi.setSensitiveQuestionsAllowance(userId, allow); }
  getSensitiveQuestionsAllowance(userId: string): Observable<boolean> { return this.adminApi.getSensitiveQuestionsAllowance(userId); }
  disableSensitiveQuestions(userId: string): Observable<any> { return this.adminApi.setSensitiveQuestionsAllowance(userId, false); }
  enableSensitiveQuestions(userId: string): Observable<any> { return this.adminApi.setSensitiveQuestionsAllowance(userId, true); }
  searchTokenUsageUsers(query: string): Observable<any> { return this.adminApi.searchTokenUsageUsers(query); }
  getSortedTokenUsageUsers(params: {
    sort_by: string;
    order: 'asc' | 'desc';
    page: number;
  }): Observable<any> { return this.adminApi.getSortedTokenUsageUsers(params); }

  // ---------------------------------------------------------
  // DELEGATED TO REPORTING API SERVICE
  // ---------------------------------------------------------
  getReportingAnalytics(payload: any): Observable<any> { return this.reportingApi.getReportingAnalytics(payload); }
  getUserAnalytics(payload: any): Observable<any> { return this.reportingApi.getUserAnalytics(payload); }
  searchReportingUsers(payload: any): Observable<any> { return this.reportingApi.searchReportingUsers(payload); }
  getReportingModels(payload: any): Observable<any> { return this.reportingApi.getReportingModels(payload); }
  getModelUsage(payload: any): Observable<any> { return this.reportingApi.getModelUsage(payload); }
  getReportSummary(payload: any): Observable<any> { return this.reportingApi.getReportSummary(payload); }
  getProjectList(payload: any): Observable<any> { return this.reportingApi.getProjectList(payload); }
  getUserProjectList(payload: any): Observable<any> { return this.reportingApi.getUserProjectList(payload); }
  getMaxTokensUsed(payload: any): Observable<any> { return this.reportingApi.getMaxTokensUsed(payload); }
  getMinTokensUsed(payload: any): Observable<any> { return this.reportingApi.getMinTokensUsed(payload); }
  getProjectNames(payload: any): Observable<any> { return this.reportingApi.getProjectNames(payload); }
  getUsernames(payload: any): Observable<any> { return this.reportingApi.getUsernames(payload); }
  getUserDetails(payload: any): Observable<any> { return this.reportingApi.getUserDetails(payload); }
  getUsersByProject(payload: any): Observable<any> { return this.reportingApi.getUsersByProject(payload); }
  getRevokedUsers(payload: any): Observable<any> { return this.reportingApi.getRevokedUsers(payload); }
  getFilterProjectIds(payload: any): Observable<any> { return this.reportingApi.getFilterProjectIds(payload); }
  searchFilterUsernames(payload: any): Observable<any> { return this.reportingApi.searchFilterUsernames(payload); }
  getApiUserReportDetails(payload: any): Observable<any> { return this.reportingApi.getApiUserReportDetails(payload); }
  createBugReport(formData: FormData): Observable<any> { return this.reportingApi.createBugReport(formData); }
  getBugReports(payload: any): Observable<any> { return this.reportingApi.getBugReports(payload); }
  updateBugStatus(payload: { ticket_number: string; state: string }): Observable<any> { return this.reportingApi.updateBugStatus(payload); }
  getBugAttachment(payload: { attachment_id: number }): Observable<any> { return this.reportingApi.getBugAttachment(payload); }
  exportAllUsersXlsx(payload: any): Observable<Blob> { return this.reportingApi.exportAllUsersXlsx(payload); }
  exportQuestionsXlsx(payload: any): Observable<Blob> { return this.reportingApi.exportQuestionsXlsx(payload); }
  exportReportQuestionsXlsx(payload: any): Observable<Blob> { return this.reportingApi.exportReportQuestionsXlsx(payload); }

  // ---------------------------------------------------------
  // DELEGATED TO PROMPT API SERVICE
  // ---------------------------------------------------------
  fetchPrompt(payload: any): Observable<any> { return this.promptApi.fetchPrompt(payload); }
  updatePrompt(payload: any): Observable<any> { return this.promptApi.updatePrompt(payload); }

  // ---------------------------------------------------------
  // STUBS FOR REMOVED STATE (Handled by ChatFacade/ChatStateService now)
  // ---------------------------------------------------------
  readonly refreshChatHistory$ = new Subject<void>();
  readonly activeTempId = signal<string | null>(null);
  readonly activeTempId$ = toObservable(this.activeTempId);
  readonly draftConv$ = new Subject<any>();
  readonly firstQuestion$ = new Subject<string>();

  triggerChatHistoryRefresh() { this.refreshChatHistory$.next(); }
  setActiveTempId(id: string | null) { this.activeTempId.set(id); }
  updateDraftConversation(conv: any) { this.draftConv$.next(conv); }
  sendFirstQuestion(q: string) { this.firstQuestion$.next(q); }
  
  // NOTE: getUserTokensDetails seems to hit auth/get-user-tokens-details, putting it here directly.
  getUserTokensDetails(page: number = 1, sortBy?: string, limit?: number): Observable<any> {
    const params: Record<string, string> = { page: String(page) };
    if (sortBy && sortBy !== 'tokens') params['sort_by'] = sortBy;
    if (limit != null) params['limit'] = String(limit);
    // Uses the BaseApiService get method pattern, mapped directly to AdminApiService since it hits auth/
    return (this.adminApi as any).get('/auth/get-user-tokens-details', { params: new URLSearchParams(params) });
  }

  createClientSecret(payload: {
    username: string;
    bot_type: string;
    project_id: string;
  }): Observable<any> {
    return this.adminApi.createClientSecret(payload);
  }
}
