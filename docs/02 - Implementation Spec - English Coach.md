# Implementation Spec — EngCoach

> Tên app: **EngCoach** (repo: `engcoach`). Auth: Google OAuth qua Supabase.

> File này + [[01 - Plan - English Coach Web App]] là spec hoàn chỉnh để bàn giao cho model khác implement mà không cần research thêm.
> Ngôn ngữ prompt: tiếng Anh (dán thẳng vào code). Mọi quyết định mở trong Plan đã được chốt tại đây.

---

## 0. Quyết định đã chốt (thay cho các điểm "đánh giá sau" trong Plan)

| Điểm mở trong Plan | Quyết định | Lý do |
|---|---|---|
| Tiptap AI Suggestion? | **KHÔNG dùng.** Đã verify 2026-07: AI Suggestion nằm trong AI Toolkit trả phí (contact sales; Tiptap Cloud từ $49/mo, free plan đã bị bỏ năm 2025) | Trái ràng buộc $0/tháng |
| Editor thay thế | **Textarea để viết + annotated read-only view để hiển thị corrections** (không live-inline-editing kiểu Grammarly) | Đơn giản hơn một bậc: không cần editor plugin/decorations. User viết → bấm Check → xem kết quả annotated bên dưới/bên cạnh. Đủ cho học; live editing là nice-to-have v2 (nếu cần thì Tiptap core MIT miễn phí + custom decoration) |
| Correction 1 call hay 2-stage | **1 call duy nhất** trả corrections kèm explanation (structured output). 2-stage chỉ khi chất lượng explanation kém sau khi test 10 mẫu | Ít call = nhanh + tiết kiệm quota free tier |
| ORM | **Không.** `supabase-js` + `supabase gen types typescript` | App 1 user, query đơn giản |
| Span anchoring | **Exact substring + occurrence index** (mục §2). KHÔNG dùng char offset từ LLM | LLM đếm offset không tin được — pitfall kinh điển |
| FSRS config | `ts-fsrs` defaults, `request_retention: 0.9`, `enable_fuzz: true` | Defaults FSRS-6 đã tối ưu sẵn; optimize tham số cá nhân là chuyện của năm sau |

## 1. Taxonomy lỗi (`rule_tag`) — dựa trên nghiên cứu lỗi người Việt

Nghiên cứu error analysis trên học viên Việt Nam (pre-intermediate → intermediate) cho phân bố: collocation ~33%, word form ~18%, preposition ~16%, subject-verb agreement ~9%, sentence structure ~9%, thiếu "to be" ~8.5%, verb tense ~4%, article ~3%; cộng thêm pluralization (tiếng Việt không biến hình số nhiều) và literal translation/word order (dịch word-by-word từ tiếng Việt).

Enum `rule_tag` (LLM bắt buộc chọn từ list này, không tự chế):

```
collocation        — sai kết hợp từ ("do a mistake" → "make a mistake")
word_form          — sai dạng từ ("succeed" vs "successful" vs "success")
preposition        — sai/thiếu giới từ ("discuss about" → "discuss")
subject_verb       — sai hòa hợp chủ-vị ("he don't")
sentence_structure — cấu trúc câu/word order (thường do dịch từ tiếng Việt)
missing_be         — thiếu to be ("it very important")
verb_tense         — sai thì
article            — sai/thiếu a/an/the
plural             — sai số nhiều ("two informations")
word_choice        — chọn từ không tự nhiên/không đúng nghĩa
register_tone      — sai tông (quá informal cho email, quá cứng cho Slack)
vietnamese_calque  — dịch word-by-word từ tiếng Việt ("open the light")
spelling           — chính tả
other              — không thuộc loại nào ở trên
```

Mapping sang 3 category hiển thị: `grammar` (đỏ) = subject_verb, verb_tense, article, plural, missing_be, preposition, word_form, spelling; `clarity` (xanh) = collocation, word_choice, sentence_structure, vietnamese_calque; `tone` (tím) = register_tone.

Compose mode dùng phân bố lỗi cá nhân (đếm từ bảng `corrections` 30 ngày gần nhất) để sinh đề nhắm vào 2-3 tag sai nhiều nhất.

