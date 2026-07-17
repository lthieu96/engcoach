# Design — Mock Interview (DSA / System Design)

> Tính năng mới: mock interview kỹ thuật bằng tiếng Anh, có rubric chấm điểm như công ty thật, lưu lại toàn bộ để xem lại và theo dõi tiến bộ.
> Research thị trường 2026-07-17. Kế thừa nguyên tắc của [[01 - Plan]] / [[02 - Implementation Spec]] / [[03 - Kiến trúc hiện tại]]: $0/tháng, AI-generated content, card từ lỗi thật, anti-gamification.

---

## 1. Research thị trường — reverse engineering

### 1.1. Các sản phẩm chính

| Sản phẩm | Mô hình | Điểm đáng học | Giá |
|---|---|---|---|
| **interviewing.io** | Mock với người thật (ex-FAANG, ẩn danh, audio-only) + AI Interviewer free làm funnel | **Replay có annotation** — được khen là feedback artifact tốt nhất thị trường. Book theo company style | $179-300/buổi, package $2K/3 buổi |
| **Hello Interview** | Content + Guided Practice (AI whiteboard) | **Đã khai tử AI mock tự do + human mock (05/2026)** để dồn vào guided practice từng bước theo Delivery Framework — tín hiệu thị trường lớn nhất: mock "thả rông" thua practice có scaffold. AI đọc cả diagram + voice | $59/1mo, $99/yr, lifetime $349 |
| **Exponent** (nuốt Pramp) | Peer mock free + AI mock (chỉ behavioral/PM, **không dám làm coding/SD**) | Rubric ngay sau buổi, "modeled after hiring rubrics"; transcript + rubric lưu dashboard. Nhưng feedback bị paywall | free tier / ~$150/yr |
| **HackerRank AI Mock** (2025) | 5 format có timer (Coding 60m, System Design 60m...) | **Chat với interviewer sau buổi để hỏi về đánh giá** — pattern rẻ mà hay. Rubric DNA từ hiring thật | trong subscription |
| **Codemia.io** | System design + whiteboard, **iterate loop**: submit → feedback → sửa → resubmit, xem điểm tăng | Active practice model được khen | ~$69/yr |
| **Final Round AI** | Copilot real-time + mock theo JD | **Cautionary tale**: 17% 1-sao Trustpilot — feedback generic/hallucinate, billing mập mờ | ~$90/mo |
| **Google Interview Warmup** | Free, behavioral, đã archive | Design reference "insights, not scores" — nhưng không lưu lịch sử nên không track được tiến bộ |
| Pramp/AlgoExpert peer mocks | Peer swap | Pain point: ~20% no-show, ~30% feedback vô dụng | free/~$99yr |

### 1.2. Table stakes (mọi sản phẩm nghiêm túc đều có)
Config type × level (× company style) → phiên voice-first có transcription + timer đúng độ dài round thật (45-60m) → report ngay sau buổi theo rubric per-dimension → lịch sử transcript + rubric trên dashboard.

### 1.3. Pain points thị trường = cơ hội design
1. **AI interviewer bị chê "scripted"** — follow-up yếu, không pushback, không calibrate theo level → prompt phải ép đào sâu và phản biện.
2. **Không có trend line** — user muốn biết "tôi có đang khá lên không?"; gần như không sản phẩm nào làm tốt score trend across sessions → EngCoach có sẵn DNA stats/dashboard, đây là easy win.
3. **Level calibration** (mid vs senior vs staff cùng một đề, kỳ vọng khác nhau) — được nói nhiều trong content, gần như không sản phẩm nào implement → làm được bằng prompt, gần free.
4. **Realism gap**: áp lực thời gian, interviewer chủ động đổi hướng — AI hiện tại không làm → timer server-side + prompt pacing checkpoint.
5. Khoảng trống giữa "free mà nông" và "$179-300/buổi" — app cá nhân $0 nhắm thẳng vào đây.

### 1.4. Rubric công ty thật (nguồn: Tech Interview Handbook, Exponent, interviewing.io Meta guide, Jackson Gabbard)

