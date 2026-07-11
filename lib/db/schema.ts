// EngCoach schema (Plan §4) — source of truth, replaces supabase/schema.sql.
// `pnpm db:generate` diffs this against supabase/migrations/. RLS on every table;
// queries still go through supabase-js (PostgREST), Drizzle only owns the schema.
import { sql } from "drizzle-orm";
import {
  pgTable,
  pgPolicy,
  uuid,
  text,
  jsonb,
  integer,
  timestamp,
  index,
  check,
} from "drizzle-orm/pg-core";
import { authUid, authUsers } from "drizzle-orm/supabase";

const owner = (col: unknown) => ({
  for: "all" as const,
  using: sql`${authUid} = ${col}`,
  withCheck: sql`${authUid} = ${col}`,
});

export const profiles = pgTable(
  "profiles",
  {
    id: uuid()
      .primaryKey()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    settings: jsonb()
      .notNull()
      .default({ theme: "system", llm_provider: "google", daily_limit: 1500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [pgPolicy("profiles_owner", owner(t.id))]
).enableRLS();

export const documents = pgTable(
  "documents",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    title: text(),
    context: text(),
    mode: text().default("compose"),
    originalText: text("original_text").notNull(),
    naturalRewrite: text("natural_rewrite"),
    overallComment: text("overall_comment"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("documents_context_check", sql`${t.context} in ('email','slack','pr_description','pr_comment')`),
    check("documents_mode_check", sql`${t.mode} in ('compose','translate','paste')`),
    pgPolicy("documents_owner", owner(t.userId)),
  ]
).enableRLS();

export const corrections = pgTable(
  "corrections",
  {
    id: uuid().primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    spanStart: integer("span_start").notNull(),
    spanEnd: integer("span_end").notNull(),
    original: text().notNull(),
    replacement: text().notNull(),
    category: text().notNull(),
    ruleTag: text("rule_tag").notNull(),
    severity: text().notNull().default("error"),
    explanation: text().notNull(),
    status: text().notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("corrections_category_check", sql`${t.category} in ('grammar','clarity','tone')`),
    check("corrections_severity_check", sql`${t.severity} in ('error','suggestion')`),
    check("corrections_status_check", sql`${t.status} in ('pending','accepted','dismissed')`),
    index("corrections_user_tag_idx").on(t.userId, t.ruleTag, t.createdAt),
    pgPolicy("corrections_owner", owner(t.userId)),
  ]
).enableRLS();

export const cards = pgTable(
  "cards",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    front: text().notNull(),
    back: text().notNull(),
    source: text().notNull(),
    correctionId: uuid("correction_id").references(() => corrections.id, { onDelete: "set null" }),
    ruleTag: text("rule_tag"),
    seenCount: integer("seen_count").notNull().default(1), // dedup counter (Spec §4)
    fsrs: jsonb().notNull(), // ts-fsrs Card object
    due: timestamp({ withTimezone: true }).notNull(), // mirror of fsrs.due for indexing
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check("cards_source_check", sql`${t.source} in ('correction','manual','chat')`),
    index("cards_user_due_idx").on(t.userId, t.due),
    pgPolicy("cards_owner", owner(t.userId)),
  ]
).enableRLS();

export const reviewLogs = pgTable(
  "review_logs",
  {
    id: uuid().primaryKey().defaultRandom(),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    rating: integer().notNull(), // ts-fsrs Rating 1-4
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("review_logs_reviewed_idx").on(t.reviewedAt),
    pgPolicy("review_logs_owner", owner(t.userId)),
  ]
).enableRLS();

export const chatSessions = pgTable(
  "chat_sessions",
  {
    id: uuid().primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => authUsers.id, { onDelete: "cascade" }),
    scenario: text(),
    messages: jsonb().notNull().default([]),
    report: jsonb(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [pgPolicy("chat_sessions_owner", owner(t.userId))]
).enableRLS();
