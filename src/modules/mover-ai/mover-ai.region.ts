import type { RegionType } from "../../../generated/prisma/enums.ts";

export interface MoverAiRegionOption {
  label: string;
  region: RegionType;
}

export interface MoverAiRegionClarify {
  query: string;
  options: MoverAiRegionOption[];
}

export type RegionResolveResult =
  | { type: "resolved"; region: RegionType }
  | { type: "ambiguous"; clarify: MoverAiRegionClarify }
  | { type: "none" };

type AmbiguousPlace = {
  /** 메시지에 이 표기가 있으면 중의 후보 (긴 키를 앞에 둘 것) */
  keys: string[];
  /** 구체적 표기가 있으면 해당 광역으로 확정 */
  resolve: Array<{ pattern: RegExp; region: RegionType }>;
  options: MoverAiRegionOption[];
};

/**
 * 동일·유사 지명이 서로 다른 RegionType에 있는 경우.
 * 단독 키워드만 있으면 CLARIFY_REGION으로 되묻고, 추측으로 enum을 채우지 않습니다.
 *
 * MVP: 사용자가 자주 말할 법한 후보만 수동으로 둔 목록입니다. 전국 법정동을 다 담은 것이 아닙니다.
 * 빠진 지명은 여기 항목을 추가하면 됩니다.
 * 완전에 가깝게 가려면 행정안전부 법정동코드에서 동일 지명을 RegionType별로 묶어 인덱스를 만드는 편이 맞습니다.
 */
