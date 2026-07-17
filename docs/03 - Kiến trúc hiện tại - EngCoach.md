# Kiến trúc hiện tại — EngCoach (as-built)

> Chụp lại kiến trúc **thực tế trong code** tại thời điểm 2026-07-17, kèm lý do đằng sau mỗi quyết định.
> Khác với [[01 - Plan - English Coach Web App]] (kế hoạch) và [[02 - Implementation Spec - English Coach]] (spec bàn giao), file này mô tả cái đã build — bao gồm cả những chỗ code đã **đi chệch khỏi spec** và tại sao.

---

## 1. Tổng quan

App học tiếng Anh cá nhân cho developer Việt Nam (B1 → B2), một user, mục tiêu vận hành **$0/tháng**. Triết lý xuyên suốt:

1. **Nội dung sinh bằng AI lúc runtime** — không có content database, không question bank. Đề viết, câu dictation, corrections, flashcards đều là output của LLM call tại thời điểm dùng.
2. **Card sinh từ lỗi của chính user** — không dùng wordlist generic. Đây là điểm khác biệt so với Anki/Duolingo (xem research trong [[00 - Research]] của vault: SRS hiệu quả nhất khi nạp từ lỗi thật).
3. **Tự code tối thiểu** — chỉ custom những gì không có sẵn (review screen, correction display, anchoring); còn lại là shadcn blocks + thư viện.
4. **Anti-gamification** — không XP/streak/level; heatmap là element "game" duy nhất (thể hiện đều đặn mà không phạt ngày nghỉ).

## 2. Stack & lý do chọn

| Layer | Chọn | Tại sao |
|---|---|---|
| Framework | Next.js 16 App Router + React 19 | Default solo full-stack TS 2026; tích hợp AI SDK tốt nhất |
| UI | Tailwind v4 + shadcn/ui + Base UI | shadcn Blocks dựng sẵn sidebar/auth — copy, không build |
| Animation | `motion` (framer-motion) | Flip card + micro-interactions |
| DB + Auth | Supabase free tier | Postgres + Google OAuth + RLS, 500MB đủ vĩnh viễn cho 1 user |
| Schema | Drizzle (chỉ schema/migrations) | ⚠️ Chệch spec (spec nói "không ORM"): Drizzle được thêm để có schema-as-code + migrations có kiểm soát; **runtime query vẫn qua supabase-js/PostgREST** để RLS là tầng enforcement thật. Drizzle không chạy lúc runtime |
| LLM | Vercel AI SDK 7 (`generateObject`/`streamText`) | Provider-agnostic; structured output có zod validate |
| SRS | `ts-fsrs` (FSRS-6) | Thuật toán SR tốt nhất hiện có, pure function, không tự viết scheduler |
| Diff | `jsdiff` | `diffWords` cho inline diff + chấm dictation |
| TTS | `kokoro-js` (Kokoro-82M, WebGPU/WASM) + Web Speech fallback | ⚠️ Ngoài spec: thêm sau vì `speechSynthesis` chất giọng kém; Kokoro chạy **trong browser** nên vẫn $0 |
| STT | `react-speech-recognition` (Web Speech API) | $0 trong browser; chấp nhận độ chính xác kém với giọng Việt vì không chấm điểm phát âm |
| Hosting | Cloudflare Workers + `@opennextjs/cloudflare` | Free 100K req/ngày; chờ I/O (LLM call) không tính CPU time |

## 3. Sơ đồ

```
Browser (Next.js 16 / React 19)
├─ /write    WritingCoach      — compose/translate/paste + annotated corrections
├─ /listen   ListenPractice    — dictation (nghe → gõ → chấm diff → cloze card)
├─ /chat     VoiceChat         — roleplay push-to-talk, STT/TTS
├─ /review   ReviewSession     — FSRS flashcard, keyboard-first
└─ /progress Dashboard         — heatmap, retention, error trend (server-rendered)
        │  fetch (kèm LlmConfig từ localStorage — BYO key)
Route handlers (auth-gated, /api/*)
├─ correct   — generateObject → anchor spans → persist documents+corrections
├─ task      — sinh đề Compose/Translate, nhắm weak tags 30 ngày
├─ card      — sinh cloze card từ correction (có dedup)
├─ chat      — streamText in-character
├─ report    — SessionReport cuối phiên chat
├─ dictation — sinh batch câu nói workplace
├─ models    — list models của provider
└─ ping      — public, cron Cloudflare gọi để chống Supabase pause 7 ngày
        │  supabase-js (PostgREST, RLS enforce)
Supabase (Postgres + Google OAuth)
```

