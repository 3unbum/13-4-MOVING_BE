import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";

const COLORS = {
  brand: "#f9502e",
  brandLight: "#feeeea",
  text: "#1e1e1e",
  subText: "#7a7a79",
  background: "#f7f7f7",
  line: "#f2f2f2",
} as const;

const FONT_FAMILY = "'Pretendard', 'Apple SD Gothic Neo', 'Malgun Gothic', '맑은 고딕', sans-serif";

interface VerificationCodeEmailProps {
  code: string;
  ttlMinutes: number;
  /** 제목·미리보기에 쓰는 용도 이름 (예: "비밀번호 재설정") */
  purpose: string;
  description: string;
  /** 본인이 요청하지 않았을 때 안내 문구 */
  ignoreNotice: string;
}

/** 인증번호 메일 공통 템플릿 — 비밀번호 재설정·회원가입 이메일 인증이 함께 씁니다 */
export const VerificationCodeEmail = ({
  code,
  ttlMinutes,
  purpose,
  description,
  ignoreNotice,
}: VerificationCodeEmailProps) => (
  <Html lang="ko">
    <Head />
    <Preview>{`무빙 ${purpose} 인증번호는 ${code}입니다`}</Preview>
    <Body style={{ backgroundColor: COLORS.background, fontFamily: FONT_FAMILY, margin: 0 }}>
      <Container
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "16px",
          margin: "40px auto",
          maxWidth: "480px",
          padding: "40px 32px",
        }}
      >
        <Text style={{ color: COLORS.brand, fontSize: "24px", fontWeight: 700, margin: 0 }}>
          무빙
        </Text>

        <Text
          style={{ color: COLORS.text, fontSize: "20px", fontWeight: 700, margin: "32px 0 8px" }}
        >
          {purpose} 인증번호
        </Text>
        <Text style={{ color: COLORS.subText, fontSize: "15px", lineHeight: "24px", margin: 0 }}>
          {description}
        </Text>

        <Section
          style={{
            backgroundColor: COLORS.brandLight,
            borderRadius: "12px",
            margin: "24px 0",
            padding: "24px 0",
            textAlign: "center",
          }}
        >
          <Text
            style={{
              color: COLORS.brand,
              fontSize: "32px",
              fontWeight: 700,
              letterSpacing: "8px",
              margin: 0,
            }}
          >
            {code}
          </Text>
        </Section>

        <Text style={{ color: COLORS.text, fontSize: "14px", lineHeight: "22px", margin: 0 }}>
          이 인증번호는 <strong>{ttlMinutes}분</strong> 동안 유효합니다.
        </Text>
        <Text
          style={{ color: COLORS.subText, fontSize: "14px", lineHeight: "22px", margin: "4px 0 0" }}
        >
          {ignoreNotice}
        </Text>

        <Hr style={{ borderColor: COLORS.line, margin: "32px 0 16px" }} />

        <Text style={{ color: COLORS.subText, fontSize: "12px", lineHeight: "18px", margin: 0 }}>
          이 메일은 발신 전용입니다. 회신하셔도 답변을 받을 수 없습니다.
        </Text>
      </Container>
    </Body>
  </Html>
);