const AMBIGUOUS_PLACES: AmbiguousPlace[] = [
  {
    keys: ["구미"],
    resolve: [
      { pattern: /성남.*구미|구미동|분당.*구미/, region: "GYEONGGI" },
      { pattern: /경북.*구미|경상북도.*구미|구미시/, region: "GYEONGBUK" },
    ],
    options: [
      { label: "경상북도 구미시", region: "GYEONGBUK" },
      { label: "경기도 성남시 구미동", region: "GYEONGGI" },
    ],
  },
  {
    keys: ["죽전"],
    resolve: [
      { pattern: /용인.*죽전|수지.*죽전|경기.*죽전|죽전.*용인|죽전.*수지/, region: "GYEONGGI" },
      { pattern: /대구.*죽전|달서.*죽전|죽전.*대구/, region: "DAEGU" },
      {
        pattern: /(경북|경상북도|안동|칠곡|성주|영천|경주).*죽전|죽전.*(경북|경상북도)/,
        region: "GYEONGBUK",
      },
      {
        pattern: /(경남|경상남도|남해|의령|합천).*죽전|죽전.*(경남|경상남도)/,
        region: "GYEONGNAM",
      },
      { pattern: /(충북|충청북도|보은|청주).*죽전|죽전.*(충북|충청북도)/, region: "CHUNGBUK" },
      { pattern: /(충남|충청남도|홍성).*죽전|죽전.*(충남|충청남도)/, region: "CHUNGNAM" },
      { pattern: /(전북|전라북도|순창).*죽전|죽전.*(전북|전라북도)/, region: "JEONBUK" },
    ],
    options: [
      { label: "경기도 용인시 수지구 죽전동", region: "GYEONGGI" },
      { label: "대구광역시 달서구 죽전동", region: "DAEGU" },
      { label: "경상북도 안동·칠곡·성주·영천·경주 죽전리", region: "GYEONGBUK" },
      { label: "경상남도 남해·의령·합천 죽전리", region: "GYEONGNAM" },
      { label: "충청북도 보은·영동·청주 죽전리", region: "CHUNGBUK" },
      { label: "충청남도 홍성군 죽전리", region: "CHUNGNAM" },
      { label: "전북특별자치도 순창군 죽전리", region: "JEONBUK" },
    ],
  },
  {
    keys: ["광주"],
    resolve: [
      { pattern: /광주광역시|광주광역/, region: "GWANGJU" },
      { pattern: /경기광주|경기도광주|경기.*광주|경기도.*광주|광주.*경기/, region: "GYEONGGI" },
    ],
    options: [
      { label: "광주광역시", region: "GWANGJU" },
      { label: "경기도 광주시", region: "GYEONGGI" },
    ],
  },
  {
    keys: ["고성"],
    resolve: [
      { pattern: /강원.*고성|강원도.*고성|고성군.*강원/, region: "GANGWON" },
      { pattern: /경남.*고성|경상남도.*고성|고성군.*경남/, region: "GYEONGNAM" },
    ],
    options: [
      { label: "강원특별자치도 고성군", region: "GANGWON" },
      { label: "경상남도 고성군", region: "GYEONGNAM" },
    ],
  },
  {
    keys: ["신정"],
    resolve: [
      { pattern: /양천.*신정|서울.*신정|신정.*서울|목동.*신정/, region: "SEOUL" },
      { pattern: /울산.*신정|남구.*신정|신정.*울산/, region: "ULSAN" },
    ],
    options: [
      { label: "서울특별시 양천구 신정동", region: "SEOUL" },
      { label: "울산광역시 남구 신정동", region: "ULSAN" },
    ],
  },
  {
    keys: ["송정"],
    resolve: [
      { pattern: /서울.*송정|성동.*송정|송정.*서울/, region: "SEOUL" },
      { pattern: /부산.*송정|해운대.*송정|송정.*부산/, region: "BUSAN" },
      { pattern: /광주광역시.*송정|광산.*송정|송정역/, region: "GWANGJU" },
      { pattern: /울산.*송정|송정.*울산/, region: "ULSAN" },
      { pattern: /경기.*송정|광주시.*송정|송정.*경기/, region: "GYEONGGI" },
      { pattern: /(강원|강릉|동해).*송정|송정.*(강원|강릉|동해)/, region: "GANGWON" },
      { pattern: /(충북|청주|흥덕).*송정|송정.*(충북|청주)/, region: "CHUNGBUK" },
      { pattern: /(경북|경상북도|구미).*송정|송정.*(경북|구미)/, region: "GYEONGBUK" },
    ],
    options: [
      { label: "서울특별시 성동구 송정동", region: "SEOUL" },
      { label: "부산광역시 해운대구 송정동", region: "BUSAN" },
      { label: "광주광역시 광산구 송정동", region: "GWANGJU" },
      { label: "울산광역시 북구 송정동", region: "ULSAN" },
      { label: "경기도 광주시 송정동", region: "GYEONGGI" },
      { label: "강원특별자치도 강릉·동해 송정동", region: "GANGWON" },
      { label: "충청북도 청주시 흥덕구 송정동", region: "CHUNGBUK" },
      { label: "경상북도 구미시 송정동", region: "GYEONGBUK" },
    ],
  },
  {
    keys: ["중동"],
    resolve: [
      { pattern: /(경기|부천|수원|용인|화성).*중동|중동.*(경기|부천)/, region: "GYEONGGI" },
      { pattern: /(서울|마포).*중동|중동.*서울/, region: "SEOUL" },
      { pattern: /(부산|해운대).*중동|중동.*부산/, region: "BUSAN" },
      { pattern: /(대구|수성).*중동|중동.*대구/, region: "DAEGU" },
      { pattern: /대전.*중동|중동.*대전/, region: "DAEJEON" },
      { pattern: /(충남|공주).*중동|중동.*(충남|공주)/, region: "CHUNGNAM" },
      { pattern: /(전북|전주|군산).*중동|중동.*(전북|전주|군산)/, region: "JEONBUK" },
      { pattern: /(전남|목포|광양).*중동|중동.*(전남|목포|광양)/, region: "JEONNAM" },
      { pattern: /(경남|창원|의창).*중동|중동.*(경남|창원)/, region: "GYEONGNAM" },
    ],
    options: [
      { label: "경기도 부천·수원·용인·화성 중동", region: "GYEONGGI" },
      { label: "서울특별시 마포구 중동", region: "SEOUL" },
      { label: "부산광역시 해운대구 중동", region: "BUSAN" },
      { label: "대구광역시 수성구 중동", region: "DAEGU" },
      { label: "대전광역시 동구 중동", region: "DAEJEON" },
      { label: "충청남도 공주시 중동", region: "CHUNGNAM" },
      { label: "전북특별자치도 전주·군산 중동", region: "JEONBUK" },
      { label: "전라남도 목포·광양 중동", region: "JEONNAM" },
      { label: "경상남도 창원시 의창구 중동", region: "GYEONGNAM" },
    ],
  },
  {
    keys: ["사직"],
    resolve: [
      { pattern: /(서울|종로).*사직|사직.*서울/, region: "SEOUL" },
      { pattern: /(부산|동래).*사직|사직.*부산|사직구장/, region: "BUSAN" },
      { pattern: /(충북|청주|서원).*사직|사직.*(충북|청주)/, region: "CHUNGBUK" },
      { pattern: /(충남|천안).*사직|사직.*(충남|천안)/, region: "CHUNGNAM" },
    ],
    options: [
      { label: "서울특별시 종로구 사직동", region: "SEOUL" },
      { label: "부산광역시 동래구 사직동", region: "BUSAN" },
      { label: "충청북도 청주시 서원구 사직동", region: "CHUNGBUK" },
      { label: "충청남도 천안시 동남구 사직동", region: "CHUNGNAM" },
    ],
  },
  {
    keys: ["신촌"],
    resolve: [
      { pattern: /(서울|서대문).*신촌|신촌.*서울|연세대|이대/, region: "SEOUL" },
      {
        pattern: /(경기|성남|수정|안양|동안|파주).*신촌|신촌.*(경기|성남|안양|파주)/,
        region: "GYEONGGI",
      },
      { pattern: /대전.*신촌|신촌.*대전/, region: "DAEJEON" },
      { pattern: /(광주광역시|광산).*신촌/, region: "GWANGJU" },
      { pattern: /(충북|청주|흥덕).*신촌|신촌.*(충북|청주)/, region: "CHUNGBUK" },
      { pattern: /(전북|남원).*신촌|신촌.*(전북|남원)/, region: "JEONBUK" },
      { pattern: /(경남|창원|성산).*신촌|신촌.*(경남|창원)/, region: "GYEONGNAM" },
    ],
    options: [
      { label: "서울특별시 서대문구 신촌동", region: "SEOUL" },
      { label: "경기도 성남·안양·파주 신촌동", region: "GYEONGGI" },
      { label: "대전광역시 동구 신촌동", region: "DAEJEON" },
      { label: "광주광역시 광산구 신촌동", region: "GWANGJU" },
      { label: "충청북도 청주시 흥덕구 신촌동", region: "CHUNGBUK" },
      { label: "전북특별자치도 남원시 신촌동", region: "JEONBUK" },
      { label: "경상남도 창원시 성산구 신촌동", region: "GYEONGNAM" },
    ],
  },
  {
    keys: ["대산"],
    resolve: [
      { pattern: /(충남|서산).*대산|대산.*(충남|서산)|대산읍/, region: "CHUNGNAM" },
      { pattern: /(경남|창원|의창|함안).*대산|대산.*(경남|창원|함안)/, region: "GYEONGNAM" },
      { pattern: /(전북|남원|고창).*대산|대산.*(전북|남원|고창)/, region: "JEONBUK" },
      { pattern: /(광주광역시|광산).*대산/, region: "GWANGJU" },
    ],
    options: [
      { label: "충청남도 서산시 대산읍", region: "CHUNGNAM" },
      { label: "경상남도 창원·함안 대산면", region: "GYEONGNAM" },
      { label: "전북특별자치도 남원·고창 대산면", region: "JEONBUK" },
      { label: "광주광역시 광산구 대산동", region: "GWANGJU" },
    ],
  },
  {
    keys: ["영동"],
    resolve: [
      { pattern: /충북.*영동|충청북도.*영동|영동군|영동.*충북/, region: "CHUNGBUK" },
      { pattern: /(강원|강릉|속초).*영동|영동.*(강원|지방)/, region: "GANGWON" },
      // 영동대로는 서울 강남 도로명이라 행정구역은 아니지만 강남 의도가 명확함
      { pattern: /영동대로/, region: "SEOUL" },
    ],
    options: [
      { label: "충청북도 영동군", region: "CHUNGBUK" },
      { label: "강원특별자치도 영동 지역(강릉·속초·동해 등)", region: "GANGWON" },
    ],
  },
];

