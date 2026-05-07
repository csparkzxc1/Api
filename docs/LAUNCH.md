# Cap — Launch Checklist

베타 → 정식 출시까지 단계별 점검표. T = 정식 출시일.

---

## Phase 0: 기반 (T-60 ~ T-30)

### 법인 / 결제 / 계정

- [ ] **사업자등록** (개인사업자 가능, 통신판매업 신고 별도 필요)
- [ ] **통신판매업 신고** (구청, 구독 결제 시 필수)
- [ ] **Apple Developer 계정** ($99/년) — 개인 또는 법인
- [ ] **Google Play Console** ($25 일회성)
- [ ] **Apple Tax & Banking** (한국 → 미국/한국 은행 계좌 등록)
- [ ] **Google Merchant** 결제 정보 등록
- [ ] **상호 / 상표 출원** (KIPRIS — 9류 소프트웨어, 42류 SaaS)
- [ ] 도메인 확정: `cap.app` 또는 대안 (`usecap.com`, `getcap.io`)
- [ ] **이메일 발신 도메인** SPF/DKIM/DMARC 설정 (Postmark 또는 Resend)

### 인프라

- [ ] 백엔드 프로덕션 호스팅 (Fly.io · Railway · AWS) 셋업
- [ ] PostgreSQL managed (Neon · Supabase · RDS) — 자동 백업 활성화
- [ ] Redis managed (Upstash · ElastiCache)
- [ ] **KMS** 설정 (AWS KMS 또는 GCP KMS) — wrapping key 분리
- [ ] CDN (Cloudflare) — 랜딩페이지, OpenAPI 정적 호스팅
- [ ] APNs 인증서 발급 (.p8 키, Auth Key ID, Team ID)
- [ ] FCM Project + Service Account 생성

### 모니터링 / 관측

- [ ] **Sentry** — 백엔드/iOS/Android/Tauri 에이전트 4개 프로젝트
- [ ] **PostHog** 또는 Plausible — 랜딩 페이지 + 인앱 (PII-free)
- [ ] **Better Stack / Grafana** — 백엔드 가동률 모니터
- [ ] **PagerDuty 또는 Opsgenie** — on-call 알림 (단독 운영이면 SMS만)
- [ ] 로그 보관 정책 결정 (30일 vs 90일, K-PIPA 영향)

### 법무 / 컴플라이언스

- [ ] **개인정보 처리방침** 작성 (K-PIPA 준수)
- [ ] **이용약관** 작성 (구독 약관, 환불 정책 명시)
- [ ] **위치 기반 서비스 약관** (필요 없으면 제외, 명시 필수)
- [ ] **EULA** for App Store
- [ ] **GDPR Cookie 배너** (랜딩페이지, 유럽 트래픽 있으면)
- [ ] DPA(Data Processing Agreement) 템플릿 (Team 플랜용)
- [ ] **보안 정책 문서** (`docs/SECURITY.md` 공개)
- [ ] **버그바운티 정책** (선택, security@cap.app 채널만 열어둬도 OK)

---

## Phase 1: 비공개 베타 (T-30 ~ T-14)

### TestFlight / Play 내부 테스트

- [ ] iOS 빌드 → TestFlight 업로드 (Internal Testing)
- [ ] Android 빌드 → Play Console 내부 테스트 트랙
- [ ] **베타 테스터 모집**: 30~50명 (개발자 커뮤니티, 트위터/X, 네트워크)
- [ ] 베타 슬랙/디스코드 채널 개설
- [ ] **온보딩 흐름** 첫 5분 사용성 검증 (key 입력, 첫 데이터 받기)
- [ ] 워치 페어링 시나리오 검증 (iOS↔Apple Watch, Android↔Wear OS)
- [ ] 데스크톱 에이전트 macOS·Windows 설치 검증

### 핵심 검증 항목

- [ ] **API 키 암호화** end-to-end 동작 확인 (백엔드에 평문 0건)
- [ ] **Anthropic Admin API 폴링** 정상 (rate limit 안 걸리는지)
- [ ] **OpenAI Usage API 폴링** 정상
- [ ] **Claude Code 로컬 로그 파싱** — 다양한 OS / 경로
- [ ] **푸시 알림** 임계치 도달 시 정상 작동 (iOS · Android · Watch)
- [ ] **컴플리케이션 갱신** 주기 (워치 페이스에서 1분 이내)
- [ ] **백엔드 부하 테스트** (k6 or Artillery — 1,000 동시 사용자 시뮬)
- [ ] **결제 sandbox** 검증 (Apple StoreKit 2, Google Play Billing 6+)
- [ ] 환불 처리 플로우 (7일 무조건 환불 약속 이행 가능한지)
- [ ] **Watchdog 타이머** — 결제 후 entitlement 동기화 1초 이내

