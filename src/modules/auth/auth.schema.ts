import { z } from "zod";

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const passwordSchema = z
  .string()
  .regex(PASSWORD_RULE, "비밀번호는 8자 이상이며 영문·숫자·특수문자를 포함해야 합니다")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "비밀번호는 72바이트를 초과할 수 없습니다",
  });

export const signupSchema = z.object({
  role: z.enum(["CUSTOMER", "MOVER"]),
  name: z.string().trim().min(1, "이름을 입력해주세요"),
  email: z.email("올바른 이메일 형식이 아닙니다"),
  phoneNumber: z.string().regex(/^01[016789]\d{7,8}$/, "올바른 전화번호 형식이 아닙니다"),
  password: passwordSchema,
});

export const loginSchema = z.object({
  role: z.enum(["CUSTOMER", "MOVER"]),
  email: z.email(),
  password: z.string().min(1),
});

export const checkEmailSchema = z.object({
  role: z.enum(["CUSTOMER", "MOVER"]),
  email: z.email("올바른 이메일 형식이 아닙니다"),
});

export const findEmailSchema = z.object({
  role: z.enum(["CUSTOMER", "MOVER"]),
  name: z.string().trim().min(1, "이름을 입력해주세요"),
  phoneNumber: z.string().regex(/^01[016789]\d{7,8}$/, "올바른 전화번호 형식이 아닙니다"),
});

export const sendResetCodeSchema = checkEmailSchema;

export const verifyResetCodeSchema = checkEmailSchema.extend({
  code: z.string().regex(/^\d{6}$/, "인증번호 6자리를 입력해주세요"),
});

export const resetPasswordSchema = z.object({
  newPassword: passwordSchema,
});

export const oauthProviderParamSchema = z.object({
  provider: z.enum(["google", "kakao", "naver"]),
});

export const oauthLoginSchema = z.object({
  code: z.string().min(1, "code가 필요합니다"),
  redirectUri: z.string().min(1, "redirectUri가 필요합니다"),
  role: z.enum(["CUSTOMER", "MOVER"]),
});

export const oauthSignupSchema = z.object({
  phoneNumber: z.string().regex(/^01[016789]\d{7,8}$/, "올바른 전화번호 형식이 아닙니다"),
});

export type SignupDto = z.infer<typeof signupSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type CheckEmailDto = z.infer<typeof checkEmailSchema>;
export type FindEmailDto = z.infer<typeof findEmailSchema>;
export type SendResetCodeDto = z.infer<typeof sendResetCodeSchema>;
export type VerifyResetCodeDto = z.infer<typeof verifyResetCodeSchema>;
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
export type OAuthProviderParam = z.infer<typeof oauthProviderParamSchema>;
export type OAuthLoginDto = z.infer<typeof oauthLoginSchema>;
export type OAuthSignupDto = z.infer<typeof oauthSignupSchema>;
