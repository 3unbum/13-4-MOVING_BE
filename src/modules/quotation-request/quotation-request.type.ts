import type { RegionType, ServiceType } from "../../../generated/prisma/enums";

// 출발지 /도착지 공용
export interface AddressInput {
  postalCode: string;
  region: RegionType;
  address: string;
  detailAddress: string;
}

// service -> repository로 넘길 것
export interface QuotationRequestCreateInput {
  userId: number;
  category: ServiceType;
  movingDate: Date;
  from: AddressInput;
  to: AddressInput;
}
