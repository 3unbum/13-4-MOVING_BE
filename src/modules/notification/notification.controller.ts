import type { RequestHandler } from "express";
import { AppError } from "../../common/errors/AppError";
import { addListener } from "./notification.hub";
import { notificationService } from "./notification.service";
import type {
  BulkDeleteNotificationsDto,
  ListNotificationsQuery,
  NotificationIdParam,
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
        req.query as unknown as ListNotificationsQuery
      );
      res.json(result);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  read: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as NotificationIdParam;
      const data = await notificationService.read(getUserId(req), id);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  readAll: (async (req, res, next) => {
    try {
      const data = await notificationService.readAll(getUserId(req));
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  delete: (async (req, res, next) => {
    try {
      const { id } = req.params as unknown as NotificationIdParam;
      const data = await notificationService.delete(getUserId(req), id);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  bulkDelete: (async (req, res, next) => {
    try {
      const { ids } = req.body as BulkDeleteNotificationsDto;
      const data = await notificationService.bulkDelete(getUserId(req), ids);
      res.json({ data });
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,

  stream: ((req, res, next) => {
    try {
      const userId = getUserId(req);
      req.socket.setTimeout(0);
      addListener(userId, res);
    } catch (error) {
      next(error);
    }
  }) as RequestHandler,
};
