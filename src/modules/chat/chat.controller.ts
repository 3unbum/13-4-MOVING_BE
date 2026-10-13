import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { chatMessageService, chatService } from "./chat.service";
import type {
  ChatMessageListQuery,
  ChatRoomIdParam,
  ChatRoomListQuery,
  SendChatMessageDto,
} from "./chat.schema";

function getUser(req: { user?: { id: number; role: "CUSTOMER" | "MOVER" } }) {
  if (!req.user) throw AppError.unauthorized();
  return req.user;
}

const roomId = (req: { params: unknown }) => (req.params as unknown as ChatRoomIdParam).id;

export const chatController = {
  listRooms: (async (req, res, next) => {
    try {
      const user = getUser(req);
      const result = await chatService.listRooms(
        user.id,
        user.role,
        req.query as unknown as ChatRoomListQuery
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  listMessages: (async (req, res, next) => {
    try {
      const result = await chatMessageService.listMessages(
        roomId(req),
        getUser(req).id,
        req.query as unknown as ChatMessageListQuery
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  sendMessage: (async (req, res, next) => {
    try {
      const result = await chatMessageService.sendMessage(
        roomId(req),
        getUser(req).id,
        req.body as SendChatMessageDto
      );
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  sendImage: (async (req, res, next) => {
    try {
      const result = await chatMessageService.sendImage(
        roomId(req),
        getUser(req).id,
        req.file?.buffer
      );
      res.status(201).json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  markRead: (async (req, res, next) => {
    try {
      const result = await chatMessageService.markRead(roomId(req), getUser(req).id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
