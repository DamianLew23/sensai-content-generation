CREATE TABLE "llm_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"attempt" integer DEFAULT 1 NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"prompt_tokens" integer DEFAULT 0 NOT NULL,
	"completion_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" text DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipeline_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"template_id" uuid NOT NULL,
	"template_version" integer NOT NULL,
	"input" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"current_step_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_key" text NOT NULL,
	"step_order" integer NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"requires_approval" boolean DEFAULT false NOT NULL,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pipeline_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"steps_def" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "tool_cache" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tool" text NOT NULL,
	"method" text NOT NULL,
	"params_hash" text NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tool_calls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"step_id" uuid NOT NULL,
	"tool" text NOT NULL,
	"method" text NOT NULL,
	"params_hash" text NOT NULL,
	"from_cache" boolean DEFAULT false NOT NULL,
	"cost_usd" text DEFAULT '0' NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_run_id_pipeline_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "llm_calls" ADD CONSTRAINT "llm_calls_step_id_pipeline_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."pipeline_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_runs" ADD CONSTRAINT "pipeline_runs_template_id_pipeline_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."pipeline_templates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pipeline_steps" ADD CONSTRAINT "pipeline_steps_run_id_pipeline_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_run_id_pipeline_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."pipeline_runs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_calls" ADD CONSTRAINT "tool_calls_step_id_pipeline_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."pipeline_steps"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "llm_calls_run_idx" ON "llm_calls" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "llm_calls_step_idx" ON "llm_calls" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_project_idx" ON "pipeline_runs" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "pipeline_runs_status_idx" ON "pipeline_runs" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_steps_run_order_unique" ON "pipeline_steps" USING btree ("run_id","step_order");--> statement-breakpoint
CREATE INDEX "pipeline_steps_status_idx" ON "pipeline_steps" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "pipeline_templates_name_version_unique" ON "pipeline_templates" USING btree ("name","version");--> statement-breakpoint
CREATE UNIQUE INDEX "tool_cache_key_unique" ON "tool_cache" USING btree ("tool","method","params_hash");--> statement-breakpoint
CREATE INDEX "tool_cache_expiry_idx" ON "tool_cache" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tool_calls_run_idx" ON "tool_calls" USING btree ("run_id");