**DSA — 4 trục chuẩn (Meta/Google/Amazon dùng chung khung này):**
1. `communication` — clarify đề, nói approach + trade-off trước khi code, dễ theo dõi
2. `problem_solving` — hiểu đề, approach đúng, phân tích trade-off, optimize complexity
3. `coding` — tốc độ + độ chính xác implement (chỉ chấm khi có code — xem §4 Phase 2)
4. `verification` — chủ động test edge case, dry-run, tự bắt bug (Meta: "tín hiệu mạnh nhất của engineering maturity")

**System design — 6 chiều:**
1. `requirements` — functional vs non-functional, ưu tiên, xử lý mơ hồ (gồm estimation khi nó phục vụ quyết định)
2. `high_level_design` — kiến trúc end-to-end hợp lý, API/data model
3. `deep_dives` — bottleneck, consistency/availability/latency
4. `trade_offs` — mọi lựa chọn phải có phương án bị loại kèm lý do
5. `communication` — dẫn dắt, cấu trúc trình bày
6. (ẩn trong config, không phải dimension) **level-scaled proactivity**: senior/staff phải tự drive deep dive; mid được dẫn

**Thang điểm:** 1-4 per dimension (map Strong No Hire → Strong Hire). Phone screen cần "leaning hire"+ để đi tiếp.

**Cấu trúc buổi system design** (Hello Interview Delivery Framework — chuẩn de facto): Requirements (~5m) → Core Entities (~2m) → API (~5m) → High-Level Design (~10-15m) → Deep Dives (~10m).

## 2. Định vị & phạm vi

**EngCoach angle — cái không sản phẩm nào có:** một buổi interview = 2 mục tiêu — kỹ thuật (rubric) + tiếng Anh (corrections → FSRS cards). Người Việt rớt interview FAANG thường không phải vì thuật toán mà vì không *diễn đạt* được suy nghĩ bằng tiếng Anh — đúng pain point B1→B2 của app.

**Goals:**
- Interview dạng **text chat** theo phase, có timer, interviewer biết pushback và pacing. (Chốt: không voice — gõ text vừa loại rủi ro STT giọng Việt/TTS latency, vừa biến mỗi buổi thành bài luyện *viết* technical English, đúng mission Writing Coach. Muốn luyện nói thì tab Chat vẫn còn đó)
- Report 2 tầng: rubric kỹ thuật (per-dimension, có evidence trích từ transcript) + English report (tái dùng SessionReport)
- **Xem lại được mọi buổi cũ**: replay transcript có phase marker + evidence highlight, trend điểm theo dimension qua thời gian
- Level calibration (mid/senior/staff) qua config

**Non-goals (chốt, không mở lại):**
- ❌ Whiteboard/code editor trong app — LeetCode + Excalidraw mở cạnh bên; app chấm phần *trình bày*. (Hello Interview cần cả team làm multimodal diagram grading; Exponent còn né coding.)
- ❌ Voice — chốt text-only (Goals ở trên); STT/TTS/push-to-talk không tham gia feature này
- ❌ Real-time copilot (vùng "cheating-adjacent" — Final Round là cautionary tale)
- ❌ Peer matching, percentile comparison — app 1 user
- ❌ Thay mock người thật — buổi cuối trước interview thật vẫn nên là interviewing.io/Pramp/đồng nghiệp

## 3. UX flows

### 3.1. Setup (dialog trên trang /interviews)
```
Kind:      [System Design] [DSA walkthrough]      (behavioral đã có ở tab Chat)
Level:     [Mid] [Senior] [Staff]                  → đổi kỳ vọng rubric + độ pushback
Duration:  [25m rút gọn] [40m chuẩn]
Question:  [🎲 Generate]  hoặc  [✍️ Tự nhập]       → paste từ vault System-Design-Mastery được
```
Generate tránh lặp đề gần đây (pattern `recent_scenarios` sẵn có của `/api/task`).

