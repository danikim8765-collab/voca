# VOCA 계정 서버 (Cloudflare Workers + D1)

앱에서 아이디·비밀번호로 로그인하면 계정마다 진도를 저장해서 폰·패드·컴퓨터의 진도를 맞춰 주는 서버예요.

- Cloudflare 무료 플랜으로 충분해요. Workers는 하루 10만 번 요청, D1은 하루 10만 줄 쓰기까지 돼요.
- 서버는 Cloudflare 컴퓨터에서 24시간 돌아가요. 내 컴퓨터는 꺼도 돼요.

## 파일

| 파일 | 하는 일 |
|---|---|
| `worker.js` | 서버 코드: 가입·로그인·복구·비밀번호 바꾸기·계정 지우기·진도 파일 받기/올리기 |
| `schema.sql` | D1 데이터베이스 표 (처음 한 번 실행) |
| `wrangler.toml` | 명령줄(wrangler)로 올릴 때의 설정 |

## 지금 올라가 있는 서버

- 주소: `https://voca-account.lexioative.workers.dev` (Worker `voca-account`, D1 `voca`)
- 2026-11-28에 Claude가 Cloudflare API로 올렸어요. 아래 대시보드 순서와 결과는 같아요.
- 2026-11-28(두 번째): 관리자 초기화를 넣어 다시 올림. `ADMINS = ssfw4756`(관리자 아이디). 초대 코드·사람 수·앱 주소 설정은 그대로 둠.
- `ORIGINS`: `https://lexioative.pages.dev,https://danikim8765-collab.github.io` (새 앱 주소 + 예전 주소. 쉼표로 여러 개)
- 초대 코드(`INVITE`)는 Cloudflare 비밀 값이라 여기 안 적어요. 바꾸려면 대시보드 → Workers & Pages → voca-account → Settings → Variables and Secrets에서 고쳐요.

## 처음 설정 (대시보드에서, 컴퓨터나 폰 브라우저)

1. **D1 데이터베이스 만들기**
   - dash.cloudflare.com → 왼쪽 **Storage & Databases → D1** → **Create** → 이름 `voca` → 만들기
2. **표 만들기**
   - 만든 `voca` 데이터베이스 → **Console** 탭
   - `schema.sql` 내용을 통째로 붙여 넣고 **Execute**
3. **Worker 만들기**
   - 왼쪽 **Compute (Workers) → Workers & Pages** → **Create** → **Start with Hello World** → 이름 `voca-account` → **Deploy**
4. **코드 넣기**
   - 만든 Worker → **Edit code**
   - 왼쪽의 `worker.js`(또는 `index.js`) 내용을 지우고, 이 폴더의 `worker.js`를 통째로 붙여 넣기 → **Deploy**
5. **데이터베이스 연결**
   - Worker → **Settings → Bindings** → **Add → D1 database**
   - Variable name `DB`, 데이터베이스 `voca` → 저장
6. **설정 값**
   - Worker → **Settings → Variables and Secrets** → **Add**
   - `INVITE`: 종류 **Secret**. 친구들에게 줄 초대 코드예요(예: `voca-친구들-2026`). 여러 개면 쉼표로 이어요.
   - `ORIGINS`: 종류 Text. 앱 주소예요(예: `https://lexioative.pages.dev`. 여러 개면 쉼표로). 비우면 어디서든 부를 수 있어요.
   - `MAX_USERS`: 종류 Text. 가입할 수 있는 사람 수예요(안 넣으면 30).
   - `ADMINS`: 종류 Text. 관리자 아이디예요(여러 명이면 쉼표로). 이 아이디로 로그인하면 앱의 계정 화면에 '관리자' 카드가 보이고, 비밀번호를 잊은 친구의 초기화 코드를 만들 수 있어요.
7. **주소 알려 주기**
   - Worker 화면 위쪽의 주소(`https://voca-account.○○○.workers.dev`)를 Claude에게 알려 주세요.
   - Claude가 앱의 `js/account.js` `ACCOUNT_API_DEFAULT`에 넣으면, 앱 설정 > 연결에 **로그인 / 회원가입**이 생겨요.

- 대시보드 메뉴 이름은 Cloudflare가 가끔 바꿔요. 비슷한 이름을 찾으면 돼요.
- 주소를 브라우저로 열었을 때 `{"ok":true,"app":"voca"}`가 보이면 서버가 잘 돌고 있는 거예요.

## 코드를 고친 뒤

`worker.js`를 고쳤으면 4번처럼 대시보드에서 다시 붙여 넣고 **Deploy** 해요(또는 `npx wrangler deploy`).

표를 바꿔야 하면 `schema.sql`에 적은 것을 D1 Console에서 실행해요.

## 동작 요약

- **비밀번호 보관:** 비밀번호 원문은 서버에 안 와요.
  - 앱이 `PBKDF2(비밀번호, 'voca:' + 아이디, 10만 번)`으로 바꾼 값만 보내요.
  - 서버는 그 값을 사용자마다 다른 salt와 SHA-256해서 저장해요.
  - 무료 플랜은 요청마다 CPU가 10ms뿐이라, 무거운 계산은 앱이 해요.
- **로그인 유지:** 로그인 토큰은 기기에만 원문이 있고, 서버엔 SHA-256만 있어요. 180일 동안 안 쓰면 풀려요.
- **잠금:** 비밀번호나 복구 코드를 8번 연달아 틀리면 15분 동안 잠겨요.
- **복구 코드:** 가입할 때 한 번 보여 줘요. 비밀번호를 잊으면 이걸로 새 비밀번호를 만들어요.
  - 그러면 모든 기기가 로그아웃되고, 새 복구 코드가 나와요.
  - 비밀번호를 바꿀 때도 새 코드가 나와요.
- **진도 파일:** 예전 GitHub Gist와 같은 파일이에요(`voca-progress.json`, `voca-word-progress.json`, `voca-marks.json`, `voca-mywords.json`, `voca-coach.json`).
  - 합치는 건 앱이 해요(`js/sync.js`). 서버는 저장만 해요.
  - 파일 하나 1.5MB, 계정 하나에 모두 합쳐 6MB, 파일 12개까지예요.
- **계정 지우기:** 비밀번호가 맞아야 하고, 진도와 로그인을 모두 지워요.
- **테스트:** `tests/server.test.mjs`는 서버만, `tests/account.test.mjs`는 앱과 서버를 같이 봐요. D1은 Node의 SQLite로 흉내 내요.