### 베타 피드백 사이클

- [ ] 1주차: 크래시 로그 0 목표, Sentry 모니터링
- [ ] 2주차: 핵심 사용성 이슈 수정
- [ ] **NPS 또는 PMF 설문** — "Cap 없으면 어떨 것 같나요?" (40%+ "매우 실망" 목표)

---

## Phase 2: 마케팅 사전 준비 (T-14 ~ T-7)

### 콘텐츠

- [ ] 랜딩페이지 실배포 (`cap.app`)
- [ ] **데모 영상** 60초 (워치 글랜스 → 푸시 알림 → 폰 대시보드 흐름)
- [ ] **스크린샷 10장** App Store 사양 (6.9", 5.5") 모두 — Korean + English
- [ ] Play Store 스크린샷 (Phone 2~8장 + Wear 1~8장)
- [ ] **App Preview 영상** (App Store, 30초 max, 한국·영어)
- [ ] 블로그 포스트 #1: "왜 Cap을 만들었는가" (런칭일 발행)
- [ ] 블로그 포스트 #2: "Claude Code Max 한도, 왜 워치에서 봐야 하나" (T+3)

### 커뮤니티

- [ ] **Product Hunt** 게시 일정 잡기 (화·수·목 KST 16:00 = PT 자정)
- [ ] **HackerNews "Show HN"** 초안 작성 (담백하게, 자랑하지 말기)
- [ ] **r/ClaudeAI · r/OpenAI · r/wear · r/AppleWatch** 게시 계획
- [ ] **GeekNews / OKKY / 디스콰이엇** 한국 커뮤니티 게시 계획
- [ ] X(Twitter) 런칭 스레드 초안 (10트윗 내외)
- [ ] LinkedIn 게시 (B2B Team 플랜 유입용)
- [ ] **개발자 인플루언서 / 뉴스레터** 사전 컨택 (Theo, Fireship 같은 원샷이 아니라 한국 개발자 뉴스레터부터)

### 파트너십 (선택)

- [ ] **Anthropic Korea** 비공식 컨택 (자랑보다는 알리기 정도)
- [ ] **개발자 컨퍼런스** 데모 부스 검토 (PyConKR, FEConf, Inflearn 데모데이)
- [ ] **인디해커스 / Microconf** 영문 채널 게시

---

## Phase 3: 출시 (T-7 ~ T-0)

### 최종 점검

