import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { notificationService } from "./notification.service";
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
