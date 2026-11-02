import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStoredLedger, serializeLedger } from "./ledger.js";
import type { CollegeExpenseLedger } from "@snapense/shared";
import express from "express";
import { request } from "node:http";
import { collegeRouter } from "../routes/college.js";

const fixture: CollegeExpenseLedger = {
  version: 2,
  expenses: [{
    id: "expense-1", beneficiary: "Test beneficiary", date: "2026-10-01", merchant: "Shop",
    amount: 25, currency: "USD", originalAmount: 25, originalCurrency: "USD",
    items: ["Books"], description: "Books for school", receiptFileName: "receipt.jpg",
    createdAt: "2026-10-02T12:00:00.000Z",
  }],
};

test("ledger serialization preserves all entries and unrecognized fields", () => {
  const ledger = { ...structuredClone(fixture), notes: { keep: "all data" } };
  Object.assign(ledger.expenses[0], { extra: { nested: [1, "two"] } });
  ledger.expenses.push({ ...ledger.expenses[0], id: "expense-2" });
  assert.deepEqual(parseStoredLedger(serializeLedger(ledger)), ledger);
});

test("ledger validation rejects corrupt JSON, duplicate IDs, missing fields, and invalid financial data", () => {
  assert.throws(() => parseStoredLedger(Buffer.from('{"version":2,')), /invalid JSON/);
  for (const change of [
    { amount: NaN }, { amount: Infinity }, { amount: -1 }, { date: "2026-02-30" },
    { beneficiaryPaymentDate: "2026-02-30" }, { currency: "" }, { receiptFileName: undefined },
    { items: "not an array" },
  ]) {
    const ledger = structuredClone(fixture);
    Object.assign(ledger.expenses[0], change);
    assert.throws(() => serializeLedger(ledger), /validation failed/);
  }
  const duplicate = structuredClone(fixture);
  duplicate.expenses.push({ ...duplicate.expenses[0] });
  assert.throws(() => serializeLedger(duplicate), /Duplicate expense ID/);
});

