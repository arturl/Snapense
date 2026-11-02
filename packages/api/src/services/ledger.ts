import { z } from "zod";
import type { CollegeExpenseLedger } from "@snapense/shared";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Invalid calendar date");
const optionalDate = z.union([z.literal(""), date]).optional();
const currency = z.string().regex(/^[A-Z]{3}$/);
const positive = z.number().finite().positive();
const fred = z.object({
  rate: positive, requestedDate: date, effectiveDate: date,
  source: z.string().min(1), seriesId: z.string().min(1), sourceUrl: z.string().url(),
  retrievedAt: z.string().datetime({ offset: true }),
}).passthrough();
const conversion = z.discriminatedUnion("method", [
  fred.extend({ method: z.literal("fred") }),
  z.object({ method: z.literal("bank"), rate: positive, effectiveDate: date,
    source: z.literal("Actual USD amount charged by bank"), provider: z.string().optional() }).passthrough(),
]);
const ledgerSchema = z.object({
  version: z.union([z.literal(1), z.literal(2)]),
  expenses: z.array(z.object({
    id: z.string().min(1), beneficiary: z.string().min(1), date,
    merchant: z.string().min(1), amount: positive, currency,
    originalAmount: positive.optional(), originalCurrency: currency.optional(),
    conversion: conversion.optional(), exchangeRate: fred.optional(),
    items: z.array(z.string()), description: z.string().min(1),
    fidelityTransferDate: optionalDate, beneficiaryPaymentDate: optionalDate,
    receiptFileName: z.string().min(1), createdAt: z.string().datetime({ offset: true }),
  }).passthrough()),
}).passthrough().superRefine((ledger, context) => {
  const ids = new Set<string>();
  ledger.expenses.forEach((expense, index) => {
    if (ids.has(expense.id)) context.addIssue({ code: z.ZodIssueCode.custom,
      path: ["expenses", index, "id"], message: "Duplicate expense ID" });
    ids.add(expense.id);
  });
});

function validateLedger(value: unknown): asserts value is CollegeExpenseLedger {
  const result = ledgerSchema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw Object.assign(new Error(`expenses.json validation failed at ${issue.path.join(".") || "root"}: ${issue.message}. Nothing was written.`), { status: 422 });
  }
}

export function parseStoredLedger(content: Buffer): CollegeExpenseLedger {
  let parsed: unknown;
  try { parsed = JSON.parse(content.toString("utf8")); }
  catch { throw Object.assign(new Error("expenses.json contains invalid JSON. Nothing was written."), { status: 422 }); }
  validateLedger(parsed);
  // Return the original object so unrecognized fields survive a read/edit/write.
  return parsed;
}

export function serializeLedger(ledger: CollegeExpenseLedger): Buffer {
  validateLedger(ledger);
  const content = Buffer.from(JSON.stringify(ledger, null, 2) + "\n", "utf8");
  // Validate the exact bytes being uploaded, including JSON serialization effects.
  parseStoredLedger(content);
  return content;
}
