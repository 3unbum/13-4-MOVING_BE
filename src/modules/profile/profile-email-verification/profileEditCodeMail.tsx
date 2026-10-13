import { render } from "@react-email/components";
import { ProfileEditCodeEmail } from "./profileEditCodeMail.template";

export const buildProfileEditCodeMail = async (code: string, ttlMinutes: number) => ({
  subject: "[무빙] 프로필 수정 본인 확인 인증번호",
  html: await render(<ProfileEditCodeEmail code={code} ttlMinutes={ttlMinutes} />),
  text: [
    "안녕하세요, 무빙입니다.",
    "",
    "프로필 수정 본인 확인 인증번호는 다음과 같습니다.",
    "",
    `인증번호: ${code}`,
    "",
    `이 인증번호는 ${ttlMinutes}분 동안 유효합니다.`,
    "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 프로필은 변경되지 않습니다.",
    "",
    "※ 이 메일은 발신 전용입니다. 회신하셔도 답변을 받을 수 없습니다.",
  ].join("\n"),
});
