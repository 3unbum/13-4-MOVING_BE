import { Router } from "express";
import { requireAuth } from "@/common/middlewares/auth";
import { requireProfile } from "@/common/middlewares/profile";
import { requireRole } from "@/common/middlewares/role";
import { validate } from "@/common/middlewares/validate";
import { quotationRequestController } from "@/modules/quotation-request/quotation-request.controller";
import { quotationRequestCreateSchema } from "@/modules/quotation-request/quotation-request.schema";

const router = Router();

// 견적 요청 생성 - (CUSTOMER, 프로필 등록 필수)
router.post(
  "/",
  requireAuth,
  requireRole("CUSTOMER"),
  requireProfile,
  validate(quotationRequestCreateSchema),
  quotationRequestController.create
);

// 활성 요청 조회 - 없으면 null
router.get(
  "/",
  requireAuth,
  requireRole("CUSTOMER"),
  requireProfile,
  quotationRequestController.findActive
);

export default router;
