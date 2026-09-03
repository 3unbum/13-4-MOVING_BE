export interface FavoriteMoverCard {
  id: number;
  nickName: string;
  bio: string;
  image: string | null;
  avgRating: number;
  reviewCount: number;
  confirmedCount: number;
  favoriteCount: number;
  services: string[];
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
