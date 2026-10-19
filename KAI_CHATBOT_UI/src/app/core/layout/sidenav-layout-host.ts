/** Active routed page registers this so `AppComponent` can bind the shared sidenav once. */
export interface SidenavLayoutHost {
  readonly generatingStates: { [key: string]: boolean };
  getStreaming(): boolean;
  handleStreamingToggle(next: boolean): void;
  readonly emitActiveChatOnInit: boolean;
  readonly staticMode: boolean;
  onNewChat(): void;
  onChatSelected(chat: unknown): void;
  onSearchModalToggle(open: boolean): void;
  onContextMenuToggled(): void;
  onInvalidConversation(): void;
}
