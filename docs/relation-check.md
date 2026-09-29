# Relation check (Task 6) — BLOCKED

**Result: relations do not reliably survive republishing on Strapi 5.55.1.** 2 of 3
integration tests in `test/integration/relations.test.mjs` fail. This is task 6's
gate, per the plan: "Every later task builds on these relations, so the relation
check is the gate."

- Strapi: `5.55.1` (confirmed via `require('@strapi/strapi/package.json').version`
  in the LaunchPad app)
- Node: `v24.16.0`
- App: `STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi`
- Command: `STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi node --test test/integration/relations.test.mjs`
- Database: throwaway SQLite via the harness (`DATABASE_FILENAME=.tmp/maison-test-relations.db`)

## Root cause (confirmed at the database level, not a harness bug)

Strapi 5.55.1's Document Service `publish()` action, **when a published version of
a document already exists ("republishing")**, deletes that published row and
inserts a brand-new row with a new auto-increment id — it does not update the
published row in place. The draft row is untouched and keeps its id across
`update()` calls.

Any relation from *another* content type that was pinned to that document's
`status: 'published'` version (e.g. `stock-level.product` created with
`{ documentId, locale: 'ja', status: 'published' }`) stores a foreign key to the
old row's numeric id in the link table (e.g. `maison_stock_levels_product_lnk`).
Once that row is deleted, the foreign key is left dangling: `populate` silently
resolves it to `null` and relation filters silently match nothing. There is no
error — the data is just gone.

This was verified directly against the SQLite database, independent of the test
file, using `strapi.db.query(uid)` (the raw Query Engine, not the Document
Service) before and after a second `publish()` call on the same product:

```
product rows after create: [
  { id: 1, documentId: 'xwdj3...', locale: 'ja', publishedAt: null },       // draft
  { id: 2, documentId: 'xwdj3...', locale: 'ja', publishedAt: '...T21:01:56.375Z' } // published
]

stock-level.product (populated) BEFORE republish: { id: 2, documentId: 'xwdj3...', ... }  // resolves, points at row 2

# strapi.documents('plugin::maison.product').update({ documentId, locale: 'ja', data: { priceJpy: 2000 } })
product rows after update (draft edit): [
  { id: 1, documentId: 'xwdj3...', locale: 'ja', publishedAt: null },
  { id: 2, documentId: 'xwdj3...', locale: 'ja', publishedAt: '...T21:01:56.375Z' }  // unchanged — update() only touches the draft
]

# strapi.documents('plugin::maison.product').publish({ documentId, locale: 'ja' })  <- REPUBLISH
product rows after REPUBLISH ja: [
  { id: 1, documentId: 'xwdj3...', locale: 'ja', publishedAt: null },
  { id: 3, documentId: 'xwdj3...', locale: 'ja', publishedAt: '...T21:01:56.391Z' }  // row 2 is GONE, row 3 replaces it
]

stock-level.product (populated) AFTER republish: null   // dangling FK to deleted row 2; boutique (never republished) still resolves fine
```

The `maison_stock_levels_product_lnk` join-table row still points at id `2`,
which no longer exists.

This explains all three test failures below — `appointment.boutique` happened to
survive only because that relation was created **without** an explicit `status`
(so it resolved against the boutique's stable draft row, id never recycled), not
because republishing is safe in general. Any relation pinned to a specific
`status: 'published'` target breaks the moment that target is republished, which
is exactly the pattern Tasks 8–11 need (customers request appointments against
already-published boutiques/products, and confirmations, staff can republish a
boutique or product at any time).

## Which assertions failed

- Test 1 *"keeps a stock level linked through a product republish and a new
  locale"* — **fails** at `rows.length === 1` after the product is updated and
  republished in `ja` (before the new `en` locale is even touched). Root cause
  above.
- Test 2 *"keeps an appointment linked when it is published and when its
  boutique is republished"* — the boutique-republish assertion **passes** (see
  root cause above for why), but the final assertion, *"notification survives a
  republish of its appointment"*, **fails** for the identical reason: the
  appointment's published row is replaced on its second `publish()` call, and
  `notification.appointment` (created pinned to `status: 'published'`) goes
  dangling.
