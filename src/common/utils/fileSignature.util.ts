// 클라이언트가 보낸 mimetype/파일명은 신뢰하지 않고 실제 바이트로 검증

export type DetectedImageType = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
};

type ImageSignature = DetectedImageType & {
  matches: (buffer: Buffer) => boolean;
};

const IMAGE_SIGNATURES: ImageSignature[] = [
  {
    mimeType: "image/jpeg",
    extension: "jpg",
    matches: (buffer) =>
      buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff,
  },
  {
    mimeType: "image/png",
    extension: "png",
    matches: (buffer) =>
      buffer.length >= 8 &&
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a,
  },
  {
    mimeType: "image/webp",
    extension: "webp",
    matches: (buffer) =>
      buffer.length >= 12 &&
      buffer.toString("ascii", 0, 4) === "RIFF" &&
      buffer.toString("ascii", 8, 12) === "WEBP",
  },
];

/** 매직 넘버가 허용된 이미지 형식(jpeg/png/webp) 중 하나와 일치하면 그 정보를, 아니면 null을 반환합니다. */
export function detectImageType(buffer: Buffer): DetectedImageType | null {
  const matched = IMAGE_SIGNATURES.find((signature) => signature.matches(buffer));
  if (!matched) return null;
  return { mimeType: matched.mimeType, extension: matched.extension };
}
