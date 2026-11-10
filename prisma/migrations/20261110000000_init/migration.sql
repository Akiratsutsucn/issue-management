-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'member');

-- CreateEnum
CREATE TYPE "CustomerStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "ConfirmationKind" AS ENUM ('confirmed_requirement', 'suggested_pending');

-- CreateEnum
CREATE TYPE "IssueStatus" AS ENUM ('open', 'in_progress', 'answered', 'pending_customer', 'done', 'closed');

-- CreateEnum
CREATE TYPE "WaitingOn" AS ENUM ('us', 'customer', 'vendor');

-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('config_screenshot', 'test_record', 'customer_confirmation', 'other');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('problem', 'solution');

-- CreateEnum
CREATE TYPE "AttendanceKind" AS ENUM ('internal_user', 'contact', 'placeholder');

-- CreateEnum
CREATE TYPE "LinkType" AS ENUM ('related');

-- CreateEnum
CREATE TYPE "ReminderType" AS ENUM ('due_soon', 'overdue', 'pending_customer_long', 'high_no_assignee', 'high_no_due');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('unread', 'read');

-- CreateEnum
CREATE TYPE "ImportStrategy" AS ENUM ('skip_existing', 'fill_blanks', 'overwrite_scalars');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "aliases" TEXT[],
    "role" "UserRole" NOT NULL DEFAULT 'member',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "failed_logins" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "list_columns" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "team_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "team_name" TEXT NOT NULL DEFAULT '',
    "reminder_due_soon_days" INTEGER NOT NULL DEFAULT 3,
    "reminder_pending_days" INTEGER NOT NULL DEFAULT 7,
    "reminder_high_no_due_grace_days" INTEGER NOT NULL DEFAULT 1,
    "member_can_create_customer" BOOLEAN NOT NULL DEFAULT true,
    "max_image_bytes" INTEGER NOT NULL DEFAULT 10485760,
    "max_attachment_bytes" INTEGER NOT NULL DEFAULT 20971520,
    "login_max_failures" INTEGER NOT NULL DEFAULT 10,
    "login_lock_minutes" INTEGER NOT NULL DEFAULT 15,

    CONSTRAINT "team_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "priorities" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "priorities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_types" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "issue_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "short_name" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customer_priority_overrides" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "priority_id" TEXT NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "customer_priority_overrides_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contacts" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_batches" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "meeting_on" DATE,
    "title" TEXT NOT NULL,
    "updated_on" DATE,
    "updater_text" TEXT NOT NULL DEFAULT '',
    "updater_user_id" TEXT,
    "information_text" TEXT NOT NULL DEFAULT '',
    "filling_note" TEXT NOT NULL DEFAULT '',
    "source_document" TEXT NOT NULL DEFAULT '',
    "division_note" TEXT NOT NULL DEFAULT '',
    "import_file_name" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "meeting_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "meeting_attendees" (
    "id" TEXT NOT NULL,
    "batch_id" TEXT NOT NULL,
    "kind" "AttendanceKind" NOT NULL,
    "user_id" TEXT,
    "contact_id" TEXT,
    "placeholder_label" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "meeting_attendees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issues" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "meeting_batch_id" TEXT,
    "source_id" TEXT,
    "issue_type_id" TEXT,
    "customer_seq" INTEGER NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "title_is_draft" BOOLEAN NOT NULL DEFAULT false,
    "priority_id" TEXT NOT NULL,
    "completion_condition" TEXT NOT NULL DEFAULT '',
    "recorded_on" DATE,
    "due_on" DATE,
    "reporter_contact_id" TEXT,
    "reporter_text" TEXT NOT NULL DEFAULT '',
    "team_assigned" BOOLEAN NOT NULL DEFAULT false,
    "assignee_text" TEXT NOT NULL DEFAULT '',
    "confirmation_kind" "ConfirmationKind" NOT NULL DEFAULT 'suggested_pending',
    "waiting_on" "WaitingOn" NOT NULL DEFAULT 'us',
    "next_action" TEXT NOT NULL DEFAULT '',
    "internal_note" TEXT NOT NULL DEFAULT '',
    "first_answered_at" DATE,
    "status" "IssueStatus" NOT NULL DEFAULT 'open',
    "status_changed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" DATE,
    "completion_confirmed_at" DATE,
    "completion_confirmed_by_user_id" TEXT,
    "completion_confirm_contact_id" TEXT,
    "completion_confirm_name" TEXT NOT NULL DEFAULT '',
    "completion_confirm_method" TEXT NOT NULL DEFAULT '',
    "completion_confirm_note" TEXT NOT NULL DEFAULT '',
    "exceptional_completion" BOOLEAN NOT NULL DEFAULT false,
    "exceptional_reason" TEXT NOT NULL DEFAULT '',
    "source_import_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,

    CONSTRAINT "issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_assignees" (
    "issue_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,

    CONSTRAINT "issue_assignees_pkey" PRIMARY KEY ("issue_id","user_id")
);

-- CreateTable
CREATE TABLE "issue_tags" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "name_lc" TEXT NOT NULL,

    CONSTRAINT "issue_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_tags_on_issues" (
    "issue_id" TEXT NOT NULL,
    "tag_id" TEXT NOT NULL,

    CONSTRAINT "issue_tags_on_issues_pkey" PRIMARY KEY ("issue_id","tag_id")
);