- Test 3 *"applies the validation middleware"* — the first `assert.rejects`
  (duplicate stock-level should be rejected) **fails to reject**. This is a
  downstream consequence of Test 1: by the time Test 3 runs, the stock-level
  created in Test 1 has a dangling `product` link, so the middleware's
  `count({ filters: { product: { documentId }, boutique: { documentId } } })`
  finds 0 matches instead of 1, and does not raise "already exists". The other
  two `assert.rejects` in this test (bad `giftOccasions`, bad `openingHours`)
  were not reached because `node:test` stops the test body at the first
  rejected `await`. The validation middleware's own logic (`validateProduct`,
  `validateBoutique`) is exercised and correct in the unit test
  (`test/unit/relations.test.ts` covers `relationDocumentId`; the hours/enum
  validators already have their own passing unit tests from Tasks 3–4) — this
  failure is a consequence of the relation problem, not a new bug in the
  middleware.

So this is **broader** than the brief's anticipated narrower case ("If only the
last assertion fails ... store the appointment's reference on the notification
instead of a relation"): the same failure mode also hits `stock-level.product`,
a plain catalog relation with no draft/publish angle of its own on the
referencing side. A narrower fix limited to notifications would not cover it.

## Full failing output

```
$ STRAPI_APP_DIR=/Users/paul/work/launchpad-fork-latest/strapi node --test test/integration/relations.test.mjs

▶ relations across locales and draft/publish (Strapi 5.55)
  ✖ keeps a stock level linked through a product republish and a new locale (25.417542ms)
  ✖ keeps an appointment linked when it is published and when its boutique is republished (28.946333ms)
  ✖ applies the validation middleware (3.304916ms)
✖ relations across locales and draft/publish (Strapi 5.55) (4188.614291ms)
ℹ tests 3
ℹ suites 1
ℹ pass 0
ℹ fail 3
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 4886.375041

✖ failing tests:

test at test/integration/relations.test.mjs:35:3
✖ keeps a stock level linked through a product republish and a new locale (25.417542ms)
  AssertionError [ERR_ASSERTION]: stock level is still found by product documentId

  0 !== 1

      at TestContext.<anonymous> (file:///Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp/test/integration/relations.test.mjs:55:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Promise.all (index 0)
      at async Suite.run (node:internal/test_runner/test:1771:7)
      at async startSubtestAfterBootstrap (node:internal/test_runner/harness:385:3) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test/integration/relations.test.mjs:60:3
✖ keeps an appointment linked when it is published and when its boutique is republished (28.946333ms)
  AssertionError [ERR_ASSERTION]: notification survives a republish of its appointment

  0 !== 1

      at TestContext.<anonymous> (file:///Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp/test/integration/relations.test.mjs:99:12)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: 0,
    expected: 1,
    operator: 'strictEqual',
    diff: 'simple'
  }

test at test/integration/relations.test.mjs:102:3
✖ applies the validation middleware (3.304916ms)
  AssertionError [ERR_ASSERTION]: Missing expected rejection.
      at async TestContext.<anonymous> (file:///Users/paul/work/plugin-dev/plugins/strapi-store-demo-mcp/test/integration/relations.test.mjs:103:5)
      at async Test.run (node:internal/test_runner/test:1313:7)
      at async Suite.processPendingSubtests (node:internal/test_runner/test:897:7) {
    generatedMessage: false,
    code: 'ERR_ASSERTION',
    actual: undefined,
    expected: /already exists/,
    operator: 'rejects',
    diff: 'simple'
  }
```

## What this means for the decision

Per the plan, I have not switched to a slug-based design, or made any other
design change, on my own. Options for whoever makes the call (not exhaustive):

1. **Slug-based fallback** the spec already describes as an alternative to
   relations for the affected paths, at the cost of the Tasks 8–11 changes the
   brief flags.
2. **Never pin `status: 'published'`** when writing a relation from the tools /
   middleware, and instead always resolve the relation target's current
   published row at read time (e.g. re-look-up by `documentId` rather than
   trusting a stored link) — avoids the dangling FK but changes how Tasks 8–11
   read related data.
3. **Re-establish affected relations after every republish** of a boutique/
   product/appointment (e.g. in an `afterPublish` document-service middleware
   that re-links dependents) — stays relation-based but adds non-trivial
   bookkeeping and a new failure mode (what if the re-link step itself fails
   partway).

I did not implement any of these; the task's instructions were to stop, record
this, and report BLOCKED.