FSRS chạy **client-side** (`ts-fsrs` là pure function), chỉ persist kết quả — không cần server round-trip cho việc tính interval.

## 4. Data model (`lib/db/schema.ts`, migrations trong `supabase/`)

| Bảng | Vai trò | Quyết định đáng chú ý |
|---|---|---|
| `profiles` | 1-1 với auth.users; `settings` jsonb (theme, provider, CEFR level, task length, auto_task) | Trigger `on_auth_user_created` (migration 0001) tự tạo row khi signup — không cần logic provisioning trong app |
| `documents` | Bài viết đã submit: `context` (email/slack/pr_description/pr_comment), `mode` (compose/translate/paste), `original_text`, `natural_rewrite`, `overall_comment` | CHECK enum trong DB thay vì chỉ trong zod: DB là tầng chặn cuối, LLM/client không nhét được giá trị lạ |
| `corrections` | `span_start/end`, `original`, `replacement`, `category`, `rule_tag`, `severity`, `explanation`, `status` | Span lưu dạng offset **đã được server anchor lại** (không phải offset từ LLM — xem §6.1). `rule_tag` là nguồn cho error-trend dashboard |
| `cards` | `front`, `back`, `source`, `rule_tag`, `seen_count`, `fsrs` jsonb, `due` | **`fsrs` jsonb + `due` mirror**: lưu nguyên Card object của ts-fsrs (khỏi map từng field, thuật toán đổi version không cần migrate), nhưng mirror `due` ra cột riêng để index `(user_id, due)` — query "card đến hạn" không phải parse jsonb. `seen_count` là cơ chế chống trùng: lỗi lặp lại → tăng counter thay vì tạo card mới |
| `review_logs` | `card_id`, `rating` 1-4, `reviewed_at` | Append-only; nuôi heatmap + retention %. Tách khỏi `cards` để giữ lịch sử khi card bị sửa/xóa |
| `chat_sessions` | `scenario`, `messages` jsonb, `report` jsonb | Container generic, jsonb vì cấu trúc message/report do AI SDK + zod định nghĩa, không cần query từng field |

**RLS trên mọi bảng** (`auth.uid() = user_id`) dù chỉ 1 user — vì anon key là public; RLS là tầng authorization thật, route handler chỉ là tầng đầu.

## 5. Module chính trong `lib/`

