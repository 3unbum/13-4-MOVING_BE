import { z } from "zod";
import { RegionType, ServiceType } from "../../../generated/prisma/enums";

const PHONE_RULE = /^01[016789]\d{7,8}$/;
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

const newPasswordField = z
  .string()
  .regex(PASSWORD_RULE, "비밀번호는 8자 이상이며 영문·숫자·특수문자를 포함해야 합니다")
  .refine((password) => Buffer.byteLength(password, "utf8") <= 72, {
    message: "비밀번호는 72바이트를 초과할 수 없습니다",
  });

export const customerProfileCreateSchema = z.object({
  image: z.string().optional(),
  region: z.enum(RegionType),
  services: z
    .array(z.enum(ServiceType))
    .min(1, "서비스를 1개 이상 선택해주세요")
    .refine((arr) => new Set(arr).size === arr.length, "중복된 서비스가 있습니다"),
});

export const moverProfileCreateSchema = z.object({
  image: z.string().optional(),
  nickName: z.string().min(1, "닉네임을 입력해주세요"),
  career: z.number().int().min(0, "경력은 0 이상이어야 합니다"),
  bio: z.string().min(1, "한 줄 소개를 입력해주세요"),
  description: z.string().min(1, "상세 설명을 입력해주세요"),
  services: z
    .array(z.enum(ServiceType))
    .min(1, "제공 서비스를 1개 이상 선택해주세요")
    .refine((arr) => new Set(arr).size === arr.length, "중복된 서비스가 있습니다"),
  regions: z
    .array(z.enum(RegionType))
    .min(1, "서비스 가능 지역을 1개 이상 선택해주세요")
    .refine((arr) => new Set(arr).size === arr.length, "중복된 지역이 있습니다"),
});

export const customerProfileUpdateSchema = z
  .object({
    name: z.string().min(1, "이름을 입력해주세요").optional(),
    phoneNumber: z.string().regex(PHONE_RULE, "올바른 전화번호 형식이 아닙니다").optional(),
    currentPassword: z.string().optional(),
    newPassword: newPasswordField.optional(),
    image: z.string().optional(),
    region: z.enum(RegionType).optional(),
    services: z
      .array(z.enum(ServiceType))
      .min(1, "서비스를 1개 이상 선택해주세요")
      .refine((arr) => new Set(arr).size === arr.length, "중복된 서비스가 있습니다")
      .optional(),
  })
  .refine((data) => !data.newPassword || !!data.currentPassword, {
    message: "새 비밀번호를 변경하려면 현재 비밀번호가 필요합니다",
    path: ["currentPassword"],
  });

export const moverProfileUpdateSchema = z
  .object({
    name: z.string().min(1, "이름을 입력해주세요").optional(),
    phoneNumber: z.string().regex(PHONE_RULE, "올바른 전화번호 형식이 아닙니다").optional(),
    currentPassword: z.string().optional(),
    newPassword: newPasswordField.optional(),
    image: z.string().optional(),
    nickName: z.string().min(1, "닉네임을 입력해주세요").optional(),
    career: z.number().int().min(0, "경력은 0 이상이어야 합니다").optional(),
    bio: z.string().min(1, "한 줄 소개를 입력해주세요").optional(),
    description: z.string().min(1, "상세 설명을 입력해주세요").optional(),
    // avgRating은 의도적으로 스키마에 없음 — 리뷰 작성 시 서버가 재계산하므로 이 API로 수정 불가
    services: z
      .array(z.enum(ServiceType))
      .min(1, "제공 서비스를 1개 이상 선택해주세요")
      .refine((arr) => new Set(arr).size === arr.length, "중복된 서비스가 있습니다")
      .optional(),
    regions: z
      .array(z.enum(RegionType))
      .min(1, "서비스 가능 지역을 1개 이상 선택해주세요")
      .refine((arr) => new Set(arr).size === arr.length, "중복된 지역이 있습니다")
      .optional(),
  })
  .refine((data) => !data.newPassword || !!data.currentPassword, {
    message: "새 비밀번호를 변경하려면 현재 비밀번호가 필요합니다",
    path: ["currentPassword"],
  });

export type CustomerProfileCreateDto = z.infer<typeof customerProfileCreateSchema>;
export type MoverProfileCreateDto = z.infer<typeof moverProfileCreateSchema>;
export type CustomerProfileUpdateDto = z.infer<typeof customerProfileUpdateSchema>;
export type MoverProfileUpdateDto = z.infer<typeof moverProfileUpdateSchema>;
