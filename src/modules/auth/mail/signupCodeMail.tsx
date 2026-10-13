import { render } from "@react-email/components";
import { VerificationCodeEmail } from "./verificationCodeMail.template";

const IGNORE_NOTICE =
  "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 인증하지 않으면 가입되지 않습니다.";

export const buildSignupCodeMail = async (code: string, ttlMinutes: number) => ({
  subject: "[무빙] 회원가입 이메일 인증번호",
  html: await render(
    <VerificationCodeEmail
      code={code}
      ttlMinutes={ttlMinutes}
      purpose="회원가입 이메일"
      description="안녕하세요, 무빙입니다. 아래 인증번호를 입력해 이메일 인증을 완료해 주세요."
      ignoreNotice={IGNORE_NOTICE}
    />
  ),
  text: [
    "안녕하세요, 무빙입니다.",
    "",
    "회원가입 이메일 인증번호는 다음과 같습니다.",
    "",
    `인증번호: ${code}`,
    "",
    `이 인증번호는 ${ttlMinutes}분 동안 유효합니다.`,
    IGNORE_NOTICE,
    "",
    "※ 이 메일은 발신 전용입니다. 회신하셔도 답변을 받을 수 없습니다.",
  ].join("\n"),
});
