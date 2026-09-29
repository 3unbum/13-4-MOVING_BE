import nodemailer from "nodemailer";
import { env } from "./env";

/**
 * Gmail SMTP 발송기. 발송량이 늘거나 스팸함 문제가 생기면 Resend 등으로 교체할 수 있도록
 * 발송 설정은 이 파일에만 둡니다.
 */
export const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

/** 받는 사람 메일함에는 주소 대신 "무빙"으로 표시됩니다. */
export const MAIL_FROM = `"무빙" <${env.SMTP_USER}>`;