-- CreateTable
CREATE TABLE "issue_entries" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "kind" "EntryKind" NOT NULL,
    "body" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "withdrawn_at" TIMESTAMP(3),
    "withdrawn_by_id" TEXT,

    CONSTRAINT "issue_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rich_images" (
    "id" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "file_name" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rich_images_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issue_links" (
    "id" TEXT NOT NULL,
    "from_issue_id" TEXT NOT NULL,
    "to_issue_id" TEXT NOT NULL,
    "type" "LinkType" NOT NULL DEFAULT 'related',
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "issue_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidences" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "type" "EvidenceType" NOT NULL,
    "caption" TEXT NOT NULL DEFAULT '',
    "file_name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "storage_key" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hidden_at" TIMESTAMP(3),
    "hidden_by_id" TEXT,
    "hidden_reason" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "evidences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activities" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "actor_id" TEXT,
    "action" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "detail" JSONB,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" TEXT,
    "summary" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "is_exception" BOOLEAN NOT NULL DEFAULT false,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "type" "ReminderType" NOT NULL,
    "reason" TEXT NOT NULL,
    "day_key" TEXT NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'unread',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'preview',
    "strategy" "ImportStrategy" NOT NULL DEFAULT 'fill_blanks',
    "preview" JSONB NOT NULL,
    "report" JSONB,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMP(3),

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_runs" (
    "id" TEXT NOT NULL,
    "job" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "message" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "priorities_key_key" ON "priorities"("key");

-- CreateIndex
CREATE UNIQUE INDEX "issue_types_key_key" ON "issue_types"("key");

-- CreateIndex
CREATE UNIQUE INDEX "sources_key_key" ON "sources"("key");

-- CreateIndex
CREATE UNIQUE INDEX "customers_name_key" ON "customers"("name");

-- CreateIndex
CREATE UNIQUE INDEX "customer_priority_overrides_customer_id_priority_id_key" ON "customer_priority_overrides"("customer_id", "priority_id");

-- CreateIndex
CREATE INDEX "contacts_customer_id_name_idx" ON "contacts"("customer_id", "name");

-- CreateIndex
CREATE INDEX "meeting_batches_customer_id_meeting_on_idx" ON "meeting_batches"("customer_id", "meeting_on");

-- CreateIndex
CREATE INDEX "issues_customer_id_status_idx" ON "issues"("customer_id", "status");

-- CreateIndex
CREATE INDEX "issues_due_on_idx" ON "issues"("due_on");

-- CreateIndex
CREATE INDEX "issues_priority_id_status_idx" ON "issues"("priority_id", "status");

-- CreateIndex
CREATE INDEX "issues_waiting_on_status_idx" ON "issues"("waiting_on", "status");

-- CreateIndex
CREATE INDEX "issues_meeting_batch_id_idx" ON "issues"("meeting_batch_id");

-- CreateIndex
CREATE INDEX "issues_updated_at_idx" ON "issues"("updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "issues_customer_id_customer_seq_key" ON "issues"("customer_id", "customer_seq");

-- CreateIndex
CREATE UNIQUE INDEX "issue_tags_name_lc_key" ON "issue_tags"("name_lc");

-- CreateIndex
CREATE INDEX "issue_entries_issue_id_kind_created_at_idx" ON "issue_entries"("issue_id", "kind", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "rich_images_storage_key_key" ON "rich_images"("storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "issue_links_from_issue_id_to_issue_id_type_key" ON "issue_links"("from_issue_id", "to_issue_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "evidences_storage_key_key" ON "evidences"("storage_key");

-- CreateIndex
CREATE INDEX "evidences_issue_id_idx" ON "evidences"("issue_id");

-- CreateIndex
CREATE INDEX "evidences_created_at_idx" ON "evidences"("created_at");

-- CreateIndex
CREATE INDEX "activities_issue_id_at_idx" ON "activities"("issue_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_at_idx" ON "audit_logs"("entity_type", "entity_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_at_idx" ON "audit_logs"("actor_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_at_idx" ON "audit_logs"("at");

-- CreateIndex
CREATE INDEX "notifications_user_id_status_created_at_idx" ON "notifications"("user_id", "status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_user_id_issue_id_type_day_key_key" ON "notifications"("user_id", "issue_id", "type", "day_key");

-- CreateIndex
CREATE INDEX "job_runs_job_at_idx" ON "job_runs"("job", "at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_priority_overrides" ADD CONSTRAINT "customer_priority_overrides_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "customer_priority_overrides" ADD CONSTRAINT "customer_priority_overrides_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_batches" ADD CONSTRAINT "meeting_batches_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "meeting_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_attendees" ADD CONSTRAINT "meeting_attendees_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_meeting_batch_id_fkey" FOREIGN KEY ("meeting_batch_id") REFERENCES "meeting_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_issue_type_id_fkey" FOREIGN KEY ("issue_type_id") REFERENCES "issue_types"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_priority_id_fkey" FOREIGN KEY ("priority_id") REFERENCES "priorities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_reporter_contact_id_fkey" FOREIGN KEY ("reporter_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issues" ADD CONSTRAINT "issues_completion_confirm_contact_id_fkey" FOREIGN KEY ("completion_confirm_contact_id") REFERENCES "contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_assignees" ADD CONSTRAINT "issue_assignees_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_tags_on_issues" ADD CONSTRAINT "issue_tags_on_issues_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_tags_on_issues" ADD CONSTRAINT "issue_tags_on_issues_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "issue_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_entries" ADD CONSTRAINT "issue_entries_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_from_issue_id_fkey" FOREIGN KEY ("from_issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issue_links" ADD CONSTRAINT "issue_links_to_issue_id_fkey" FOREIGN KEY ("to_issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidences" ADD CONSTRAINT "evidences_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "issues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- 操作日志与时间线只增：数据库层拒绝 UPDATE / DELETE
CREATE OR REPLACE FUNCTION forbid_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_logs_append_only BEFORE UPDATE OR DELETE ON "audit_logs"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
CREATE TRIGGER activities_append_only BEFORE UPDATE OR DELETE ON "activities"
  FOR EACH ROW EXECUTE FUNCTION forbid_mutation();