| File | Vai trò | Lý do design |
|---|---|---|
| `anchor.ts` | Re-locate correction spans bằng exact substring + occurrence index (`indexOf` lặp), drop span không match/chồng lấn | **Không bao giờ tin char offset từ LLM** — LLM đếm offset sai là pitfall kinh điển. LLM chỉ trả `original` nguyên văn + lần xuất hiện thứ mấy; server tự tìm. Correction không anchor được → drop + log, không hiển thị đại |
| `fsrs.ts` | Wrap ts-fsrs: `newCard`, `fromDb` (rehydrate Date từ jsonb), `review`, `intervals` | `request_retention: 0.9`, `enable_fuzz: true` — defaults FSRS-6 đã tối ưu sẵn, optimize tham số cá nhân là chuyện về sau. Hoàn toàn content-agnostic |
| `taxonomy.ts` | `RULE_TAGS` (14 tag), `TAG_CATEGORY` mapping, `CHANNELS`, `REGISTER_NOTE` | Tag list dựa trên **nghiên cứu error analysis học viên Việt** (collocation ~33%, word form ~18%, preposition ~16%...). LLM bắt buộc chọn từ enum, không tự chế. **Category do server derive từ rule_tag** (`TAG_CATEGORY`) — LLM không được quyền quyết category, tránh mapping loạn |
| `prompts.ts` | Toàn bộ system prompt | Chống overcorrection ("only flag REAL errors... when in doubt, do not flag") — failure mode đã biết của LLM correction. Explanation giới hạn 1-2 câu B1-readable. Chat prompt cấm sửa lỗi giữa hội thoại (correction dồn về report cuối phiên — tránh anti-pattern của Praktika) |
| `schemas.ts` | Zod schemas cho mọi `generateObject` | Structured output thay vì parse text tự do; 1 call duy nhất trả correction + explanation (không 2-stage — ít call, tiết kiệm quota free tier) |
| `llm.ts` + `providers.ts` + `llm-body.ts` | Resolve model, provider presets (Google/xAI/Groq/OpenRouter/...), config store localStorage | ⚠️ Chệch spec lớn nhất: **BYO key**. Spec gốc dùng server env key; hiện tại key nằm localStorage browser, gửi kèm mỗi request, **không bao giờ vào DB**. Lý do: không gánh chi phí/quota hộ ai, không lo lộ key server-side, đổi provider tự do |
| `dictation.ts` | `scoreDictation`: diff từng từ (bỏ hoa/thường, dấu câu), từ sai → cloze front | Tái dùng jsdiff; câu nghe sai tự thành flashcard — cùng nguyên tắc "card từ lỗi thật" |
| `scenarios.ts` | 4 scenario roleplay hardcode | Đủ dùng, chưa cần user-defined |
| `profile.ts` | CEFR levels, task length, đọc settings từ jsonb | Settings dồn vào 1 cột jsonb thay vì bảng riêng — app 1 user, khỏi migration mỗi lần thêm setting |
| `stats.ts` | Pure functions: heatmap, retention, trendByCategory, topTags | Tách pure để unit-test được (`lib/__test__/`) — logic thống kê là chỗ dễ sai lặng lẽ nhất |
| `kokoro.ts` + `tts.ts` | Kokoro queue (cancel/barge-in, load status pub/sub) + system TTS fallback, voice scoring, prefs per-device | Hai engine vì Kokoro cần WebGPU/WASM load ~300MB lần đầu — fallback để app dùng được ngay |
| `supabase/{client,server,middleware}.ts` | 3 client Supabase theo context | Pattern chuẩn `@supabase/ssr` |

## 6. Bốn luồng dữ liệu chính

### 6.1 Write (luồng phức tạp nhất)
1. `/api/task` sinh đề — input gồm `weak_tags` (đếm `corrections` 30 ngày gần nhất → 2-3 tag sai nhiều nhất) và `recent_scenarios` (chống lặp đề). **Đề nhắm vào đúng loại lỗi hay sai** — đây là cách app "điều chỉnh độ khó theo trình độ".
2. User viết vào textarea → `/api/correct` → `generateObject` với schema Correction.
3. Server anchor spans (`lib/anchor.ts`), derive category từ rule_tag, persist `documents` + `corrections`.
4. UI: annotated view 3 màu (grammar đỏ / clarity xanh / tone tím — theo convention Grammarly người dùng đã thuộc) + suggestion cards + inline diff natural rewrite.
5. "+ Flashcard" → `/api/card` → cloze card (front = câu của user với blank + hint) → FSRS.

**Editor là textarea + annotated read-only view, không live inline editing** — Tiptap AI Suggestion là paid add-on (trái ràng buộc $0), và annotated view đơn giản hơn một bậc.

### 6.2 Review
Queue: `WHERE due <= now() ORDER BY due LIMIT 30`. Rating 2 nút chính (Again/Good — FSRS research: chính xác hơn với người chủ yếu dùng 2 nút, loại decision fatigue), phím 2/4 vẫn ăn Hard/Easy. Card Again requeue trong phiên, ẩn lại answer. `f.next()` → update `fsrs`+`due`, insert `review_logs`. 100% keyboard-driven.

### 6.3 Listen (dictation)
`/api/dictation` sinh batch câu workplace → Kokoro đọc → user gõ → `scoreDictation` diff → từ nghe sai thành cloze card. Feature ngoài spec gốc, thêm sau để luyện nghe chủ động (typing = retrieval, không phải nghe thụ động).

### 6.4 Chat (voice roleplay)
Push-to-talk (KHÔNG auto-detect silence — complaint số 1 của voice AI, người non-native pause nhiều). STT browser → `/api/chat` streamText in-character → TTS. AI **không sửa lỗi giữa chừng**; End session → `/api/report` → SessionReport (corrections + better phrasings + vocab, mỗi mục "+Card"). Không chấm punctuation/casing vì STT tự thêm.

