import type { RequestHandler } from "express";
import { env } from "../../config/env";
import { AppError } from "../errors/AppError";
import { ERROR_CODES } from "../errors/errorCodes";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const TIMEOUT_MS = 5000;

/**
 * Cloudflare Turnstile 토큰을 서버에서 검증합니다 (body.turnstileToken).
 *
 * - `TURNSTILE_SECRET_KEY`가 비어 있으면 검증을 건너뜁니다 (로컬·CI).
 * - Cloudflare가 응답하지 않아도 통과시키지 않습니다(fail-closed) — 로그인 보호가 목적이라서입니다.
 * - 토큰은 1회용입니다. 같은 토큰을 다시 보내면 실패하니 FE가 위젯을 reset해야 합니다.
 */
export const verifyTurnstile: RequestHandler = async (req, _res, next) => {
  if (!env.TURNSTILE_SECRET_KEY) {
    next();
    return;
  }

  const fail = () =>
    next(
      AppError.badRequest(ERROR_CODES.BOT_CHECK_FAILED, "봇 검증에 실패했습니다. 다시 시도해주세요")
    );

  const token = req.body?.turnstileToken;
  if (typeof token !== "string" || token === "") {
    fail();
    return;
  }

  try {
    const response = await fetch(SITEVERIFY_URL, {
      method: "POST",
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const result = (await response.json()) as { success?: boolean };
    if (result.success) {
      next();
      return;
    }
  } catch {
    // 네트워크 오류·타임아웃·JSON 파싱 실패 모두 검증 실패로 취급합니다
  }
  fail();
};
