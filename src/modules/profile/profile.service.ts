import type { ProfileImageUploadResult } from "./profile.type";

export const profileService = {
  buildImageUploadResult(file: Express.MulterS3.File): ProfileImageUploadResult {
    return { imageUrl: file.location };
  },
};
