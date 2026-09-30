import nodemailer from "nodemailer";
import { env } from "./env";

export const mailer = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

export const MAIL_FROM = `"무빙" <${env.SMTP_USER}>`;
