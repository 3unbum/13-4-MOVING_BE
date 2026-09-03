import { Router } from "express";
import estimateRouter from "../modules/estimate/estimate.route";
import favoriteRouter from "../modules/favorite/favorite.route";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ data: { status: "ok" } });
});

// 각 모듈의 route를 여기에 등록합니다.
// router.use("/auth", authRouter);
// router.use("/profiles", profileRouter);
// router.use("/quotation-requests", quotationRequestRouter);
// estimate.route.ts 안에 /estimates, /mover, /requests 경로가 섞여있어 prefix 없이 마운트
router.use(estimateRouter);
// router.use("/movers", moverRouter);
// router.use("/reviews", reviewRouter);
router.use("/favorites", favoriteRouter);
// router.use("/notifications", notificationRouter);

export default router;
