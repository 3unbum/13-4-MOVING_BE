import { Router } from "express";
import { optionalAuth } from "@/common/middlewares/auth";
import { validate } from "@/common/middlewares/validate";
import { moverController } from "./mover.controller";
import { moverIdParamSchema, moverListQuerySchema } from "./mover.schema";

const router = Router();

router.get("/", validate(moverListQuerySchema, "query"), moverController.list);
router.get("/:id", validate(moverIdParamSchema, "params"), optionalAuth, moverController.getById);

export default router;