## 7. Auth

- Google OAuth qua Supabase (`signInWithOAuth` → `GET /auth/callback` exchange code).
- `proxy.ts` (middleware) → `updateSession`: validate JWT local bằng `getClaims()` (không round-trip Supabase mỗi request), refresh cookie, gate mọi route trừ `/login`, `/auth/*`, `/api/ping`. API chưa auth → 401 JSON; page → 307 `/login`.
- Mỗi route handler vẫn tự gọi `getUser()` — middleware chỉ là tầng đầu, không phải authoritative check.

## 8. Quyết định then chốt — tóm tắt "tại sao"

| Quyết định | Tại sao |
|---|---|
| Nội dung AI-generated, không content DB | App 1 user; LLM sinh đề nhắm weak tags cá nhân tốt hơn mọi question bank tĩnh |
| Card chỉ sinh từ lỗi thật | Research SRS: wordlist generic là cái làm Anki chán; lỗi của chính mình mới có ngữ cảnh |
| Anchoring server-side, không tin LLM offset | LLM đếm ký tự sai kinh niên; exact substring + occurrence là cách duy nhất tin được |
| Category derive từ rule_tag ở server | LLM chọn 1 thứ (tag), server suy ra phần còn lại — ít bậc tự do, ít sai |
| FSRS client-side, jsonb + due mirror | Pure function không cần server; jsonb miễn migrate khi FSRS đổi version; mirror để index |
| BYO key, localStorage, không vào DB | Không gánh chi phí, không giữ secret của ai trong DB |
| Textarea + annotated view | Live editing cần Tiptap paid; đọc kết quả sau khi Check là đủ cho mục đích học |
| 2 nút rating, keyboard-first | Giảm decision fatigue; review 10 phút/sáng phải không có friction |
| Push-to-talk, không auto-silence-detect | Người non-native pause nhiều → auto-detect cắt lời giữa chừng |
| Correction dồn về cuối phiên chat | Sửa giữa hội thoại phá fluency — mục tiêu của chat là nói trôi, không phải nói đúng từng câu |
| Heatmap là gamification duy nhất | Streak/XP plateau ở intermediate và đo engagement, không đo fluency |
| RLS mọi bảng dù 1 user | Anon key là public — RLS là tầng bảo vệ thật, không phải app code |
| Drizzle chỉ cho schema, không runtime | Schema-as-code + migrations, nhưng runtime qua PostgREST để RLS enforce |

## 9. Chệch spec đã biết (spec §0 vs code)

| Spec nói | Code thực tế | Đánh giá |
|---|---|---|
| Không ORM | Drizzle cho schema/migrations | Hợp lý — vẫn không phải runtime ORM |
| Server env key (`GOOGLE_GENERATIVE_AI_API_KEY`) | BYO key per-request từ localStorage | Thay đổi có chủ đích, kéo theo `providers.ts`/`models` route |
| TTS = `speechSynthesis` | Kokoro-82M in-browser + fallback | Nâng cấp chất lượng, vẫn $0; đổi lại bundle/load nặng hơn |
| 4 tab (Write/Review/Chat/Progress) | +Listen (dictation) | Feature mới ngoài spec |
| — | recharts cho dashboard | Dependency thêm cho line chart/sparkline |

## 10. Giới hạn đã biết & ceiling

- **English bị khóa cứng**: prompts, taxonomy, CEFR, DB CHECK enum — không có khái niệm subject/topic. Muốn học nội dung khác phải tổng quát hóa (xem thảo luận DevCoach — chưa chốt làm).
- **Web Speech STT kém với giọng Việt** — chấp nhận vì không chấm điểm phát âm; nếu cần scoring thật phải dùng Azure Pronunciation Assessment (research [[00]]).
- **Supabase pause sau 7 ngày idle** — cron ping là lưới an toàn, review hàng ngày là lưới chính.
- **Bundle Cloudflare free 3 MiB gzipped** — Kokoro làm nặng thêm; nếu vượt → Workers Paid $5/mo hoặc Vercel Hobby, code không đổi.
- **Không đo được nói** — voice chat không chấm điểm (by design); đo tiến bộ nói cần benchmark ngoài (EF SET định kỳ).