## 2. Span anchoring & JSON schemas

**Quy tắc anchoring:** LLM trả `original` = chuỗi con **chính xác nguyên văn** từ input (kể cả hoa/thường, khoảng trắng) + `occurrence` (lần xuất hiện thứ mấy, 1-based). Server validate bằng `indexOf` lặp; correction nào không match được substring → **drop + log**, không hiển thị đại. Không bao giờ tin offset số từ LLM.

**Schema correction (dùng chung cho Compose/Translate/Paste/Chat-report):**

```typescript
// Zod — dùng với AI SDK generateObject / streamObject
const Correction = z.object({
  original: z.string(),        // exact substring from user text
  occurrence: z.number().int().min(1),
  replacement: z.string(),
  rule_tag: z.enum([/* enum §1 */]),
  category: z.enum(["grammar", "clarity", "tone"]),
  explanation: z.string(),     // 1-2 sentences, plain English B1-readable
  severity: z.enum(["error", "suggestion"]), // error = visual weight cao hơn
});

const CorrectionResult = z.object({
  corrections: z.array(Correction),
  natural_rewrite: z.string(), // full rewritten text, natural native phrasing
  overall_comment: z.string(), // 1-2 câu khen chỗ tốt + điểm cần chú ý nhất
});
```

**Schema đề Compose:**

```typescript
const ComposeTask = z.object({
  scenario: z.string(),        // tình huống bằng tiếng Anh đơn giản
  channel: z.enum(["email", "slack", "pr_description", "pr_comment"]),
  audience: z.string(),        // "your PM", "a senior dev you don't know well"
  goal: z.string(),            // what the message must achieve
  constraints: z.array(z.string()).max(3), // e.g. "politely push back on the deadline"
  target_tags: z.array(z.string()).max(3), // rule_tags đề này nhắm luyện
});
```

**Schema Translate grading:** như `CorrectionResult`, thêm:

```typescript
  meaning_score: z.number().min(1).max(5),  // ý có được truyền đạt đủ không
  alternatives: z.array(z.string()).min(1).max(2), // 1-2 cách native diễn đạt
```

**Schema chat session report:**

```typescript
const SessionReport = z.object({
  corrections: z.array(Correction),         // anchor vào message của user
  better_phrasings: z.array(z.object({ you_said: z.string(), better: z.string(), why: z.string() })),
  new_vocabulary: z.array(z.object({ term: z.string(), meaning: z.string(), example: z.string() })),
  fluency_note: z.string(),
});
```

## 3. Prompts (dán thẳng vào code, model-agnostic)

### 3.1. System prompt — Correction (Compose/Paste mode)

```
You are an English writing coach for a Vietnamese software developer at B1 level
who is learning workplace English (email, Slack, PR reviews).

Analyze the user's text and return corrections following the provided schema.

Rules:
- Only flag REAL errors and clearly unnatural phrasing. Do NOT rewrite text that
  is already correct just to match your own style. Preserve the writer's voice.
  When in doubt, do not flag.
- "original" must be an EXACT substring copied verbatim from the user's text.
- Each explanation: 1-2 short sentences, simple English a B1 learner understands.
  Name the rule when one exists (e.g. "After 'discuss' no preposition is needed").
- severity "error" = grammatically wrong; "suggestion" = correct but unnatural.
- rule_tag must be one of the provided enum values. Vietnamese speakers commonly
  make collocation, word form, preposition, article, plural, missing-"to be",
  and word-by-word-translation errors — watch for these specifically.
- The target register is {channel}: {register_note}.
- natural_rewrite: rewrite the full text the way a native colleague would write
  it in this channel — same meaning, same intent, natural tone.
- overall_comment: start with one thing done well, then the single most
  important pattern to work on.
```

`register_note` theo channel: email = "clear, polite, professional"; slack = "friendly, concise, casual but respectful"; pr_description = "precise, structured, neutral"; pr_comment = "constructive, direct but kind".

### 3.2. System prompt — Compose task generator

