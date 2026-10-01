export interface FavoriteMoverCard {
  id: number;
  nickName: string;
  bio: string;
  image: string | null;
  career: number;
  avgRating: number;
  reviewCount: number;
  confirmedCount: number;
  favoriteCount: number;
  /** 기사님 목록과 같은 한글 라벨 */
  services: string[];
  /** 기사님 목록과 같은 한글 라벨 */
  regions: string[];
}

export interface FavoriteListResult {
  items: FavoriteMoverCard[];
  total: number;
}

export interface BulkDeleteResult {
  deletedCount: number;
  deletedMoverIds: number[];
}
