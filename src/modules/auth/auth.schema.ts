import { z } from "zod";

const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export const signupSchema = z.object({
  role: z.enum(["CUSTOMER", "MOVER"]),
  name: z.string().min(1, "이름을 입력해주세요"),
  email: z.email("올바른 이메일 형식이 아닙니다"),
  phoneNumber: z.string().regex(/^01[016789]\d{7,8}$/, "올바른 전화번호 형식이 아닙니다"),
  password: z
    .string()
    .regex(PASSWORD_RULE, "비밀번호는 8자 이상이며 영문·숫자·특수문자를 포함해야 합니다")
    .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
      message: "비밀번호는 72바이트를 초과할 수 없습니다",
    }),
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

export type SignupDto = z.infer<typeof signupSchema>;
export type LoginDto = z.infer<typeof loginSchema>;
export type CheckEmailDto = z.infer<typeof checkEmailSchema>;