```
Generate one short workplace writing task for a Vietnamese developer (B1 English)
following the schema. Context: fullstack web developer on a product team.

- The scenario must be a realistic, specific software-team situation (standups,
  deadlines, bug reports, code review disagreements, asking for help, reporting
  progress, declining requests politely).
- Vary channels across: email, slack, pr_description, pr_comment.
- The task should naturally require using these grammar areas: {weak_tags}.
  Do not mention grammar in the task itself.
- Expected response length: 2-6 sentences. Keep the scenario under 60 words.
- Do not repeat these recent scenarios: {recent_scenarios}.
```

### 3.3. System prompt — Translate mode (Việt → Anh)

```
You are grading how well a Vietnamese developer expressed a Vietnamese message
in English. You will receive the Vietnamese source and their English attempt.

- Grade MEANING TRANSFER and NATURALNESS, not literal word-by-word accuracy.
  A free translation that conveys the full intent naturally is a 5.
- meaning_score: 5 = full meaning, natural; 3 = understandable but missing
  nuance or awkward; 1 = meaning lost or wrong.
- Flag corrections only on the English attempt (schema rules as usual).
- alternatives: 1-2 ways a native colleague would express the same idea in the
  same channel. Prefer phrasing that differs structurally from the user's
  attempt so they learn a new pattern.
- If the attempt translates Vietnamese structure word-by-word, tag it
  vietnamese_calque and show the natural English structure in the explanation.
```

Đề tiếng Việt do LLM sinh (prompt tương tự 3.2 nhưng output là 1 câu/tin nhắn tiếng Việt trong ngữ cảnh dev, 15-40 từ) hoặc user tự paste.

### 3.4. System prompt — Voice chat roleplay (Phase 4)

```
You are roleplaying {scenario_role} in {scenario} with a Vietnamese developer
practicing workplace English at B1 level.

- Stay in character. Speak naturally but keep sentences short-to-medium and
  vocabulary at B1-B2 level. One question or point per turn.
- Do NOT correct the user during the conversation. Never break character to
  teach. Corrections happen in a separate end-of-session report.
- The user's messages come from speech-to-text: IGNORE punctuation, casing,
  and obvious transcription artifacts entirely.
- If the user is stuck or silent, offer a gentle in-character prompt.
- Keep replies under 60 words so text-to-speech stays snappy.
```

Report cuối phiên: call riêng với schema `SessionReport`, input là transcript, cùng rule "ignore punctuation/casing from STT".

### 3.5. Prompt — sinh flashcard từ correction

```
Create one flashcard from this correction following the minimum information
principle (one card = one fact).

Front: the user's original sentence with the corrected span replaced by "____"
       plus a short hint in parentheses, e.g. (preposition) or (collocation: make/do).
Back:  the corrected span, then the full corrected sentence, then the
       explanation in one line.

Keep both sides short. The card must be answerable in under 10 seconds.
```

Card tự sinh khi user bấm "+ Flashcard"; user được sửa front/back trước khi lưu (1 dialog, optional).

## 4. Quy tắc tạo card & FSRS

- **1 correction = 1 card, dạng cloze** (front = câu của chính user với blank + hint; back = đáp án + giải thích 1 dòng). Không tạo card định nghĩa từ vựng chung chung.
- Chống trùng: trước khi lưu, check card cùng `rule_tag` + `original` tương tự (ILIKE) — nếu có, tăng counter thay vì tạo card mới.
- `ts-fsrs`: `const f = fsrs(generatorParameters({ request_retention: 0.9, enable_fuzz: true }))`. Lưu nguyên `Card` object vào cột `fsrs jsonb`, mirror `due` ra cột riêng để index. Review: `f.next(card, new Date(), Rating.Good | Rating.Again | ...)` → update `fsrs` + `due`, insert `review_logs`.
- Queue phiên review: `WHERE due <= now() ORDER BY due LIMIT 30`. Card Again requeue trong phiên (học lại sau ~10 phút — ts-fsrs tự tính), **ẩn lại answer khi requeue**.
- Retention % cho dashboard: `pass / total` từ `review_logs` 30 ngày (pass = rating ≥ 2).

## 5. Wireframes (text)

**Layout chung:** shadcn sidebar block — 4 mục: ✍️ Write / 🗂 Review (badge số card due) / 💬 Chat / 📊 Progress. Dark/light theo `prefers-color-scheme`, toggle thủ công. Toàn app keyboard-first.