/** 후보가 이보다 많으면 문구에 전부 나열하지 않고 칩으로만 보여줍니다 */
const CLARIFY_INLINE_OPTION_LIMIT = 3;

/**
 * 시·군·광역 등 **유일하거나 광역으로만 쓰는** 표기 → RegionType.
 * 중의 키는 AMBIGUOUS_PLACES가 먼저 처리합니다.
 * 검색 region은 **이사 도착지** 기준입니다.
 */
const CITY_REGION_RULES: Array<{ pattern: RegExp; region: RegionType }> = [
  { pattern: /서울특별시|서울시|서울/, region: "SEOUL" },
  { pattern: /인천광역시|인천시|인천/, region: "INCHEON" },
  { pattern: /세종특별자치시|세종시|세종/, region: "SEJONG" },
  { pattern: /대전광역시|대전시|대전/, region: "DAEJEON" },
  { pattern: /광주광역시|광주광역/, region: "GWANGJU" },
  { pattern: /대구광역시|대구시|대구/, region: "DAEGU" },
  { pattern: /울산광역시|울산시|울산/, region: "ULSAN" },
  { pattern: /부산광역시|부산시|부산/, region: "BUSAN" },
  { pattern: /제주특별자치도|제주도|제주시|서귀포|제주/, region: "JEJU" },
  { pattern: /강원특별자치도|강원도|강원|춘천|원주|강릉|동해|태백|속초|삼척/, region: "GANGWON" },
  { pattern: /충청북도|충북|청주|충주|제천|음성|진천|옥천/, region: "CHUNGBUK" },
  {
    pattern: /충청남도|충남|천안|공주|보령|아산|서산|논산|계룡|당진|홍성|예산/,
    region: "CHUNGNAM",
  },
  { pattern: /전북특별자치도|전라북도|전북|전주|익산|군산|정읍|남원|김제/, region: "JEONBUK" },
  { pattern: /전라남도|전남|목포|여수|순천|나주|광양|해남|무안/, region: "JEONNAM" },
  { pattern: /경상북도|경북|포항|경주|김천|안동|영주|영천|상주|문경|경산/, region: "GYEONGBUK" },
  { pattern: /경상남도|경남|창원|진주|통영|사천|김해|밀양|거제|양산|함안/, region: "GYEONGNAM" },
  {
    pattern:
      /수원|성남|용인|고양|부천|안산|안양|남양주|화성|평택|의정부|시흥|파주|김포|광명|군포|하남|오산|양주|이천|구리|안성|포천|의왕|여주|동두천|과천|가평|양평|연천|경기광주|경기도|경기/,
    region: "GYEONGGI",
  },
];

