-- VOCA 계정 서버(Cloudflare D1) 표. server/README.md의 순서대로 한 번 실행
-- 사용자: 비밀번호는 앱이 PBKDF2로 바꾼 값(key)을 받아, 서버가 사용자마다 다른 salt와 한 번 더 SHA-256해서 저장 (원래 비밀번호는 서버에 안 옴)
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,               -- 아이디 (영어 소문자·숫자·_ 3~20자)
  name TEXT NOT NULL,                -- 가입할 때 적은 이름
  pw TEXT NOT NULL,                  -- SHA-256(salt + key)
  salt TEXT NOT NULL,
  rec TEXT NOT NULL,                 -- SHA-256(salt + 복구 코드): 비밀번호를 잊었을 때
  created INTEGER NOT NULL,
  fails INTEGER NOT NULL DEFAULT 0,  -- 연달아 틀린 비밀번호 수
  lock_until INTEGER NOT NULL DEFAULT 0
);
-- 로그인한 기기: 토큰 원문은 기기에만, 여기엔 SHA-256만
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user TEXT NOT NULL,
  created INTEGER NOT NULL,
  seen INTEGER NOT NULL              -- 마지막으로 쓴 날 (180일 안 쓰면 풀림)
);
CREATE INDEX IF NOT EXISTS sessions_user ON sessions(user);
-- 진도 파일: 예전 GitHub Gist의 파일과 같은 이름·내용 (voca-progress.json 등)
CREATE TABLE IF NOT EXISTS files (
  user TEXT NOT NULL,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (user, name)
);