**Write tab:**
```
[Compose ▾ | Translate | Paste]   [channel: Slack ▾]
┌─ Task card (Compose/Translate mode) ─────────────┐
│ scenario + goal + constraints        [↻ New task] │
└──────────────────────────────────────────────────┘
┌─ textarea (16-18px, lh 1.6) ─────────────────────┐
│                                                   │
└──────────────────────────────────────── [Check ⌘↵]┘
── sau khi Check ──
┌─ Annotated view ─────────────┐ ┌─ Cards panel ───┐
│ text với gạch chân 3 màu     │ │ [All|Gram|Cla|To]│
│ (click span ↔ scroll card)   │ │ ┌ card ────────┐ │
│                              │ │ │ old → new    │ │
│ [tab Natural rewrite: inline │ │ │ explanation  │ │
│  diff đỏ-xóa/xanh-thêm]      │ │ │ ✓ ✗ [+Card]  │ │
└──────────────────────────────┘ └─────────────────┘
overall_comment ở trên cùng kết quả. Mobile: cards thành popover.
```

**Review tab:** card giữa màn hình (flip bằng motion), Space reveal → 2 nút to `Again (1) · <10m` / `Good (Space) · 3d`, phím 2/4 = Hard/Easy vẫn ăn. Progress bar mỏng + "12 left" trên đầu. Hết phiên → màn "Done — 24 reviewed, 87% pass" + nút "Keep going".

**Progress tab:** heatmap 6 tháng (ô = số review+writing session/ngày) · 3 stat cards (Due today / Retention 30d / Words written tuần này) · line chart error-rate theo category 8 tuần · list "Top 5 lỗi tháng này" (mỗi dòng: tag, count, sparkline, link → filter flashcards).

**Chat tab (Phase 4):** scenario chips → màn hội thoại bubble + orb trạng thái (idle/listening/thinking/speaking) + nút mic to (Space = start/stop) + toggle "hide transcript" → nút End session → report page với corrections/phrasings/vocab, mỗi mục có +Card.

## 6. API routes & xử lý

| Route | Làm gì |
|---|---|
| `POST /api/correct` | `generateObject` (schema §2) → validate anchoring server-side (drop unmatched) → lưu `documents` + `corrections` → trả JSON. Không cần stream (kết quả là object; hiện skeleton loader) |
| `POST /api/task` | Sinh ComposeTask / câu tiếng Việt (Translate). Input: `weak_tags` (query từ corrections 30d), `recent_scenarios` (10 đề gần nhất) |
| `POST /api/card` | Sinh flashcard từ correction (prompt §3.5) |
| `POST /api/chat` | `streamText` + system prompt §3.4 (Phase 4) |
| `POST /api/report` | SessionReport từ transcript (Phase 4) |

Provider config 1 chỗ: `lib/llm.ts` export `model = google("gemini-3-flash")` — đổi Claude Haiku = đổi 1 dòng. Mọi call dùng `generateObject`/`streamText` của AI SDK 7, không gọi SDK provider trực tiếp.

Rate-limit guard: đếm calls/ngày trong bảng nhỏ hoặc in-memory; hiện cảnh báo khi chạm 80% quota Gemini free (1.500/ngày — thực tế 1 user không bao giờ chạm).

## 7. Checklist bàn giao cho model implement

**Setup:**
1. `npx create-next-app@latest engcoach --ts --tailwind --app` (Next 16, React 19)
2. `npx shadcn@latest init` → add blocks: sidebar, login; components: card, button, dialog, tabs, badge, progress, sonner
3. Supabase project → chạy schema (Plan §4) → bật RLS mọi bảng (`auth.uid() = user_id`) → `supabase gen types typescript`
4. **Auth — Google OAuth qua Supabase** (không dùng magic link):
   - Google Cloud Console → tạo OAuth 2.0 Client ID (Web application); Authorized redirect URI = `https://<project-ref>.supabase.co/auth/v1/callback`
   - Supabase Dashboard → Authentication → Providers → Google: dán Client ID + Secret
   - Login page (shadcn login block): nút "Sign in with Google" → `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: '<site-url>/auth/callback' } })`
   - Route `GET /auth/callback`: `exchangeCodeForSession` (pattern chuẩn `@supabase/ssr`); middleware refresh session cho server components
   - Thêm production URL Vercel vào Supabase → Authentication → URL Configuration (Site URL + Redirect URLs), và cả `http://localhost:3000` cho dev
