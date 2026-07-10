# Plan: EngCoach — Web app học từ vựng + viết (cá nhân)

> Tên app: **EngCoach**. Đăng nhập: **Google OAuth** (Supabase Auth).

> Scope đã chốt: **từ vựng (SRS) + kỹ năng viết**, nói chỉ là chat voice không chấm điểm. Chạy **$0/tháng**.
> Nguyên tắc: tái sử dụng tối đa (library, blocks, template có sẵn) — chỉ tự code 2 thứ: màn hình review flashcard và component hiển thị correction.
> Stack và free-tier limits đã verify ngày 2026-07-10 (npm registry + docs chính thức).

---

## 1. Stack (đã verify version)

| Layer | Chọn | Version | Lý do |
|---|---|---|---|
| Framework | Next.js App Router | `next@16.2.10`, `react@19.2.7` | Default 2026 cho solo full-stack TS; tích hợp AI SDK tốt nhất; Turbopack mặc định |
| UI | Tailwind CSS v4 + shadcn/ui | `tailwindcss@4.3.2` | shadcn có **Blocks** (dashboard/auth/sidebar dựng sẵn — copy, không build); Tailwind v4 CSS-first `@theme`, OKLCH |
| Animation | Motion (framer-motion đổi tên) | `motion@12.42.2` | `import { motion } from "motion/react"` — cho flip card + micro-interactions |
| DB + Auth | Supabase free tier | `@supabase/supabase-js@2.110.2` | Xem limits §2. Dùng `supabase-js` thuần + `supabase gen types` — **không cần ORM** cho app 1 user; thêm Drizzle sau nếu query phức tạp |
| LLM | Vercel AI SDK 7 | `ai@7.0.19`, `@ai-sdk/google@4.0.11`, `@ai-sdk/anthropic@4.0.11` | Provider-agnostic: `google("gemini-3-flash")` ↔ `anthropic("claude-haiku-4-5")` đổi 1 dòng |
| SRS engine | ts-fsrs | `ts-fsrs@5.4.1` (FSRS-6) | Official TS implementation; lưu `Card` object dạng JSONB |
| Text diff | jsdiff | `diff@9.0.0` | `diffWords()` + tự render `<ins>`/`<del>` (~20 dòng). Bỏ diff-match-patch (unmaintained) |
| Voice input | react-speech-recognition | `@4.0.1` | Hook trên Web Speech API — STT $0 trong browser |
| Hosting | Cloudflare Workers + `@opennextjs/cloudflare` | — | Cách chuẩn 2026 deploy Next.js lên Cloudflare (Node.js runtime, hỗ trợ Next 16, SSR/middleware/streaming). Free: 100K req/ngày. ⚠️ Gotchas xem §2 |