- [ ] **App Store Connect** 메타데이터 100% 등록 (한·영, 키워드, 카테고리, 등급)
- [ ] **Play Console** 메타데이터 100% 등록
- [ ] In-App Purchase 5개 상품 등록·승인 (Apple, Google 양쪽)
- [ ] **앱 심사 제출** — Apple T-7, Google T-3 (Apple 심사 평균 1~3일)
- [ ] 심사 거절 대비 buffer 3일
- [ ] **production DNS** 전환 (`cap.app` → 호스팅)
- [ ] **TLS 인증서** 자동 갱신 동작 확인 (Let's Encrypt 또는 Cloudflare)
- [ ] **백엔드 헬스체크** 통과 (`/healthz`, `/readyz`)
- [ ] 데이터베이스 마이그레이션 production 적용
- [ ] **Rollback 플랜** 문서화 (장애 시 30분 내 복구 절차)
- [ ] 24시간 on-call 일정 확정 (출시 첫 주)

### 결제 / 구독 검증

- [ ] StoreKit 2 production sandbox 마지막 검증
- [ ] Google Play Billing production sandbox 마지막 검증
- [ ] **첫 결제 모니터링** — 결제 1분 이내 entitlement 활성화
- [ ] 환불 워크플로우 (Apple은 자동, Google은 manual + auto)
- [ ] 세금계산서 자동 발행 시스템 (사업자등록번호 입력 받는 폼)

---

## Phase 4: 런칭 데이 (T-Day)

### 시간대별 (KST 기준)

- [ ] **00:00** — Product Hunt 게시 (PT 16:00 = KST 익일 09:00 권장)
- [ ] **08:00** — App Store · Play Store 출시 확인 (Apple은 자동, Google은 publish 버튼)
- [ ] **09:00** — 트위터/X 런칭 스레드, LinkedIn 포스트
- [ ] **09:15** — HackerNews "Show HN" 게시 (Google 출시 확인 후)
- [ ] **10:00** — r/ClaudeAI, r/OpenAI 게시
- [ ] **11:00** — GeekNews, OKKY, 디스콰이엇 한국 커뮤니티
- [ ] **12:00** — 점심 + Sentry/Slack 모니터링
- [ ] **15:00** — 첫 피드백 응대 정리, 트위터 리트윗·답변
- [ ] **18:00** — 첫날 메트릭 정리 (방문자, 다운로드, 가입, 결제, 크래시)
- [ ] **22:00** — 핫픽스가 필요하면 야간 배포

### 모니터링

- [ ] Sentry 알림 5분 주기 확인
- [ ] 백엔드 응답 시간 p95 < 200ms 유지
- [ ] 결제 실패율 < 1%
- [ ] 첫 1시간 가입자 수 → 트위터 업데이트 트윗
- [ ] **장애 발생 시**: Status 페이지 (statuspage.io 또는 자체) 업데이트

---

## Phase 5: 출시 후 1주 (T+1 ~ T+7)

### 데일리 루틴

- [ ] 매일 09:00 — 전날 메트릭 검토 (가입, 활성, 결제 전환율, 크래시)
- [ ] 매일 — Sentry 새 이슈 우선순위 분류
- [ ] 매일 — 지원 메일 24시간 이내 응답 (Plus 약속)

### 콘텐츠

- [ ] **T+3**: 블로그 #2 발행 ("Claude Code Max 한도 추적기 분석")
- [ ] **T+5**: 첫 사용 후기 수집 → 트위터 공유
- [ ] **T+7**: 첫 주 회고 블로그 (메트릭 공개, 투명성)

### 데이터 기반 의사결정

- [ ] **활성화율** (가입 → 첫 service 연결): 70% 목표
- [ ] **D1 retention**: 50% 목표
- [ ] **Free → Plus 전환율**: 5% 목표 (첫 주는 낮을 수 있음)
- [ ] 워치 앱 설치율 (iOS 사용자 중 워치 보유 → 워치 앱 설치까지)
- [ ] **취소 사유 수집** (캔슬 시 1-tap 설문)

---

## Phase 6: 출시 후 1개월 (T+8 ~ T+30)

### 안정화

- [ ] 크래시-free 세션 99.5%+ 유지
- [ ] 백엔드 가동률 99.9%+ 목표
- [ ] **첫 큰 버전 업데이트 (1.1)** — 베타에서 잡힌 이슈 + 신기능 1개
- [ ] **Lifetime ₩59,000** 한정 판매 시작 (출시 6개월 동안)
- [ ] 학생 할인 자동 인증 (.ac.kr 도메인)

### 성장

- [ ] **콘텐츠 마케팅 본격화** — 주 1회 블로그
- [ ] **인플루언서 시드** — 영향력 있는 사용자에게 Pro 1년 무상 제공
- [ ] **B2B 영업 채널** 오픈 (Team 플랜 데모 신청 폼)
- [ ] App Store · Play Store **리뷰 응답** 100%
- [ ] **App Store Featured** 신청 (Apple 한국 심사위원 대상)

### 백엔드 / 엔지니어링

- [ ] **OpenAPI drift 자동 검출** CI 추가
- [ ] **E2E 테스트** Playwright (랜딩) + Detox (모바일)
- [ ] **부하 테스트** 정기화 (월 1회)
- [ ] **DR 훈련** — 백업 복원 1회 연습

---

## 운영 SLA / 정책 약속 (외부 공개)

- 응답 시간 (Plus): **48시간**
- 응답 시간 (Pro): **24시간** + 우선
- 응답 시간 (Team): **4시간** + Slack 채널
- 가동률 SLA (Team): **99.5%/월** 미만 시 자동 크레딧
- 환불: **7일 무조건**, 이후 일할 계산
- 가격 인상 grandfather: **12개월** 동결

---

## 비상 대응 시나리오

| 상황 | 대응 |
|---|---|
| Anthropic Admin API 다운 | 마지막 polled 데이터 + "공급자 점검 중" 표시 |
| OpenAI Usage API rate limit | exponential backoff, 사용자 알림 |
| 백엔드 장애 | Status 페이지 1분 이내 업데이트, 핫픽스 또는 롤백 |
| KMS 키 로테이션 실패 | 쓰기 일시 정지, on-call 즉시 호출 |
| 결제 실패 폭증 | Apple/Google 측 장애 확인, 사용자 안내 푸시 |
| 데이터 유출 의심 | KISA 신고 (24시간 내), 영향받은 사용자 통지 |
| 앱 심사 거절 | 사유 분석 → 수정 → 24시간 내 재제출 |

---

## 출시 후 체크할 메트릭 (북극성 + 보조)

**북극성**: Daily Active Watch Glances (워치에서 한 번 이상 본 활성 유저 수)

**보조 메트릭**:
- 가입자 수 (일/주/월)
- Free → Plus 전환율
- Plus → Pro 업그레이드율
- 결제 실패율
- 크래시-free 세션
- 백엔드 p95 응답 시간
- App Store · Play Store 별점

---

<sub>이 체크리스트는 살아있는 문서. 출시 후 1개월에 회고 + 업데이트.</sub>