5. Deps: `ai @ai-sdk/google ts-fsrs diff zod @supabase/supabase-js @supabase/ssr motion react-speech-recognition`
6. Env: `GOOGLE_GENERATIVE_AI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
7. **Deploy Cloudflare Workers** (ngay commit đầu):
   - `npm i -D @opennextjs/cloudflare wrangler` → tạo `wrangler.jsonc` với `compatibility_flags: ["nodejs_compat"]` và `assets` binding (theo docs opennext.js.org/cloudflare)
   - Build & deploy: `npx opennextjs-cloudflare build && npx opennextjs-cloudflare deploy`
   - **Kiểm tra bundle size ngay lần deploy đầu**: free plan giới hạn 3 MiB gzipped — nếu vượt → Workers Paid $5/mo (10 MiB) hoặc fallback Vercel Hobby, code không đổi
   - Secrets: `wrangler secret put GOOGLE_GENERATIVE_AI_API_KEY` (+ các env Supabase qua `wrangler.jsonc` vars vì là public keys)
   - Cron chống Supabase pause: **Cloudflare Cron Trigger** trong `wrangler.jsonc` (`"triggers": { "crons": ["0 3 * * *"] }`) gọi handler `scheduled` → fetch `/api/ping` (query 1 dòng)
   - Cập nhật Supabase Auth URL Configuration với domain `*.workers.dev` (hoặc custom domain) thay cho URL Vercel

**Thứ tự build & acceptance criteria:** theo Plan §6 (Phase 1: paste/compose → corrections có giải thích, accept/dismiss hoạt động, anchoring không lệch trên 10 văn bản test có từ lặp; Phase 2: review 10 phút chạy 100% bằng bàn phím; Phase 3: dashboard; Phase 4: voice).

**Những điều KHÔNG làm (chốt rồi, không mở lại):**
- Không Tiptap/ProseMirror, không live inline editing — textarea + annotated view.
- Không ORM, không Redux/Zustand (server components + React state đủ), không thêm dependency ngoài danh sách trên khi chưa chứng minh cần.
- Không stream `/api/correct` (object một cục), không realtime voice (turn-based).
- Không XP/streak/level. Heatmap là element gamification duy nhất.
- Không chấm punctuation/casing từ STT.
- Không tự viết SRS scheduler — mọi tính toán interval qua `ts-fsrs`.

**Test tối thiểu:** 1 file test cho anchoring resolver (substring + occurrence, case có từ lặp, case LLM trả sai → drop); 1 file cho FSRS wrapper (Again → due ~10m, Good → due tăng dần). UI không cần test tự động — app cá nhân, tự dùng là test.

## 8. Nguồn bổ sung (research vòng 2)

- Tiptap pricing: [tiptap.dev/pricing](https://tiptap.dev/pricing), [Tiptap new pricing model](https://tiptap.dev/blog/release-notes/tiptaps-new-pricing-model-is-live), [Eddyter Tiptap pricing 2026](https://eddyter.com/blogs/tiptap-pricing-explained-2026), [AI Toolkit pricing FAQ](https://linkgo.dev/faq/the-pricing-options-for-the-ai-toolkit-by-tiptap)
- Lỗi người Việt: [Grammatical Error Analysis — Vietnamese Pre-intermediate Students](https://www.researchgate.net/publication/375482242_Grammatical_Error_Analysis_of_EFL_Learners'_English_Writing_Samples_The_Case_of_Vietnamese_Pre-intermediate_Students), [TNU — common errors among Vietnamese learners](https://jst.tnu.edu.vn/jst/article/download/10966/pdf), [L1 Negative Transfer (ERIC)](https://files.eric.ed.gov/fulltext/EJ1440877.pdf), [i-JTE error analysis 2023](https://i-jte.phamho.com/index.php/journal/article/download/401/135)
