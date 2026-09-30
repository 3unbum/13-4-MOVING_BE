import { render } from "@react-email/components";
import { ResetCodeEmail } from "./resetCodeMail.template";

/**
 * 비밀번호 재설정 인증번호 메일. 디자인을 입힌 HTML과 함께, HTML을 못 여는 메일 클라이언트용 텍스트도 보냅니다.
 * 메일이 다른 사람에게 전달돼도 드러나는 정보를 줄이려고 이름·계정 유형은 넣지 않습니다.
 */
export const buildResetCodeMail = async (code: string, ttlMinutes: number) => ({
  subject: "[무빙] 비밀번호 재설정 인증번호",
  html: await render(<ResetCodeEmail code={code} ttlMinutes={ttlMinutes} />),
  text: [
    "안녕하세요, 무빙입니다.",
    "",
    "비밀번호 재설정 인증번호는 다음과 같습니다.",
    "",
    `인증번호: ${code}`,
    "",
    `이 인증번호는 ${ttlMinutes}분 동안 유효합니다.`,
    "본인이 요청하지 않았다면 이 메일을 무시하셔도 됩니다. 비밀번호는 변경되지 않습니다.",
    "",
    "※ 이 메일은 발신 전용입니다. 회신하셔도 답변을 받을 수 없습니다.",
  ].join("\n"),
});
