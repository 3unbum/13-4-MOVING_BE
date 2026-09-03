import { Router } from "express";
import { requireAuth } from "../../common/middlewares/auth";
import { requireRole } from "../../common/middlewares/role";
import { validate } from "../../common/middlewares/validate";
import { favoriteController } from "./favorite.controller";
import {
  bulkDeleteFavoritesSchema,
  createFavoriteSchema,
  listFavoritesQuerySchema,
} from "./favorite.schema";

const router = Router();

router.use(requireAuth, requireRole("CUSTOMER"));

router.get("/", validate(listFavoritesQuerySchema, "query"), favoriteController.list);
router.post("/", validate(createFavoriteSchema), favoriteController.create);
router.delete("/", validate(bulkDeleteFavoritesSchema), favoriteController.bulkDelete);

export default router;