### 3.2. Live session
- **Text chat thuần** — UI chat bubble đơn giản, interviewer reply stream để đọc ngay. Không voice (xem Goals §2); không cần STT/TTS/push-to-talk.
- **Timer** hiển thị; server tính elapsed từ `started_at`, bơm vào system prompt mỗi turn → interviewer tự pacing: *"We have about 10 minutes left, let's move to deep dives"* (giải pain point #4).
- Interviewer prompt ép: một câu hỏi/lượt, follow-up đào sâu, **phản biện có chủ đích** ("What if a celebrity posts and you get 10M reads?"), không dạy giữa chừng (nguyên tắc của chat hiện tại), senior/staff thì im lặng chờ candidate tự drive.
- **Persist từng turn** (khác chat hiện tại chỉ lưu cuối buổi) → crash/rớt mạng không mất; quay lại resume được buổi `active`.
- Nút **End interview** (hoặc hết giờ interviewer tự wrap up) → màn evaluate.

### 3.3. Report (ngay sau buổi)
```
┌─ Overall: Leaning Hire (3/4) ── Senior bar ─────────────┐
│ Rubric: requirements 3 · high-level 3 · deep dives 2    │
│         trade-offs 2 · communication 3                  │
│ Mỗi dimension: feedback + evidence "…" (click → jump    │
│ đến turn trong transcript)                              │
│ Action items (3 gạch đầu dòng, cụ thể)                  │
├─ English report ────────────────────────────────────────┤
│ corrections / better phrasings / vocab — mỗi mục [+Card]│
└─ [💬 Hỏi interviewer về đánh giá]  (debrief chat)       │
```
Debrief chat = HackerRank pattern, rẻ: tiếp tục hội thoại với transcript + evaluation trong context.

### 3.4. Review lịch sử — lý do tồn tại của data model
- **/interviews**: list (kind, đề, ngày, thời lượng, badge điểm) + **line chart điểm theo dimension** qua các buổi (tái dùng recharts + pattern `lib/stats.ts`) — giải pain point #2, gần như không đối thủ nào làm.
- **/interviews/[id]**: replay transcript có **phase markers** (Requirements → Deep dives), evidence của rubric highlight trên đúng turn (bản "replay + annotation" kiểu interviewing.io, phiên bản $0), report panel bên cạnh, English corrections với "+Card" dùng lại được cả sau buổi.

## 4. Data model

```typescript
// interviews — 1 row / buổi. Evaluation 1-1 nên nằm luôn trên row (không tách bảng).
export const interviews = pgTable("interviews", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  kind: text().notNull(),                    // CHECK ('system_design','dsa_walkthrough')
  question: text().notNull(),                // đề bài đầy đủ
  config: jsonb().notNull(),                 // { level: 'mid'|'senior'|'staff', targetMinutes, questionSource: 'generated'|'user' }
  status: text().notNull().default("active"),// CHECK ('active','completed','abandoned')
  evaluation: jsonb(),                       // shape §4.1 — null khi chưa chấm
  englishReport: jsonb("english_report"),    // SessionReport shape (tái dùng schema sẵn có)
  overallScore: integer("overall_score"),    // mirror evaluation.overall — cho list + trend chart khỏi parse jsonb
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  endedAt: timestamp("ended_at", { withTimezone: true }),
}, (t) => [
  check("interviews_kind_check", sql`${t.kind} in ('system_design','dsa_walkthrough')`),
  check("interviews_status_check", sql`${t.status} in ('active','completed','abandoned')`),
  index("interviews_user_started_idx").on(t.userId, t.startedAt),
  pgPolicy("interviews_owner", owner(t.userId)),
]).enableRLS();

// interview_turns — mỗi lượt nói 1 row (KHÔNG jsonb như chat_sessions.messages)
export const interviewTurns = pgTable("interview_turns", {
  id: uuid().primaryKey().defaultRandom(),
  interviewId: uuid("interview_id").notNull().references(() => interviews.id, { onDelete: "cascade" }),
  userId: uuid("user_id").notNull().references(() => authUsers.id, { onDelete: "cascade" }),
  idx: integer().notNull(),                  // thứ tự turn, unique trong interview
  role: text().notNull(),                    // CHECK ('interviewer','candidate')
  content: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  check("interview_turns_role_check", sql`${t.role} in ('interviewer','candidate')`),
  unique("interview_turns_order").on(t.interviewId, t.idx),
  pgPolicy("interview_turns_owner", owner(t.userId)),
]).enableRLS();
```

Kèm 1 migration nới CHECK: `cards_source_check` thêm `'interview'`.

### 4.1. Shape của `evaluation` jsonb (zod trong `lib/schemas.ts`)

```typescript
const RubricDimension = z.object({
  dimension: z.string(),                     // enum theo kind — §1.4
  score: z.number().int().min(1).max(4),
  feedback: z.string(),                      // 2-3 câu, cụ thể
  evidence: z.array(z.object({
    turnIdx: z.number().int(),               // anchor vào interview_turns.idx
    quote: z.string(),                       // trích nguyên văn — validate substring như anchor.ts
  })).max(3),
});

const InterviewEvaluation = z.object({
  rubric: z.array(RubricDimension),
  overall: z.number().int().min(1).max(4),   // 1=Strong No, 2=No, 3=Leaning Hire, 4=Hire+
  summary: z.string(),                       // 2-3 câu, mở đầu bằng điểm mạnh (pattern overall_comment)
  actionItems: z.array(z.string()).max(3),
  phases: z.array(z.object({                 // phase markers cho replay — chấm hậu kiểm,
    phase: z.string(),                       // không cần track real-time (§5 lý do)
    fromIdx: z.number().int(),
    toIdx: z.number().int(),
  })),
});
```

### 4.2. Tại sao design như vậy

| Quyết định | Lý do |
|---|---|
| **Turns là rows, không phải `messages` jsonb** | (1) Buổi 40 phút persist từng turn — crash không mất (chat_sessions ghi 1 lần cuối buổi, OK cho roleplay 5 phút, không OK ở đây); (2) resume buổi `active`; (3) evidence của rubric anchor bằng `turnIdx` → replay jump-to-moment — chính là bản "recording + annotation" của interviewing.io |
| **Evaluation là jsonb trên `interviews`, không tách bảng** | Quan hệ 1-1, không bao giờ query độc lập; cấu trúc do zod định nghĩa — đúng pattern `chat_sessions.report` |
| **`overall_score` mirror ra cột** | List + trend chart query không parse jsonb — đúng pattern `cards.due` mirror từ `fsrs` jsonb |
| **Evidence quote validate substring server-side** | Không tin LLM trích dẫn — cùng triết lý `anchor.ts`: quote không match content của turn → drop evidence, giữ score |
| **English report tách khỏi evaluation, 2 LLM call riêng** | Hai concern khác nhau (nội dung vs ngôn ngữ), mỗi call một schema gọn — LLM chấm tốt hơn khi không phải làm 2 việc; English call tái dùng nguyên `SessionReport` + prompt sẵn có |
| **Phase markers chấm hậu kiểm (trong evaluation), không track real-time** | Live turn dùng `streamText` để đọc reply ngay khi đang sinh — bắt LLM trả structured phase mỗi turn là phá streaming; phase chỉ cần cho replay nên để evaluator gắn nhãn một thể |
| **Không bảng question bank** | Nội dung AI-generated là triết lý app (§8 doc 03); đề generate theo level + tránh lặp, hoặc user tự paste (từ vault System-Design-Mastery) |
| **Behavioral không nằm trong kind** | Tab Chat đã có scenario mock interview behavioral; không làm 2 chỗ cùng một việc |

## 5. API routes

| Route | Làm gì |
|---|---|
| `POST /api/interview` | Tạo buổi: generate đề (input: kind, level, đề gần đây để tránh lặp) hoặc nhận đề user nhập → insert `interviews` + turn 0 (interviewer chào + đọc đề) → trả `{id, question, firstTurn}` |
| `POST /api/interview/turn` | Body `{interviewId, content}`. Insert candidate turn ngay → load toàn bộ turns + elapsed (server tính `now() - started_at`) → `streamText` interviewer reply (system prompt: persona + level + phase checklist + "Elapsed: 18/40 min" + pacing rules) → stream xong insert interviewer turn |
| `POST /api/interview/finish` | 2 call tuần tự: `generateObject(InterviewEvaluation)` với rubric theo kind + `generateObject(SessionReport)` (chỉ candidate turns) → validate evidence quotes → update row: status, evaluation, english_report, overall_score, ended_at |
| `POST /api/interview/debrief` | Chat sau buổi về đánh giá: `streamText` với transcript + evaluation trong system prompt. Không persist (đọc xong bỏ) |

Trang `/interviews` và `/interviews/[id]` server-render query thẳng Supabase (pattern trang Progress) — không cần GET API.

## 6. Prompts — điểm ép chống "scripted AI" (pain point #1)

Interviewer system prompt phải có:
- **Persona + độ khó theo level**: staff → "stay silent, let the candidate drive; only interject to probe or redirect"; mid → "guide with one hint if stuck >2 turns".
- **Pushback bắt buộc**: mỗi phase ít nhất 1 challenge ("What breaks first at 10x load?", "Why not just use Postgres for this?").
- **Pacing theo elapsed**: mốc thời gian trong prompt, wrap up khi hết giờ.
- **Một câu hỏi/lượt, trả lời ngắn** — interviewer thật không độc thoại; **không dạy, không sửa tiếng Anh giữa chừng** — mọi feedback dồn về report (nguyên tắc chat hiện tại).
- Evaluator prompt: chấm theo đúng level bar trong config; bắt buộc trích evidence nguyên văn; action items phải cụ thể hành động được, không khuyên chung chung ("luyện thêm" ❌).

## 7. Milestones — ✅ đã implement toàn bộ (2026-07-17)

**Phase 1 — System Design interview (core)** ✅
Schema + migration (`0002`) → `/api/interview` + `/turn` (text chat UI, stream reply) → `/finish` 2-tầng report → trang list + detail replay. Rubric 5 chiều SD.

**Phase 2 — DSA walkthrough + trend** ✅
Kind `dsa_walkthrough` (rubric 3 trục) → trend chart điểm theo dimension trên `/interviews` (SVG tự vẽ, server component — theo pattern `components/dashboard/charts.tsx`, không dùng recharts như bản nháp ghi; có đường dashed "hire bar" ở mức 3) → debrief chat (`/api/interview/debrief`, ephemeral không persist).

**Phase 3** ✅
Paste code vào buổi DSA → thêm trục `coding` (lưu trong `config.code`, không cần bảng artifact); company-style presets (Meta/Google/Amazon — một flavor line trong prompt, `COMPANY_NOTE`); export = nút "Markdown" trên replay copy transcript + evaluation vào clipboard để dán vào vault (web app không ghi file local được — copy là bản tương đương hợp lý).

Code map: `lib/interview.ts` (rubrics + descriptors + validate), `lib/schemas.ts` (`interviewEvaluationSchema`), `lib/prompts.ts` (§interview), `app/api/interview/{,turn,finish,debrief}`, `app/(app)/interviews/{page,[id]/page}`, `components/interview/*`.

## 8. Rủi ro & đối sách

| Rủi ro | Đối sách |
|---|---|
| LLM chấm rubric hào phóng/generic (complaint #1 của AI mock toàn thị trường) | Evidence bắt buộc + validate substring; level bar trong prompt; so 5 transcript mẫu giữa 2 provider trước khi chốt prompt (pattern "test 10 mẫu" của Spec §0) |
| Buổi 40 phút vượt `maxDuration` 30s | Không sao — mỗi turn là 1 request riêng, finish là call riêng (có thể cần `maxDuration: 60` cho finish vì 2 call tuần tự) |
| Context dài (40 phút ≈ 40-60 turns) vượt window model nhỏ | Turns là text ngắn, ~10-15K tokens — trong hạn mọi model 2026; nếu chạm → summarize các phase đã qua |
| Gõ text chậm hơn nói → buổi 40 phút mệt | Duration mặc định 25m; interviewer chấp nhận bullet-style answers (ghi trong prompt) — interview thật qua CoderPad/chat cũng viết kiểu này |
| Free tier Gemini 10 RPM | Turn-based nên mỗi turn 1 call, trong hạn; finish 2 call |
