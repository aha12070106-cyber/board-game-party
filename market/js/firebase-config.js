// ① Firebase 콘솔 → 프로젝트 설정 → 일반 → "내 앱" → 웹 앱의 SDK 설정에서
//    firebaseConfig 객체를 복사해 아래 null 자리에 붙여 넣으세요. (README.md 참고)
//    이 값들은 공개되어도 괜찮은 값이에요. 실제 보호는 보안 규칙과 서버 코드가 해요.
//
// null 로 두면 "체험 모드"로 열려요. 체험 모드는 이 브라우저에만 저장되고 보안이 없어서
// 둘러보기·테스트용이에요.

export const firebaseConfig = null;
/* 예시:
export const firebaseConfig = {
  apiKey: "AIza...",
  authDomain: "my-market.firebaseapp.com",
  projectId: "my-market",
  storageBucket: "my-market.firebasestorage.app",
  messagingSenderId: "1234567890",
  appId: "1:1234567890:web:abcdef",
};
*/

// functions/index.js 의 region 과 같아야 해요.
export const functionsRegion = 'asia-northeast3';

// true 로 두면 localhost 에서 열었을 때 Firebase 에뮬레이터(내 컴퓨터)에 연결해요.
export const useEmulators = false;
