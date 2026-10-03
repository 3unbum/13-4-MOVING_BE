import { AppError } from "../../common/errors/AppError";
import { ERROR_CODES } from "../../common/errors/errorCodes";
import { detectImageType } from "../../common/utils/fileSignature.util";
import { publishEvent, publishNotification } from "../notification/notification.sse";
import { chatMessageRepository, chatRepository, isRoomClosed } from "./chat.repository";
import { uploadChatImage } from "./chat.storage";
import type { ChatMessageListQuery, ChatRoomListQuery, SendChatMessageDto } from "./chat.schema";
import type { ChatMessageListResult, ChatRoomItem, ChatRoomListResult } from "./chat.type";

const DEFAULT_TAKE = 10;

type Role = "CUSTOMER" | "MOVER";
type RoomRow = Awaited<ReturnType<typeof chatRepository.findRoomsByUser>>[number];

/** 기사님은 닉네임, 없으면 이름 / 고객은 이름 */
function toCounterpart(row: RoomRow, role: Role): ChatRoomItem["counterpart"] {
  if (role === "CUSTOMER") {
    const mover = row.mover;
    return {
      id: mover.id,
      name: mover.moverProfile?.nickName.trim() || mover.name,
      image: mover.moverProfile?.image ?? null,
    };
  }
  return {
    id: row.customer.id,
    name: row.customer.name,
    image: row.customer.customerProfile?.image ?? null,
  };
}

export const chatService = {
  async listRooms(
    userId: number,
    role: Role,
    query: ChatRoomListQuery
  ): Promise<ChatRoomListResult> {
    const take = query.take ?? DEFAULT_TAKE;
    const rows = await chatRepository.findRoomsByUser(userId, role, query.cursor, take);
    const hasNext = rows.length > take;
    const page = hasNext ? rows.slice(0, take) : rows;

    // 방마다 읽음 위치(고객은 customerLastReadId, 기사님은 moverLastReadId)가 달라 함께 넘겨 한 번에 셉니다
    const unreadByRoom = await chatRepository.countUnreadByRoom(
      userId,
      page.map((row) => ({
        id: row.id,
        lastReadId: role === "CUSTOMER" ? row.customerLastReadId : row.moverLastReadId,
      }))
    );

    const items = page.map((row) => ({
      id: row.id,
      estimateId: row.estimateId,
      counterpart: toCounterpart(row, role),
      lastMessage: row.messages[0] ?? null,
      lastMessageAt: row.lastMessageAt,
      unreadCount: unreadByRoom.get(row.id) ?? 0,
      isClosed: isRoomClosed(row.estimate),
    }));

    return { items, nextCursor: hasNext ? page[page.length - 1].id : null };
  },
};

const MESSAGE_TAKE = 30;

/** 방의 상대방 — 메시지 알림을 받는 사람입니다 */
function counterpartOf(room: { customerId: number; moverId: number }, userId: number) {
  return room.customerId === userId ? room.moverId : room.customerId;
}

/**
 * 커밋이 끝난 뒤에만 신호를 보냅니다. 본문은 싣지 않고 FE가 목록을 다시 받아갑니다.
 * chat 이벤트는 양쪽(다른 탭 반영 포함), notification 이벤트는 알림이 생긴 받는 사람에게만 갑니다.
 */
function publishMessageSignals(
  room: { id: number; customerId: number; moverId: number },
  recipientId: number,
  messageId: number
) {
  publishEvent([room.customerId, room.moverId], "chat", {
    type: "MESSAGE",
    roomId: room.id,
    messageId,
  });
  publishNotification([recipientId], { type: "NEW_CHAT_MESSAGE" });
}

/** 닫힌 방은 지난 대화만 볼 수 있습니다. 전송은 막습니다(사진 업로드도 업로드 전에 막습니다) */
function assertOpen(room: { estimate: { estimateStatus: string; updatedAt: Date } }) {
  if (isRoomClosed(room.estimate)) {
    throw new AppError(
      403,
      ERROR_CODES.CHAT_ROOM_CLOSED,
      "이사가 완료되고 14일 이후 메시지를 전송할 수 없습니다."
    );
  }
}

/** 방 안에서의 내 역할은 JWT role이 아니라 방 소속으로 정합니다 */
async function requireRoom(roomId: number, userId: number) {
  const room = await chatMessageRepository.findRoomForUser(roomId, userId);
  if (!room) throw AppError.notFound("채팅방을 찾을 수 없습니다");
  return { room, role: (room.customerId === userId ? "CUSTOMER" : "MOVER") as Role };
}

export const chatMessageService = {
  async listMessages(
    roomId: number,
    userId: number,
    query: ChatMessageListQuery
  ): Promise<ChatMessageListResult> {
    const { room, role } = await requireRoom(roomId, userId);
    const take = query.take ?? MESSAGE_TAKE;
    const rows = await chatMessageRepository.findMessages(roomId, query.cursor, take);
    const hasNext = rows.length > take;
    const items = hasNext ? rows.slice(0, take) : rows;

    return {
      items,
      nextCursor: hasNext ? items[items.length - 1].id : null,
      counterpartLastReadId: role === "CUSTOMER" ? room.moverLastReadId : room.customerLastReadId,
      isClosed: isRoomClosed(room.estimate),
    };
  },

  async sendMessage(roomId: number, userId: number, dto: SendChatMessageDto) {
    const { room } = await requireRoom(roomId, userId);
    assertOpen(room);
    const recipientId = counterpartOf(room, userId);
    const message = await chatMessageRepository.createMessage(
      roomId,
      userId,
      recipientId,
      dto.content
    );
    publishMessageSignals(room, recipientId, message.id);
    return message;
  },

  /** 사진 한 장을 올리고 사진 메시지로 저장합니다. 방 소속부터 확인해 참여자가 아니면 업로드하지 않습니다 */
  async sendImage(roomId: number, userId: number, file: Buffer | undefined) {
    const { room } = await requireRoom(roomId, userId);
    assertOpen(room);
    const recipientId = counterpartOf(room, userId);
    if (!file) {
      throw AppError.badRequest(ERROR_CODES.VALIDATION_ERROR, "이미지 파일이 필요합니다.");
    }
    // 클라이언트가 보낸 mimetype/파일명은 신뢰하지 않고 실제 바이트로 형식을 재검증합니다
    const detected = detectImageType(file);
    if (!detected) {
      throw AppError.badRequest(
        ERROR_CODES.VALIDATION_ERROR,
        "지원하지 않는 이미지 형식입니다. (jpeg, png, webp만 가능)"
      );
    }
    const imageUrl = await uploadChatImage(roomId, file, detected);
    const message = await chatMessageRepository.createMessage(
      roomId,
      userId,
      recipientId,
      "",
      imageUrl
    );
    publishMessageSignals(room, recipientId, message.id);
    return message;
  },

  async markRead(roomId: number, userId: number) {
    const { room, role } = await requireRoom(roomId, userId);
    const { lastReadId, updated } = await chatMessageRepository.markRead(roomId, role, userId);
    if (updated) {
      const counterpartId = role === "CUSTOMER" ? room.moverId : room.customerId;
      publishEvent([counterpartId], "chat", { type: "READ", roomId });
    }
    return { lastReadId };
  },
};
