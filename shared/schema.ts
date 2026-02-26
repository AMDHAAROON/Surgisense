import { pgTable, text, serial, integer, timestamp, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const procedures = pgTable("procedures", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
});

export const stages = pgTable("stages", {
  id: serial("id").primaryKey(),
  procedureId: integer("procedure_id").notNull(),
  name: text("name").notNull(),
  requiredTool: text("required_tool").notNull(), // e.g. "scalpel", "artery_forceps"
  order: integer("order").notNull(),
});

export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export const testResults = pgTable("test_results", {
  id: serial("id").primaryKey(),
  procedureId: integer("procedure_id").notNull(),
  marks: integer("marks").notNull(),
  totalStages: integer("total_stages").notNull(),
  completedAt: timestamp("completed_at").defaultNow(),
});

export const insertProcedureSchema = createInsertSchema(procedures).omit({ id: true });
export const insertStageSchema = createInsertSchema(stages).omit({ id: true });
export const insertContactMessageSchema = createInsertSchema(contactMessages).omit({ id: true, createdAt: true });
export const insertTestResultSchema = createInsertSchema(testResults).omit({ id: true, completedAt: true });

export type Procedure = typeof procedures.$inferSelect;
export type InsertProcedure = z.infer<typeof insertProcedureSchema>;

export type Stage = typeof stages.$inferSelect;
export type InsertStage = z.infer<typeof insertStageSchema>;

export type ContactMessage = typeof contactMessages.$inferSelect;
export type InsertContactMessage = z.infer<typeof insertContactMessageSchema>;

export type TestResult = typeof testResults.$inferSelect;
export type InsertTestResult = z.infer<typeof insertTestResultSchema>;
