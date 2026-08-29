import { Router } from "express";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ data: { status: "ok" } });
});

// 각 모듈의 route를 여기에 등록합니다.
// router.use("/auth", authRouter);
// router.use("/users", userRouter);
// router.use("/profiles", profileRouter);
// router.use("/quotation-requests", quotationRequestRouter);
// router.use("/estimates", estimateRouter);
// router.use("/movers", moverRouter);
// router.use("/reviews", reviewRouter);
// router.use("/favorites", favoriteRouter);
// router.use("/notifications", notificationRouter);

export default router;
