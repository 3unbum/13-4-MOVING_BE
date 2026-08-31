// 1. 일부러 아무 의미 없는 무한 루프 코드 넣기 (성능 유발 지적 테스트)
export function badLoopFunction() {
    while (true) {
      console.log("무한 루프 도는 중...");
    }
}

// 2. 백엔드 비밀키 노출 테스트 (하드코딩 지적 테스트)
const MY_SECRET_KEY = "abcdefg123456789";