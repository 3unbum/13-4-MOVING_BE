/** 방 목록 한 줄 — 상대방 프로필·마지막 메시지·안 읽은 수를 한 번에 내려줍니다 */
export interface ChatRoomItem {
  id: number;
  estimateId: number;
  counterpart: { id: number; name: string; image: string | null };
  lastMessage: {
    id: number;
    content: string;
    imageUrl: string | null;
    senderId: number;
    createdAt: Date;
  } | null;
  lastMessageAt: Date;
  unreadCount: number;
  /** 이사 완료 후 14일이 지나 새 메시지를 보낼 수 없는 방 (대화 열람은 가능) */
  isClosed: boolean;
}

export interface ChatRoomListResult {
  items: ChatRoomItem[];
  nextCursor: number | null;
}

export interface ChatMessageItem {
  id: number;
  roomId: number;
  senderId: number;
  /** 사진만 보낸 메시지는 빈 문자열 */
  content: string;
  imageUrl: string | null;
  createdAt: Date;
}

/** items는 최신순입니다. 화면에 그릴 때 뒤집으세요 */
export interface ChatMessageListResult {
  items: ChatMessageItem[];
  nextCursor: number | null;
  /** 상대가 읽은 마지막 메시지 id — 내 메시지 중 이 id 이하는 "읽음"으로 표시합니다 */
  counterpartLastReadId: number | null;
  /** true면 입력창을 막으세요. 전송하면 403 CHAT_ROOM_CLOSED */
  isClosed: boolean;
}
