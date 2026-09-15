-- Recoverable cleanup, approved 2026-08-31. No rows or original values are deleted.
-- These three recommendation IDs are verified assistant QA, not Angie feedback.
-- The two timestamp-qualified live reactions have unknown authorship and predate
-- explicit confirmation. Hold them aside rather than attribute them to Angie.
-- Historical events remain unchanged as the original audit trail.
INSERT OR IGNORE INTO sessions (id, participant_name, stage, started_at, updated_at)
VALUES ('angie-qa-legacy-v1', 'Archived assistant QA', 'archive', unixepoch() * 1000, unixepoch() * 1000);
--> statement-breakpoint
INSERT OR IGNORE INTO sessions (id, participant_name, stage, started_at, updated_at)
VALUES ('angie-review-legacy-v1', 'Unattributed legacy reactions', 'archive', unixepoch() * 1000, unixepoch() * 1000);
--> statement-breakpoint
UPDATE inspiration_recommendations SET session_id = 'angie-qa-legacy-v1'
WHERE session_id = 'angie-v1' AND id IN (
  '04e6bb17-6297-45eb-8f16-5256d79cc9f5',
  '95abe3bc-14e7-40e5-aba8-9835e657a944',
  '92410e83-6de8-443f-b2bd-c6a1e815786e'
);
--> statement-breakpoint
UPDATE inspiration_feedback SET session_id = 'angie-qa-legacy-v1'
WHERE session_id = 'angie-v1' AND recommendation_id IN (
  '04e6bb17-6297-45eb-8f16-5256d79cc9f5',
  '95abe3bc-14e7-40e5-aba8-9835e657a944'
);
--> statement-breakpoint
UPDATE preference_signals SET session_id = 'angie-qa-legacy-v1'
WHERE session_id = 'angie-v1' AND recommendation_id IN (
  '04e6bb17-6297-45eb-8f16-5256d79cc9f5',
  '95abe3bc-14e7-40e5-aba8-9835e657a944'
);
--> statement-breakpoint
UPDATE inspiration_feedback SET session_id = 'angie-review-legacy-v1'
WHERE session_id = 'angie-v1'
  AND recommendation_id = '4d4ec947-8e25-46bd-aca7-0f988a26eec0'
  AND ((edit_id = 'edit-1' AND created_at = 1788158045268)
    OR (edit_id = 'edit-2' AND created_at = 1788158050644));
--> statement-breakpoint
UPDATE preference_signals SET session_id = 'angie-review-legacy-v1'
WHERE session_id = 'angie-v1'
  AND recommendation_id = '4d4ec947-8e25-46bd-aca7-0f988a26eec0'
  AND created_at IN (1788158045268, 1788158050644);
