import type { QuotationRequestCreateDto } from "./quotation-request.schema";

/** 출발지 /도착지 공용. schema의 addressSchema에서 파생됩니다 */
export type AddressInput = QuotationRequestCreateDto["from"];

/** service -> repository로 넘길 입력. HTTP DTO에 인증된 userId를 더합니다. */
export type QuotationRequestCreateInput = QuotationRequestCreateDto & { userId: number };
