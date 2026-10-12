-- 지정 견적 반려 알림 (기사님이 지정 견적을 반려 → 요청한 고객).
-- #150에서 schema.prisma에만 값이 추가되고 마이그레이션이 빠져 있어 뒤늦게 채웁니다.
-- ADD VALUE와 같은 트랜잭션에서는 새 enum 리터럴을 쓸 수 없어, 이 마이그레이션에서는 값을 쓰지 않습니다.
ALTER TYPE "notification_type" ADD VALUE 'ESTIMATE_REJECTED';
