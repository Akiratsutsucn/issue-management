-- 新增层级：客户 → 服务项目 → 课题。番号改为同一服务项目内唯一。

CREATE TABLE "service_projects" (
    "id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "status" "CustomerStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "service_projects_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "service_projects_customer_id_name_key" ON "service_projects"("customer_id", "name");
ALTER TABLE "service_projects" ADD CONSTRAINT "service_projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "meeting_batches" ADD COLUMN "service_project_id" TEXT;
ALTER TABLE "issues" ADD COLUMN "service_project_id" TEXT;

-- 存量数据：已有课题或会谈的客户各建一个「默认服务项目」，课题与会谈归入其中
INSERT INTO "service_projects" ("id", "customer_id", "name", "updated_at")
SELECT 'sp' || substr(md5(c."id"), 1, 23), c."id", '默认服务项目', CURRENT_TIMESTAMP
FROM "customers" c
WHERE EXISTS (SELECT 1 FROM "issues" i WHERE i."customer_id" = c."id")
   OR EXISTS (SELECT 1 FROM "meeting_batches" m WHERE m."customer_id" = c."id");

UPDATE "issues" i SET "service_project_id" = sp."id" FROM "service_projects" sp WHERE sp."customer_id" = i."customer_id";
UPDATE "meeting_batches" m SET "service_project_id" = sp."id" FROM "service_projects" sp WHERE sp."customer_id" = m."customer_id";

ALTER TABLE "issues" ALTER COLUMN "service_project_id" SET NOT NULL;

DROP INDEX "issues_customer_id_customer_seq_key";
CREATE UNIQUE INDEX "issues_service_project_id_customer_seq_key" ON "issues"("service_project_id", "customer_seq");
CREATE INDEX "issues_service_project_id_status_idx" ON "issues"("service_project_id", "status");

ALTER TABLE "meeting_batches" ADD CONSTRAINT "meeting_batches_service_project_id_fkey" FOREIGN KEY ("service_project_id") REFERENCES "service_projects"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "issues" ADD CONSTRAINT "issues_service_project_id_fkey" FOREIGN KEY ("service_project_id") REFERENCES "service_projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
