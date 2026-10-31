CREATE INDEX "orders_placed_idx" ON "orders" USING btree ("placed_at");--> statement-breakpoint
CREATE INDEX "audit_log_at_idx" ON "audit_log" USING btree ("at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "customers_created_idx" ON "customers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "journal_entries_kind_created_idx" ON "journal_entries" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "automation_runs_started_idx" ON "automation_runs" USING btree ("created_at");