/**부정된 지명은 매칭에서 제외합니다 */
function stripNegatedPlaces(text: string): string {
  return text.replace(/[가-힣]{2,10}(말고|아니고|아니라|제외하고|빼고)/g, "");
}

function matchRegionInText(text: string): RegionType | null {
  const cleaned = stripNegatedPlaces(text);
  let best: { index: number; region: RegionType } | null = null;
  for (const { pattern, region } of CITY_REGION_RULES) {
    const matched = pattern.exec(cleaned);
    if (matched == null) continue;
    if (best == null || matched.index < best.index) {
      best = { index: matched.index, region };
    }
  }
  return best?.region ?? null;
}

function resolveAmbiguousPlace(compact: string): RegionResolveResult | null {
  const cleaned = stripNegatedPlaces(compact);
  let firstAmbiguous: RegionResolveResult | null = null;
  //중의 키가 둘 이상이면 한쪽이 다른 쪽을 해소할 수 있어 전부 확인
  for (const place of AMBIGUOUS_PLACES) {
    const hitKey = place.keys.find((key) => cleaned.includes(key));
    if (!hitKey) continue;

    const resolved = place.resolve.find((rule) => rule.pattern.test(cleaned));
    if (resolved) return { type: "resolved", region: resolved.region };

    firstAmbiguous ??= {
      type: "ambiguous",
      clarify: { query: hitKey, options: place.options },
    };
  }
  return firstAmbiguous;
}

function hasBatchim(hangul: string): boolean {
  const last = hangul.charCodeAt(hangul.length - 1);
  if (last < 0xac00 || last > 0xd7a3) return false;
  return (last - 0xac00) % 28 !== 0;
}

/** FE에서 **텍스트**를 bold로 렌더합니다 */
function boldLabel(label: string): string {
  return `**${label}**`;
}

function joinWithWaGwa(labels: string[]): string {
  if (labels.length === 0) return "";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) {
    const bare = labels[0].replace(/\*\*/g, "");
    const particle = hasBatchim(bare) ? "과" : "와";
    return `${labels[0]}${particle} ${labels[1]}`;
  }
  const head = labels.slice(0, -1).join(", ");
  return `${head}, ${labels[labels.length - 1]}`;
}

/** 중의 지역 되묻기 고정 문구 — 후보 지역명만 **bold** 마커 */
export function buildClarifyRegionReply(clarify: MoverAiRegionClarify): string {
  if (clarify.options.length > CLARIFY_INLINE_OPTION_LIMIT) {
    const particle = hasBatchim(clarify.query) ? "은" : "는";
    return `말씀하신 ${boldLabel(clarify.query)}${particle} 여러 지역에 있어요. 아래에서 고르시거나 시·도를 함께 알려주세요.`;
  }
  const labels = clarify.options.map((option) => boldLabel(option.label));
  return `말씀하신 지역이 ${joinWithWaGwa(labels)} 중에 어떤 곳일까요?`;
}

