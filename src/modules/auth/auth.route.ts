import { Router } from "express";
import { validate } from "../../common/middlewares/validate";
import { signupSchema, loginSchema } from "./auth.schema";
import { authController } from "./auth.controller";

const router = Router();

router.post("/signup", validate(signupSchema), authController.signup);
router.post("/login", validate(loginSchema), authController.login);
router.post("/logout", authController.logout);
router.post("/refresh", authController.refresh);

export default router;
