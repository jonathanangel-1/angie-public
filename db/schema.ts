import { index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// v3 taste tables. Personal rows only; product search results are never stored.
export const tasteProfiles = sqliteTable('taste_profiles', {
  userId: text('user_id').primaryKey(),
  quizJson: text('quiz_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const purchases = sqliteTable('purchases', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  brand: text('brand').notNull(),
  title: text('title').notNull(),
  slot: text('slot'),
  size: text('size').notNull(),
  status: text('status').notNull(),
  returnReason: text('return_reason'),
  price: real('price'),
  source: text('source').notNull(),
  confidence: real('confidence').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('purchases_user_time_idx').on(table.userId, table.createdAt)]);

export const reactions = sqliteTable('reactions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  brand: text('brand').notNull(),
  title: text('title').notNull(),
  featuresJson: text('features_json').notNull(),
  reaction: text('reaction').notNull(),
  reason: text('reason'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('reactions_user_time_idx').on(table.userId, table.createdAt)]);

// v2 tables (superseded, unused by v3) are kept so no migration drops data.
// v2 fit-first tables. Personal rows are keyed by user_id; the catalog is shared.
// Runtime creation lives in lib/server/db.ts and must match these definitions.
export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  createdAt: integer('created_at').notNull(),
});

export const fitProfiles = sqliteTable('fit_profiles', {
  userId: text('user_id').primaryKey(),
  bodyJson: text('body_json').notNull(),
  referencesJson: text('references_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const fitOutcomes = sqliteTable('fit_outcomes', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  productId: text('product_id'),
  searchId: text('search_id'),
  brand: text('brand').notNull(),
  category: text('category').notNull(),
  size: text('size').notNull(),
  result: text('result').notNull(),
  fit: text('fit').notNull(),
  area: text('area'),
  reason: text('reason'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('fit_outcomes_user_time_idx').on(table.userId, table.createdAt)]);

export const searches = sqliteTable('searches', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  category: text('category'),
  colorName: text('color_name').notNull(),
  featuresJson: text('features_json').notNull(),
  resultIdsJson: text('result_ids_json').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('searches_user_time_idx').on(table.userId, table.createdAt)]);

export const catalogProducts = sqliteTable('catalog_products', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  embedderVersion: text('embedder_version').notNull(),
  dataJson: text('data_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const catalogSizeCharts = sqliteTable('catalog_size_charts', {
  id: text('id').primaryKey(),
  source: text('source').notNull(),
  dataJson: text('data_json').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

// v1 tables below are retained unchanged so a generated migration never drops
// existing history. v2 code does not read or write them.

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  participantName: text('participant_name').notNull(),
  stage: text('stage').notNull().default('questions'),
  startedAt: integer('started_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  completedAt: integer('completed_at'),
});

export const answers = sqliteTable('answers', {
  sessionId: text('session_id').notNull(),
  questionId: text('question_id').notNull(),
  answer: text('answer').notNull(),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.sessionId, table.questionId] }),
  index('answers_session_idx').on(table.sessionId),
]);

export const blindRatings = sqliteTable('blind_ratings', {
  sessionId: text('session_id').notNull(),
  candidateId: text('candidate_id').notNull(),
  rating: text('rating').notNull(),
  reason: text('reason'),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.sessionId, table.candidateId] }),
  index('blind_ratings_session_idx').on(table.sessionId),
]);

export const events = sqliteTable('events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  type: text('type').notNull(),
  payload: text('payload'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('events_session_time_idx').on(table.sessionId, table.createdAt)]);

export const rankingFreezes = sqliteTable('ranking_freezes', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  version: text('version').notNull(),
  createdAt: integer('created_at').notNull(),
  answersJson: text('answers_json').notNull(),
  baselineJson: text('baseline_json').notNull(),
  adjustedJson: text('adjusted_json').notNull(),
  auditJson: text('audit_json').notNull(),
  integrityHash: text('integrity_hash').notNull(),
  blindLabelsSeen: integer('blind_labels_seen').notNull().default(0),
});

export const stylistFeedback = sqliteTable('stylist_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  request: text('request').notNull(),
  lookId: text('look_id').notNull(),
  reaction: text('reaction').notNull(),
  itemIdsJson: text('item_ids_json').notNull(),
  targetItemIdsJson: text('target_item_ids_json').notNull(),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('stylist_feedback_session_time_idx').on(table.sessionId, table.createdAt)]);

export const inspirationRecommendations = sqliteTable('inspiration_recommendations', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  storageKey: text('storage_key').notNull(),
  imageType: text('image_type').notNull(),
  imageHash: text('image_hash').notNull(),
  note: text('note'),
  styleBriefJson: text('style_brief_json').notNull(),
  editsJson: text('edits_json').notNull(),
  sourcesJson: text('sources_json').notNull(),
  model: text('model').notNull(),
  searchMode: text('search_mode').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('inspiration_recommendations_session_time_idx').on(table.sessionId, table.createdAt)]);

export const inspirationFeedback = sqliteTable('inspiration_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  recommendationId: text('recommendation_id').notNull(),
  editId: text('edit_id').notNull(),
  reaction: text('reaction').notNull(),
  targetItemIdsJson: text('target_item_ids_json').notNull(),
  note: text('note'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('inspiration_feedback_session_recommendation_time_idx').on(table.sessionId, table.recommendationId, table.createdAt),
  uniqueIndex('inspiration_feedback_once_idx').on(table.sessionId, table.recommendationId, table.editId),
]);

export const preferenceSignals = sqliteTable('preference_signals', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  recommendationId: text('recommendation_id').notNull(),
  featureType: text('feature_type').notNull(),
  featureValue: text('feature_value').notNull(),
  weightDelta: real('weight_delta').notNull(),
  reaction: text('reaction').notNull(),
  targetItemId: text('target_item_id'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('preference_signals_session_feature_idx').on(table.sessionId, table.featureType, table.featureValue)]);

export const recommendationCandidates = sqliteTable('recommendation_candidates', {
  sessionId: text('session_id').notNull(),
  recommendationId: text('recommendation_id').notNull(),
  catalogId: text('catalog_id').notNull(),
  productSnapshotJson: text('product_snapshot_json').notNull(),
  scoreBreakdownJson: text('score_breakdown_json').notNull(),
  vetoesJson: text('vetoes_json').notNull(),
  score: real('score').notNull(),
  shown: integer('shown').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  primaryKey({ columns: [table.sessionId, table.recommendationId, table.catalogId] }),
  index('recommendation_candidates_session_time_idx').on(table.sessionId, table.createdAt),
]);

export const outcomeEvents = sqliteTable('outcome_events', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  sessionId: text('session_id').notNull(),
  recommendationId: text('recommendation_id').notNull(),
  editId: text('edit_id'),
  catalogId: text('catalog_id').notNull(),
  eventType: text('event_type').notNull(),
  reason: text('reason'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('outcome_events_session_catalog_time_idx').on(table.sessionId, table.catalogId, table.createdAt)]);

export const evaluationRuns = sqliteTable('evaluation_runs', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull(),
  pipelineVersion: text('pipeline_version').notNull(),
  fixtureVersion: text('fixture_version').notNull(),
  metricsJson: text('metrics_json').notNull(),
  passed: integer('passed').notNull(),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('evaluation_runs_session_time_idx').on(table.sessionId, table.createdAt)]);