**Template khởi đầu**: fork [Vercel Gemini chatbot template](https://vercel.com/templates/next.js/gemini-ai-chatbot) cho phần chat, thay vì dựng từ đầu.

## 2. Free tier — con số cụ thể & gotchas

- **Gemini 3 Flash free**: 10 RPM, 250K TPM, **1.500 requests/ngày** (reset nửa đêm PT) — dư sức cho 1 người học. Đây là LLM chính.
  - ⚠️ Free tier của Google **dùng data để train** → không paste email/PR thật của công ty; viết lại tình huống tương tự. Cần nội dung thật → chuyển `claude-haiku-4-5` ($1/M input, $5/M output — vài cent/ngày).
- **Supabase free**: 500 MB DB, 50K MAU, 1 GB storage. ⚠️ **Pause sau 7 ngày không có query** — chính việc review flashcard hàng ngày giữ nó sống; thêm cron ping (Vercel cron hoặc GitHub Actions) làm lưới an toàn. Tối đa 2 project free.
- **Cloudflare Workers free**: 100K requests/ngày, chờ I/O (gọi LLM) không tính CPU time → streaming OK. Hai gotcha:
  - ⚠️ **Bundle limit 3 MiB (gzipped)** trên free plan — app Next.js dễ chạm. Đo ngay ở Phase 0 (`opennextjs-cloudflare build` báo size); nếu vượt → Workers Paid $5/tháng (10 MiB) hoặc fallback Vercel Hobby (đổi hosting không ảnh hưởng code).
  - CPU time free plan ~10ms/request — đủ cho route handlers gọi LLM (I/O-bound), nhưng SSR trang nặng có thể chạm; giữ các tab render chủ yếu client-side.
  - Cron: **Cloudflare Cron Triggers** (free) thay Vercel cron cho việc ping Supabase.
- **RLS**: bật ngay cả khi 1 user (`auth.uid() = user_id`) vì anon key là public. Auth: Supabase Auth với **Google OAuth** (free, không giới hạn ở free tier).

## 3. Tính năng & UX spec (từ research UX 2024-2026)

### 3.1. Writing Coach (build đầu tiên — 80% giá trị)

Hai mode, **Compose là chính**:

- **Compose mode (mặc định)**: app giao đề viết hàng ngày theo ngữ cảnh công việc — "PM hỏi tại sao feature trễ, trả lời trong Slack", "viết PR description cho bug fix", "từ chối yêu cầu review gấp một cách lịch sự". Viết trực tiếp trong editor → corrections tại chỗ. Đây là task-based learning (đã được SLA research xác nhận), tránh friction phải nhớ copy draft từ nơi khác, và giải luôn bài toán privacy (đề mô phỏng, không dính data công ty → dùng Gemini free thoải mái). Đề do LLM sinh, **thiên về loại lỗi hay sai** (nhiều lỗi article → đề ép dùng article).
- **Translate mode (Việt → Anh)**: app đưa câu/tin nhắn tiếng Việt trong ngữ cảnh công việc (hoặc paste ý nghĩ tiếng Việt của chính mình) → tự viết bản tiếng Anh → LLM chấm theo **truyền đạt đúng ý + tự nhiên** (không ép dịch sát từng từ — tránh thói quen word-by-word), đưa 1-2 phương án native hay hơn. Đánh trúng pain point B1: biết ý tiếng Việt nhưng bí cách diễn đạt.
- **Paste mode (phụ)**: dán draft thật khi cần sửa gấp. Giảm friction bằng Raycast/Shortcut macOS: chọn text → mở `/write?text=...`.

Sau khi viết/dán → LLM trả corrections có tag category → hiển thị inline → accept/dismiss → lỗi đã accept thành card FSRS.

**UX theo chuẩn Grammarly (đã thành convention người dùng thuộc sẵn):**
- **3 category gạch chân màu** (không dùng >4 màu — thành nhiễu): 🔴 đỏ = grammar/correctness, 🔵 xanh = clarity/cách nói tự nhiên, 🟣 tím = tone/register (formal email vs Slack vs PR — quan trọng nhất với workplace English). Dark mode dùng bản desaturated (`#f87171`, `#60a5fa`, `#c084fc`), luôn kèm icon/label — không dựa vào màu đơn thuần (colorblind-safe).
- **Suggestion card** (side panel bên phải trên desktop, popover trên mobile): original strikethrough → replacement bold → **giải thích quy tắc 1-2 câu** (đây là điểm khác Grammarly/DeepL — DeepL Write bị chê vì sửa mà không giải thích "why") → nút Accept / Dismiss / **"+ Flashcard"**. Two-way sync: click card ↔ scroll đến đoạn text.
- **Hai tầng output**: (1) sửa lỗi inline, (2) "Natural rewrite" cả đoạn — hiển thị **inline diff** (đỏ gạch xóa, xanh thêm) bằng jsdiff, không side-by-side.
- Lỗi correctness có visual weight cao hơn style suggestion; có "accept all in category".
- Keyboard: Tab/mũi tên duyệt suggestion, Enter accept, Esc dismiss.
- **Editor**: ~~Tiptap AI Suggestion~~ — đã verify là paid add-on (AI Toolkit, contact sales) → **chốt: textarea để viết + annotated read-only view hiển thị corrections** (không live inline editing). Chi tiết xem [[02 - Implementation Spec - English Coach]] §0.
- Typography: text người dùng 16-18px, line-height ≥1.6 (gạch chân làm dày dòng), monospace chỉ cho code snippet trong PR.

**Prompt design** (từ research SLA + GEC): pipeline 2 bước — (1) detect & correct trả JSON `{span, replacement, category, rule_tag}`, (2) sinh giải thích ngắn cho từng lỗi. Chống overcorrection: yêu cầu chỉ sửa lỗi thật, giữ giọng người viết. Mỗi lỗi có `rule_tag` (vd `articles`, `preposition`, `tense`) → nguồn cho dashboard trend.

### 3.2. Flashcards / SRS Review

- **Không có React SRS kit trưởng thành nào** → tự build thin component (~100 dòng: shadcn Card + motion flip) trên `ts-fsrs`. Đây là 1 trong 2 phần custom code thực sự.
- **Card sinh tự động từ lỗi của chính mình** (từ Writing Coach + voice chat) + cụm từ công việc tự thêm. Không dùng wordlist generic — đây là cái làm app này hơn Anki.
- **Rating: mặc định 2 nút** (Again = đỏ/trái, Good = xanh/phải) — FSRS research: chính xác hơn với người chủ yếu dùng Again/Good, và loại bỏ decision fatigue/interval gaming. Phím 2/4 vẫn hoạt động cho Hard/Easy.
- Phím tắt in ngay trên nút (pattern của Mochi). Space = reveal/Good, 1 = Again. Review 100% keyboard-driven trên desktop; mobile: nút to neo đáy màn hình.
- Hiện **interval preview** nhỏ dưới mỗi nút ("<10m" / "3d").
- Progress bar mỏng trên đầu + "12 left"; session mặc định ~20-30 card due, có "keep going" opt-in; màn hình "session complete".
- Card fail phải ẩn lại answer khi requeue (lỗi UX của Mochi).

### 3.3. Voice Chat (P2 — thêm sau, không chấm điểm)

- **Tap-to-toggle mic (push-to-talk), KHÔNG auto-detect silence** — complaint số 1 của ChatGPT voice là cắt lời giữa chừng; người non-native pause nhiều hơn nên càng tệ. Spacebar start/stop.
- Transcript chat-bubble luôn hiển thị, có toggle ẩn (luyện nghe).
- **Correction trong hội thoại: passive indicator** — icon nhỏ cạnh message *chỉ khi có lỗi*, tap mở card. Anti-pattern: Praktika hiện nút feedback trên mọi dòng; TalkPal không highlight gì.
- **KHÔNG chấm punctuation/casing từ STT output** (Web Speech API tự thêm — chấm sẽ sai) — chỉ word choice + grammar.
- **Post-session report bắt buộc**: corrections + cách nói hay hơn + từ mới, mỗi mục có "+ Flashcard".
- Lưu lịch sử hội thoại (roleplay standup nhiều ngày liên tục).
- Scenario preset chips: "daily standup", "explain a bug to PM", "disagree politely in code review", "mock interview".
- State indicator: listening/thinking/speaking (orb pulse). TTS: `speechSynthesis` browser, $0, interruptible.
- ⚠️ Web Speech API STT chỉ tốt trên Chrome/Edge — chấp nhận được vì app cá nhân.

### 3.4. Dashboard (1 trang duy nhất)

- **Heatmap calendar** kiểu GitHub (element "gamified" duy nhất đáng giữ — thể hiện đều đặn mà không phạt ngày nghỉ như streak).
- Cards: due hôm nay / mature / **true retention %** (FSRS cho native).
- **Error-rate trend theo category** từ `rule_tag`: "article errors: 12/tuần → 4/tuần" — metric động lực nhất với người lớn, không app thương mại nào làm tốt.
- Top 5 lỗi lặp lại tháng này, mỗi loại link tới flashcards của nó.
- **Anti-features**: XP, level, leaderboard, loss-aversion streak, badge, daily-goal nag.

### 3.5. Onboarding / empty states

Không có tour. Mỗi tab empty state = 1 ví dụ chạy được: Writing tab pre-fill sẵn 1 tin nhắn Slack mẫu + nút "Check it"; Flashcards: "corrections bạn accept sẽ xuất hiện ở đây"; Chat: scenario chips.

## 4. Data model (Supabase)

```sql
-- profiles: id (= auth.uid), settings jsonb (theme, llm_provider, daily_limit)
-- documents: id, user_id, title, context ('email'|'slack'|'pr'), original_text, created_at
-- corrections: id, document_id, span_start, span_end, original, replacement,
--              category ('grammar'|'clarity'|'tone'), rule_tag, explanation,
--              status ('accepted'|'dismissed'), created_at
-- cards: id, user_id, front, back, source ('correction'|'manual'|'chat'),
--        correction_id nullable, fsrs jsonb (Card object từ ts-fsrs), due timestamptz, created_at
-- review_logs: id, card_id, rating, reviewed_at   -- nuôi heatmap + retention %
-- chat_sessions: id, user_id, scenario, messages jsonb, report jsonb, created_at
```

RLS mọi bảng: `auth.uid() = user_id`. Index: `cards(user_id, due)`, `review_logs(reviewed_at)`.

## 5. Kiến trúc

```
Browser (Next.js 16 / React 19)
├─ Writing tab: editor (Tiptap hoặc contenteditable) + suggestion side panel
├─ Review tab: flip card + ts-fsrs (client-side scheduling)
├─ Chat tab: useChat (AI SDK) + react-speech-recognition + speechSynthesis
└─ Dashboard: heatmap + trends (query Supabase)
        │
Route handlers (Cloudflare Workers, streaming)
├─ /api/correct  → streamText, Gemini 3 Flash, JSON corrections 2-stage
├─ /api/chat    → streamText, in-character system prompt
└─ /api/report  → post-session summary
        │
Supabase (Postgres + Auth + RLS)
```

FSRS chạy client-side (`ts-fsrs` là pure function — không cần server), chỉ persist kết quả.

## 6. Milestones

**Phase 0 — Scaffold (1 buổi tối)**
`create-next-app` + Tailwind 4 + shadcn init (chọn Blocks: sidebar + auth) + Supabase project + schema §4 + Supabase Auth **Google OAuth** (setup chi tiết: Spec §7) + deploy **Cloudflare Workers** ngay từ ngày đầu (đo bundle size luôn — xem §2).

**Phase 1 — Writing Coach (1-2 tuần, dùng được ngay)**
Editor + `/api/correct` + suggestion cards + accept/dismiss + inline diff natural rewrite. Chưa cần flashcard — accept chỉ lưu vào `corrections`.
✅ Definition of done: paste 1 email nháp thật (đã viết lại tình huống) → nhận corrections có giải thích → accept từng cái.

**Phase 2 — Flashcards (1 tuần)**
Nút "+ Flashcard" trên correction card → sinh card (front: câu có lỗi/cụm cần nhớ, back: bản đúng + giải thích — LLM sinh) → màn review 2 nút + keyboard → review_logs.
✅ DoD: 10 phút review mỗi sáng chạy mượt bằng bàn phím.

**Phase 3 — Dashboard (vài ngày)**
Heatmap + retention + error trend theo rule_tag.

**Phase 4 — Voice chat (khi 2 phase đầu đã thành thói quen)**
Scenario chips + push-to-talk + post-session report → flashcards.

## 7. Rủi ro & đối sách

| Rủi ro | Đối sách |
|---|---|
| Supabase pause 7 ngày idle | Review hàng ngày tự giữ sống + Cloudflare Cron Trigger ping 1 lần/ngày |
| Bundle Next.js > 3 MiB (Workers free) | Đo ở Phase 0; vượt → Workers Paid $5/mo hoặc fallback Vercel Hobby (không đổi code) |
| Gemini free train trên data | Không dùng nội dung công ty thật; cần thật → đổi 1 dòng sang Claude Haiku |
| Gemini overcorrection (high recall, low precision) | Prompt "chỉ sửa lỗi thật"; so sánh chất lượng với Haiku trên 10 mẫu trước khi chốt |
| Web Speech API kém với giọng Việt | Không chấm điểm nên chấp nhận được; nếu quá tệ → Groq Whisper free tier |
| ~~Tiptap AI Suggestion trả phí~~ — đã xác nhận | Đã chốt textarea + annotated view (Spec §0), không dùng Tiptap |
| Tự build quá nhiều | Quy tắc: chỉ 2 component custom (review screen, correction display). Mọi thứ khác: shadcn Blocks, AI SDK template, thư viện §1 |

## 8. Nguồn research

- UX: Grammarly Editor guide + engineering blog, Tiptap AI Suggestion docs, Anki manual, fsrs4anki tutorial, Borretti on Mochi, RemNote SR guide, Lingtuitive 5-app voice test 2026, Praktika/TalkPal reviews (languatalk), OpenAI community push-to-talk thread, Decision Lab "streak creep", Uni Bonn gamification, Envato/Lollypop UX trends 2025-2026, Appcues Duolingo onboarding teardown.
- Stack: supabase.com/pricing, vercel.com/docs/functions/limitations (2026-07-01), Vercel AI SDK 7 blog + migration guide, ai.google.dev rate limits, shadcn changelog + Tailwind v4 doc, motion.dev, ts-fsrs repo, Bytebase Drizzle vs Prisma, npm registry (version verify 2026-07-10).
- Phương pháp học: xem [[00 - Research - Phương pháp học & Spec web app tiếng Anh]].