/**
 * CLARIFY_REGION 직후 유저가 말로 고른 경우 — 라벨·번호·광역 키워드로 매칭합니다.
 */
export function matchClarifyRegionChoice(
  message: string,
  clarify: MoverAiRegionClarify
): RegionType | null {
  const compact = message.replace(/\s/g, "");
  const cleaned = stripNegatedPlaces(compact);

  // "네, @@지역이요"의 `네`를 4번으로 오인하지 않도록 번/번째/째가 붙은 경우만 번호로 봅니다
  const ORDINALS = ["첫", "두", "세", "네", "다섯", "여섯", "일곱", "여덟", "아홉"];
  const numberMatch = cleaned.match(/([1-9])번|(첫|두|세|네|다섯|여섯|일곱|여덟|아홉)(?:번)?째/);
  if (numberMatch) {
    const idx = numberMatch[1] ? Number(numberMatch[1]) - 1 : ORDINALS.indexOf(numberMatch[2]);
    if (clarify.options[idx]) {
      return clarify.options[idx].region;
    }
  }

  for (const option of clarify.options) {
    const labelCompact = option.label.replace(/\s/g, "");
    if (cleaned.includes(labelCompact)) return option.region;
    // 라벨의 핵심 토큰(시·군·동 단위)이 메시지에 있으면 채택
    const tokens = labelCompact.match(/[가-힣]{2,}/g) ?? [];
    // 중의 키 자체는 모든 후보에 있어 구분 근거가 안 되므로 제외
    const significant = tokens.filter(
      (t) => !/특별|광역|자치|도$|시$|군$/.test(t) && !t.includes(clarify.query)
    );
    const hits = significant.filter((t) => cleaned.includes(t));
    if (hits.length >= 2) return option.region;
    if (hits.length === 1 && significant.length <= 2) return option.region;
  }

  // 옵션 region이 서로 다르고, 메시지가 그중 한 광역만 가리키면
  const regions = [...new Set(clarify.options.map((o) => o.region))];
  const matched = regions.filter((region) => {
    const rule = CITY_REGION_RULES.find((r) => r.region === region);
    return rule ? rule.pattern.test(cleaned) : false;
  });
  if (matched.length === 1) return matched[0];

  return null;
}

/** "A에서B으로" / "B로" → 도착지 토큰 */
function extractDestinationToken(compact: string): string | null {
  // `으로`를 먼저 치환해 "B으+로"로 쪼개지지 않게 한 뒤, 남은 `로`도 찾습니다
  const marked = compact.replace(/([가-힣]{2,8})으로/g, "$1⟦DEST⟧");
  const withRo = marked.replace(/([가-힣]{2,8})로/g, "$1⟦DEST⟧");
  const matches = [...withRo.matchAll(/([가-힣]{2,8})⟦DEST⟧/g)];
  if (matches.length === 0) return null;
  const raw = matches[matches.length - 1][1];
  const parts = raw.split("에서");
  return parts[parts.length - 1] || raw;
}

/**
 * 메시지에서 **이사 도착지** 지역을 해석합니다.
 * - 중의 키만 있으면 ambiguous (추측 확정 금지)
 * - 해소 표기·유일 시·군이면 resolved
 */
export function resolveRegionFromMessage(message: string): RegionResolveResult {
  const compact = message.replace(/\s/g, "");

  const destToken = extractDestinationToken(compact);
  if (destToken) {
    const destAmbiguous = resolveAmbiguousPlace(destToken);
    if (destAmbiguous) return destAmbiguous;
    const destRegion = matchRegionInText(destToken);
    if (destRegion) return { type: "resolved", region: destRegion };
  }

  const ambiguousOrResolved = resolveAmbiguousPlace(compact);
  if (ambiguousOrResolved) return ambiguousOrResolved;

  const region = matchRegionInText(compact);
  if (region) return { type: "resolved", region };
  return { type: "none" };
}

/** @deprecated resolveRegionFromMessage 사용 — 하위 호환용 */
export function inferExplicitRegion(message: string): RegionType | null {
  const result = resolveRegionFromMessage(message);
  return result.type === "resolved" ? result.region : null;
}
