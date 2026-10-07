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

interface ProfileEditCodeEmailProps {
  code: string;
  ttlMinutes: number;
}

export const ProfileEditCodeEmail = ({ code, ttlMinutes }: ProfileEditCodeEmailProps) => (
  <Html lang="ko">
    <Head />
    <Preview>{`무빙 프로필 수정 본인 확인 인증번호는 ${code}입니다`}</Preview>
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
          프로필 수정 본인 확인 인증번호
        </Text>
        <Text style={{ color: COLORS.subText, fontSize: "15px", lineHeight: "24px", margin: 0 }}>
          안녕하세요, 무빙입니다. 아래 인증번호를 입력해 프로필 수정을 계속 진행해 주세요.
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
          본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 프로필은 변경되지 않습니다.
        </Text>

        <Hr style={{ borderColor: COLORS.line, margin: "32px 0 16px" }} />

        <Text style={{ color: COLORS.subText, fontSize: "12px", lineHeight: "18px", margin: 0 }}>
          이 메일은 발신 전용입니다. 회신하셔도 답변을 받을 수 없습니다.
        </Text>
      </Container>
    </Body>
  </Html>
);
