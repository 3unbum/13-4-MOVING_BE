import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { requireRole } from "../../common/middlewares/role";
import { validate } from "../../common/middlewares/validate";
import { reviewController } from "./review.controller";
import { confirmReviewSchema, reviewIdParamSchema, reviewListQuerySchema } from "./review.schema";

const router = Router();

router.get(
  "/reviews/writable",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(reviewListQuerySchema, "query"),
  reviewController.listWritable
);

router.get(
  "/reviews/my",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(reviewListQuerySchema, "query"),
  reviewController.listWritten
);

router.patch(
  "/reviews/:id",
  requireAuth,
  requireRole("CUSTOMER"),
  validate(reviewIdParamSchema, "params"),
  validate(confirmReviewSchema),
  reviewController.confirm
);

router.get(
  "/mover/reviews",
  requireAuth,
  requireRole("MOVER"),
  validate(reviewListQuerySchema, "query"),
  reviewController.listReceived
);

export default router;
