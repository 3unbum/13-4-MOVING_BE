import { z } from "zod";
import { RegionType, ServiceType } from "../../../generated/prisma/enums";

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

export type CustomerProfileCreateDto = z.infer<typeof customerProfileCreateSchema>;
export type MoverProfileCreateDto = z.infer<typeof moverProfileCreateSchema>;
