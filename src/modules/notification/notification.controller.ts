import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { notificationService } from "./notification.service";
import { openStream } from "./notification.sse";
import type {
  BulkDeleteNotificationsDto,
  NotificationIdParam,
  NotificationListQuery,
} from "./notification.schema";

function getUserId(req: { user?: { id: number } }) {
  if (!req.user) {
    throw AppError.unauthorized();
  }
  return req.user.id;
}

export const notificationController = {
  list: (async (req, res, next) => {
    try {
      const result = await notificationService.list(
        getUserId(req),
        req.query as unknown as NotificationListQuery
      );
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  /**
   * SSE 스트림. 응답을 끝내지 않고 열어두므로 res.json을 부르지 않습니다.
   * 쿠키 인증이라 브라우저는 EventSource(url, { withCredentials: true })로 붙습니다.
   */
  stream: ((req, res, next) => {
    try {
      // Node 기본 소켓 타임아웃(약 5분)이 열린 SSE를 끊지 않게 합니다.
      req.socket?.setTimeout(0);
      const close = openStream(getUserId(req), res);
      // 탭을 닫거나 네트워크가 끊기면 close 이벤트가 옵니다. 안 정리하면 heartbeat가 계속 돕니다.
      req.on("close", close);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  summary: (async (req, res, next) => {
    try {
      const result = await notificationService.summarize(getUserId(req));
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  read: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as NotificationIdParam;
      const result = await notificationService.markRead(getUserId(req), id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  readAll: (async (req, res, next) => {
    try {
      const result = await notificationService.markAllRead(getUserId(req));
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  remove: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as NotificationIdParam;
      const result = await notificationService.delete(getUserId(req), id);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  bulkRemove: (async (req, res, next) => {
    try {
      const { ids } = req.body as BulkDeleteNotificationsDto;
      const result = await notificationService.bulkDelete(getUserId(req), ids);
      res.json({ data: result });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