test("expense edits validate the complete ledger and preserve unrelated records", async (t) => {
  let ledger = structuredClone(fixture);
  let uploads = 0;
  let conflict = false;
  let corrupt = false;
  let fredRequests = 0;
  t.mock.method(globalThis, "fetch", async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (url === "https://graph.microsoft.com/v1.0/me/drive/items/folder") return Response.json({ folder: {} });
    if (url === "https://graph.microsoft.com/v1.0/me/drive/items/folder:/expenses.json") return Response.json({ id: "ledger", eTag: '"version-1"' });
    if (url === "https://graph.microsoft.com/v1.0/me/drive/items/folder:/expenses.json:/content" && !init?.method) {
      return new Response(corrupt ? "not JSON" : JSON.stringify(ledger));
    }
    if (url === "https://graph.microsoft.com/v1.0/me/drive/items/ledger/content" && init?.method === "PUT") {
      assert.equal(new Headers(init.headers).get("If-Match"), '"version-1"');
      if (conflict) return new Response("Version changed", { status: 412 });
      ledger = JSON.parse(Buffer.from(init.body as Uint8Array).toString("utf8"));
      uploads++;
      return Response.json({ id: "ledger" });
    }
    if (url.startsWith("https://api.stlouisfed.org/")) fredRequests++;
    throw new Error(`Unexpected external request in test: ${new URL(url).pathname}`);
  });
  const app = express();
  app.use(express.json());
  app.use(collegeRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");

  async function patch(body: unknown, id = "expense-1", method = "PATCH") {
    return new Promise<{ status: number; body: any }>((resolve, reject) => {
      const req = request({ hostname: "127.0.0.1", port: (address as { port: number }).port,
        path: `/api/529/ledger/folder/expense/${id}`, method,
        headers: { Authorization: "Bearer test", "Content-Type": "application/json", "Content-Length": Buffer.byteLength(JSON.stringify(body)) } }, (res) => {
        let content = "";
        res.on("data", (chunk) => { content += chunk; });
        res.on("end", () => resolve({ status: res.statusCode!, body: JSON.parse(content) }));
      });
      req.on("error", reject);
      req.end(JSON.stringify(body));
    });
  }
  function edit(changes = {}) {
    return {
      expectedExpense: structuredClone(ledger.expenses[0]),
      draft: { id: "expense-1", sourceFileId: "ignored", originalName: "receipt.jpg", status: "success",
        date: "2026-10-03", merchant: "New shop", amount: "50", currency: "USD", usdAmount: "99999",
        items: [" New books "], description: "Corrected purchase", conversionMethod: "none",
        fidelityTransferDate: "2026-10-04", beneficiaryPaymentDate: "", ...changes },
    };
  }
  function reset() {
    ledger = structuredClone(fixture); uploads = 0; conflict = false; corrupt = false; fredRequests = 0;
  }
  try {
    await t.test("replaces the matching record, keeps receipt identity and all other data, and computes USD on the server", async () => {
      reset();
      Object.assign(ledger, { customTopLevel: "preserved" });
      Object.assign(ledger.expenses[0], { customField: "preserved" });
      ledger.expenses.push({ ...fixture.expenses[0], id: "unrelated" });
      const untouched = structuredClone(ledger.expenses[1]);
      const result = await patch(edit());
      assert.equal(result.status, 200);
      assert.equal(uploads, 1);
      assert.equal(ledger.expenses.length, 2);
      assert.deepEqual(ledger.expenses[1], untouched);
      assert.equal((ledger as any).customTopLevel, "preserved");
      assert.equal((ledger.expenses[0] as any).customField, "preserved");
      assert.equal(ledger.expenses[0].receiptFileName, fixture.expenses[0].receiptFileName);
      assert.equal(ledger.expenses[0].createdAt, fixture.expenses[0].createdAt);
      assert.equal(ledger.expenses[0].amount, 50);
      assert.equal(ledger.expenses[0].date, "2026-10-03");
      assert.deepEqual(ledger.expenses[0].items, ["New books"]);
    });
    await t.test("bank conversion saves the actual USD charge and audit information", async () => {
      reset();
      const result = await patch(edit({ currency: "GBP", amount: "20", usdAmount: "26", conversionMethod: "bank", bankProvider: "Test card", bankEffectiveDate: "2026-10-04" }));
      assert.equal(result.status, 200);
      assert.equal(ledger.expenses[0].amount, 26);
      assert.equal(ledger.expenses[0].originalAmount, 20);
      assert.equal(ledger.expenses[0].conversion?.rate, 1.3);
      assert.equal(ledger.expenses[0].conversion?.method, "bank");
    });
    await t.test("description-only editing preserves the recorded FRED conversion", async () => {
      reset();
      Object.assign(ledger.expenses[0], { originalAmount: 20, originalCurrency: "GBP", amount: 26,
        conversion: { method: "fred", rate: 1.3, requestedDate: "2026-10-01", effectiveDate: "2026-10-01",
          source: "Federal Reserve Board H.10 via FRED", seriesId: "DEXUSUK", sourceUrl: "https://fred.stlouisfed.org/series/DEXUSUK", retrievedAt: "2026-10-02T12:00:00.000Z" } });
      const result = await patch(edit({ date: "2026-10-01", amount: "20", currency: "GBP", conversionMethod: "fred" }));
      assert.equal(result.status, 200);
      assert.equal(ledger.expenses[0].amount, 26);
      assert.equal(fredRequests, 0);
    });
    await t.test("invalid inputs and a corrupt existing ledger cause no upload", async () => {
      for (const changes of [{ amount: "-5" }, { date: "2026-02-30" }, { items: "bad" }, { beneficiaryPaymentDate: "2026-02-30" }, { merchant: null }]) {
        reset();
        const result = await patch(edit(changes));
        assert.ok([400, 422].includes(result.status));
        assert.equal(uploads, 0);
      }
      reset(); corrupt = true;
      assert.equal((await patch(edit())).status, 422);
      assert.equal(uploads, 0);
    });
    await t.test("stale editors and concurrent writes fail without replacing the ledger", async () => {
      reset();
      const body = edit();
      ledger.expenses[0].description = "Changed by another session";
      assert.equal((await patch(body)).status, 409);
      assert.equal(uploads, 0);
      reset(); conflict = true;
      assert.equal((await patch(edit())).status, 409);
      assert.equal(uploads, 0);
    });
    await t.test("deletion removes only the requested entry and retains unrelated JSON data", async () => {
      reset();
      Object.assign(ledger, { notes: { keep: "preserved" } });
      ledger.expenses.push({ ...fixture.expenses[0], id: "unrelated" });
      const other = structuredClone(ledger.expenses[1]);
      const result = await patch({ expectedExpense: ledger.expenses[0] }, "expense-1", "DELETE");
      assert.equal(result.status, 200);
      assert.deepEqual(result.body, { deletedId: "expense-1" });
      assert.deepEqual(ledger.expenses, [other]);
      assert.deepEqual((ledger as any).notes, { keep: "preserved" });
      assert.equal(uploads, 1);
      // The fetch mock rejects every request except metadata, ledger read, and ledger write.
      // A receipt delete or other OneDrive mutation would make this test fail.
      const last = await patch({ expectedExpense: other }, "unrelated", "DELETE");
      assert.equal(last.status, 200);
      assert.deepEqual(ledger.expenses, []);
      assert.equal(ledger.version, 2);
    });
    await t.test("invalid, stale, missing, corrupt, and conflicting deletes never overwrite the ledger", async () => {
      reset();
      assert.equal((await patch({}, "expense-1", "DELETE")).status, 400);
      assert.equal((await patch({ expectedExpense: { id: "missing" } }, "missing", "DELETE")).status, 404);
      const expectedExpense = structuredClone(ledger.expenses[0]);
      ledger.expenses[0].description = "Changed in another session";
      assert.equal((await patch({ expectedExpense }, "expense-1", "DELETE")).status, 409);
      assert.equal(uploads, 0);
      reset(); conflict = true;
      assert.equal((await patch({ expectedExpense: ledger.expenses[0] }, "expense-1", "DELETE")).status, 409);
      assert.equal(uploads, 0);
      reset(); corrupt = true;
      assert.equal((await patch({ expectedExpense: ledger.expenses[0] }, "expense-1", "DELETE")).status, 422);
      assert.equal(uploads, 0);
    });
    await t.test("missing IDs are rejected and the old dates-only request still works", async () => {
      reset();
      assert.equal((await patch(edit(), "missing")).status, 404);
      assert.equal(uploads, 0);
      const result = await patch({ fidelityTransferDate: "2026-10-05", beneficiaryPaymentDate: "" });
      assert.equal(result.status, 200);
      assert.equal(ledger.expenses[0].fidelityTransferDate, "2026-10-05");
      assert.equal(ledger.expenses[0].description, fixture.expenses[0].description);
    });
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
