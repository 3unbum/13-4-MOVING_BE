// 테스트 환경 변수 설정 (env.ts가 required()로 요구하는 값들)
// import 전에 설정해야 env.ts 초기화 시 오류가 나지 않음
process.env.JWT_SECRET = "test-jwt-secret";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret";
process.env.OAUTH_SIGNUP_TOKEN_SECRET = "test-oauth-signup-secret";
process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";

import jwt from "jsonwebtoken";
import jwtUtil from "./jwt.util";

describe("jwt.util", () => {
  describe("createToken / verifyToken (access)", () => {
    it("access 토큰을 생성하고 검증한다", () => {
      const token = jwtUtil.createToken(1, "CUSTOMER", "access");
      const payload = jwtUtil.verifyToken(token, "access");

      expect(payload).toEqual({
        userId: 1,
        role: "CUSTOMER",
      });
    });
  });

  describe("createToken / verifyToken (refresh)", () => {
    it("refresh 토큰을 생성하고 검증한다", () => {
      const token = jwtUtil.createToken(2, "MOVER", "refresh");
      const payload = jwtUtil.verifyToken(token, "refresh");

      expect(payload).toEqual({
        userId: 2,
        role: "MOVER",
      });
    });
  });

  describe("createOAuthSignupToken / verifyOAuthSignupToken", () => {
    it("OAuth 신규가입 토큰을 생성하고 검증한다", () => {
      const payload = {
        provider: "GOOGLE" as const,
        role: "CUSTOMER" as const,
      };

      const token = jwtUtil.createOAuthSignupToken(payload);
      const decoded = jwtUtil.verifyOAuthSignupToken(token);

      expect(decoded).toEqual({
        provider: "GOOGLE",
        role: "CUSTOMER",
      });
    });

    it("만료된 토큰 검증 시 에러를 던진다", () => {
      const payload = {
        provider: "NAVER" as const,
        role: "MOVER" as const,
      };

      // 이미 만료된 토큰을 직접 생성 (expiresIn: -1s)
      const expiredToken = jwt.sign(payload, process.env.OAUTH_SIGNUP_TOKEN_SECRET!, {
        expiresIn: "-1s",
      });

      expect(() => {
        jwtUtil.verifyOAuthSignupToken(expiredToken);
      }).toThrow();
    });

    it("잘못된 payload를 가진 토큰 검증 시 에러를 던진다 (provider 누락)", () => {
      const invalidPayload = {
        role: "CUSTOMER",
        // provider 필드 누락
      };

      const malformedToken = jwt.sign(invalidPayload, process.env.OAUTH_SIGNUP_TOKEN_SECRET!);

      expect(() => {
        jwtUtil.verifyOAuthSignupToken(malformedToken);
      }).toThrow(); // zod parse 실패
    });

    it("잘못된 payload를 가진 토큰 검증 시 에러를 던진다 (role 누락)", () => {
      const invalidPayload = {
        provider: "KAKAO",
        // role 필드 누락
      };

      const malformedToken = jwt.sign(invalidPayload, process.env.OAUTH_SIGNUP_TOKEN_SECRET!);

      expect(() => {
        jwtUtil.verifyOAuthSignupToken(malformedToken);
      }).toThrow(); // zod parse 실패
    });

    it("잘못된 payload를 가진 토큰 검증 시 에러를 던진다 (잘못된 provider 값)", () => {
      const invalidPayload = {
        provider: "INVALID_PROVIDER",
        role: "CUSTOMER",
      };

      const malformedToken = jwt.sign(invalidPayload, process.env.OAUTH_SIGNUP_TOKEN_SECRET!);

      expect(() => {
        jwtUtil.verifyOAuthSignupToken(malformedToken);
      }).toThrow(); // zod enum 검증 실패
    });

    it("잘못된 payload를 가진 토큰 검증 시 에러를 던진다 (잘못된 role 값)", () => {
      const invalidPayload = {
        provider: "GOOGLE",
        role: "INVALID_ROLE",
      };

      const malformedToken = jwt.sign(invalidPayload, process.env.OAUTH_SIGNUP_TOKEN_SECRET!);

      expect(() => {
        jwtUtil.verifyOAuthSignupToken(malformedToken);
      }).toThrow(); // zod enum 검증 실패
    });

    it("모든 provider 값에 대해 정상 동작한다", () => {
      const providers = ["GOOGLE", "NAVER", "KAKAO", "LOCAL"] as const;

      providers.forEach((provider) => {
        const payload = {
          provider,
          role: "CUSTOMER" as const,
        };

        const token = jwtUtil.createOAuthSignupToken(payload);
        const decoded = jwtUtil.verifyOAuthSignupToken(token);

        expect(decoded).toEqual(payload);
      });
    });

    it("모든 role 값에 대해 정상 동작한다", () => {
      const roles = ["CUSTOMER", "MOVER"] as const;

      roles.forEach((role) => {
        const payload = {
          provider: "GOOGLE" as const,
          role,
        };

        const token = jwtUtil.createOAuthSignupToken(payload);
        const decoded = jwtUtil.verifyOAuthSignupToken(token);

        expect(decoded).toEqual(payload);
      });
    });
  });
});
