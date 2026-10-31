CREATE INDEX "deposits_requested_idx" ON "deposits" USING btree ("requested_at");--> statement-breakpoint
CREATE INDEX "referrals_attributed_idx" ON "referrals" USING btree ("attributed_at");--> statement-breakpoint
CREATE INDEX "tickets_created_idx" ON "tickets" USING btree ("created_at");