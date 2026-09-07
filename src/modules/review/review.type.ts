export interface ReviewMoverSummary {
  id: number;
  nickName: string;
  image: string | null;
}

export interface ReviewMovingInfo {
  movingDate: Date;
  fromAddress: string;
  toAddress: string;
  category: string;
}

export interface WritableReviewItem {
  id: number;
  mover: ReviewMoverSummary;
  moving: ReviewMovingInfo;
}

export interface WrittenReviewItem {
  id: number;
  rating: number;
  comment: string;
  mover: ReviewMoverSummary;
  moving: ReviewMovingInfo;
  createdAt: Date;
}

export interface ReceivedReviewItem {
  id: number;
  rating: number;
  comment: string;
  createdAt: Date;
}

export interface ReviewListResult<T> {
  items: T[];
  nextCursor: number | null;
}

export interface ConfirmReviewResult {
  id: number;
  rating: number;
  comment: string;
  avgRating: number;
  reviewCount: number;
}
