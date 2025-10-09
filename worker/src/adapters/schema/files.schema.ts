import { pgTable, uuid, varchar, integer, timestamp } from 'drizzle-orm/pg-core';

/**
 * Files table schema (copied from backend for worker adapter)
 */
export const files = pgTable('files', {
  id: uuid('id').primaryKey().defaultRandom(),
  fileName: varchar('file_name', { length: 255 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  size: integer('size').notNull(),
  objectKey: varchar('object_key', { length: 255 }).notNull().unique(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
});

export type File = typeof files.$inferSelect;
export type NewFile = typeof files.$inferInsert;


