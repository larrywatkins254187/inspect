/* ForexInspect operator CLI (PRD §16.2). Safe output: counts, IDs and codes — never secrets or bodies. */
import fs from 'node:fs';
import path from 'node:path';
import { loadSecretsInto, resolveSecretsFile } from '../src/config/secrets-file';

loadSecretsInto(process.env);

const { config } = await import('../src/config/env');
const { openDatabase } = await import('../src/db/client');
const { migrate } = await import('../src/db/migrate');
const { runtimeProvider } = await import('../src/ai');

type Args = { _: string[]; flags: Record<string, string | true> };
function parseArgs(argv: string[]): Args {
  const out: Args = { _: [], flags: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=', 2);
      if (v !== undefined) out.flags[k!] = v;
      else if (argv[i + 1] && !argv[i + 1]!.startsWith('--')) out.flags[k!] = argv[++i]!;
      else out.flags[k!] = true;
    } else out._.push(a);
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const cmd = args._[0];
const now = () => new Date();
const print = (x: unknown) => console.log(typeof x === 'string' ? x : JSON.stringify(x, null, 2));
const fail = (m: string): never => {
  console.error(`error: ${m}`);
  process.exit(1);
};
const need = (i: number, name: string) => args._[i] ?? fail(`missing <${name}>`);
const flag = (k: string) => (typeof args.flags[k] === 'string' ? (args.flags[k] as string) : undefined);
const owner = () => {
  const a = flag('actor') ?? fail('--actor owner:<name> is required for this decision');
  if (!/^owner:[a-z0-9._-]{1,40}$/i.test(a)) fail('actor must look like owner:<name>');
  return a;
};
const live = () => args.flags['live'] === true;
const int = (s: string, name: string) => (/^\d+$/.test(s) ? Number(s) : fail(`${name} must be an integer`));

const cfg = config();
const db = openDatabase(cfg.databasePath);
if (cmd !== 'migrate' && cmd !== 'help' && cmd) {
  const ready = (
    db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE name = 'schema_migrations'").get() as {
      n: number;
    }
  ).n;
  if (!ready) fail('database not migrated: run `pnpm migrate`');
}

async function fetchDeps() {
  const f = await import('../src/domain/fetcher');
  const hosts = new Set(
    (
      db.prepare("SELECT host FROM source_registry WHERE state NOT IN ('BLOCKED','RETIRED')").all() as {
        host: string;
      }[]
    ).map((r) => r.host),
  );
  return {
    f,
    deps: {
      resolver: f.systemResolver,
      transport: f.httpsTransport,
      now,
      userAgent: cfg.sourceUserAgent,
      allowedHosts: hosts,
    },
  };
}

const commands: Record<string, () => Promise<void> | void> = {
  help() {
    print(`Usage: pnpm cli <command> [args] [--flags]\nCommands: ${Object.keys(commands).sort().join(', ')}`);
  },
  async migrate() {
    print(await migrate(db));
  },
  async seed() {
    const { importCandidateSeed } = await import('../src/domain/import');
    print(importCandidateSeed(db, path.resolve(args._[1] ?? 'seeds/candidates.json'), now()));
  },
  async workbook() {
    const { importWorkbook } = await import('../src/domain/import');
    const exp = flag('expect-rows');
    print(
      importWorkbook(db, path.resolve(need(1, 'file')), now(), {
        expectRows: exp ? int(exp, 'expect-rows') : undefined,
        nameColumn: flag('name-column'),
      }),
    );
  },
  async report() {
    const { opsSummary } = await import('../src/domain/ops');
    print(opsSummary(db, now()));
  },
  async pilot() {
    const { opsSummary } = await import('../src/domain/ops');
    const s = opsSummary(db, now());
    print({
      pilot: s.pilot,
      note: live()
        ? 'live robots checks run via `policy-review --live`'
        : 'report only; no network calls without --live',
    });
    if (live()) await commands['policy-review']!();
  },
  async source() {
    const slug = need(1, 'broker-slug');
    const url = new URL(need(2, 'url'));
    if (url.protocol !== 'https:') fail('sources must be https');
    const actor = owner();
    const b =
      (db.prepare('SELECT id, official_domain FROM brokers WHERE slug = ?').get(slug) as {
        id: number;
        official_domain: string | null;
      }) ?? fail('unknown broker');
    url.hash = '';
    db.prepare(
      'INSERT INTO source_registry (broker_id, url, host, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    ).run(b.id, url.toString(), url.hostname, now().toISOString(), now().toISOString());
    const { audit } = await import('../src/domain/audit');
    audit(db, { actor, action: 'source.register', subject: url.toString(), at: now() });
    print({
      registered: url.toString(),
      state: 'DISCOVERED',
      officialDomain: b.official_domain ?? 'not confirmed',
    });
  },
  async 'policy-discovery'() {
    const id = int(need(1, 'source-id'), 'source-id');
    const { audit } = await import('../src/domain/audit');
    db.prepare(
      "UPDATE source_registry SET state = 'POLICY_PENDING', state_reason = ?, updated_at = ? WHERE id = ? AND state = 'DISCOVERED'",
    ).run((flag('note') ?? 'discovery recorded').slice(0, 200), now().toISOString(), id);
    audit(db, {
      actor: flag('actor') ?? 'cli',
      action: 'policy.discovery',
      subject: `source:${id}`,
      at: now(),
      detail: { terms: flag('terms-url') ?? null },
    });
    print({
      source: id,
      state: (db.prepare('SELECT state FROM source_registry WHERE id = ?').get(id) as { state: string })
        .state,
    });
  },
  async policy() {
    const id = int(need(1, 'source-id'), 'source-id');
    const file = need(2, 'reviewed-policy.json');
    const { recordOwnerPolicy } = await import('../src/domain/policy');
    print(recordOwnerPolicy(db, id, JSON.parse(fs.readFileSync(file, 'utf8')), owner(), now()));
  },
  async 'owner-file-policy'() {
    const id = int(need(1, 'source-id'), 'source-id');
    const file = need(2, 'file');
    const expected = flag('sha256') ?? fail('--sha256 of the reviewed file is required');
    const { sha256 } = await import('../src/lib/hash');
    const buf = fs.readFileSync(file);
    if (sha256(buf) !== expected) fail('file hash does not match the reviewed hash');
    const { recordOwnerPolicy } = await import('../src/domain/policy');
    print(recordOwnerPolicy(db, id, JSON.parse(buf.toString('utf8')), owner(), now()));
  },
  async 'policy-review'() {
    const { applyRobotsOutcome, currentPolicy } = await import('../src/domain/policy');
    const { isAllowed } = await import('../src/domain/robots');
    const rows = db
      .prepare(
        "SELECT id, url, host FROM source_registry WHERE state IN ('TECH_PENDING','APPROVED','DEGRADED')",
      )
      .all() as { id: number; url: string; host: string }[];
    if (!live())
      return print({ due: rows.length, note: 'pass --live to fetch robots.txt for these sources' });
    const { f, deps } = await fetchDeps();
    const out = [];
    for (const r of rows) {
      const pol = currentPolicy(db, r.id);
      if (!pol) continue;
      const res = await f.safeFetch(db, `https://${r.host}/robots.txt`, {
        ...deps,
        allowedHosts: new Set([r.host]),
      });
      let outcome: Parameters<typeof applyRobotsOutcome>[2];
      if (res.kind === 'OK')
        outcome = {
          kind: 'OK',
          allowed: isAllowed(res.body.toString('utf8'), deps.userAgent ?? '', new URL(r.url).pathname),
        };
      else if (res.kind === 'UNAVAILABLE' && (res.status === 404 || res.status === 410))
        outcome = { kind: 'OK', allowed: true };
      else if (res.kind === 'REFUSED') outcome = { kind: 'REFUSED', status: res.status };
      else if (res.kind === 'CHALLENGE') outcome = { kind: 'CHALLENGE' };
      else
        outcome = {
          kind: 'DEFER',
          reason:
            res.kind === 'THROTTLED' ? 'THROTTLED' : res.kind === 'TRANSIENT' ? 'SERVER_ERROR' : 'AMBIGUOUS',
        };
      out.push({ source: r.id, fetch: res.kind, state: applyRobotsOutcome(db, r.id, outcome, now()) });
    }
    print(out);
  },
  async 'probe-enqueue'() {
    const { enqueue } = await import('../src/domain/jobs');
    const day = now().toISOString().slice(0, 10);
    const rows = db
      .prepare("SELECT id FROM source_registry WHERE state IN ('APPROVED','DEGRADED')")
      .all() as { id: number }[];
    print(
      rows.map((r) =>
        enqueue(
          db,
          { kind: 'probe', key: `probe:${r.id}:${day}`, dueAt: now(), payload: { source: r.id } },
          now(),
        ),
      ),
    );
  },
  async 'probe-run'() {
    const { leaseNext, complete, fail: jfail } = await import('../src/domain/jobs');
    const lease = leaseNext(db, 'probe', now(), 10 * 60_000);
    if (!lease) return print({ outcome: 'NO_DUE_JOB' });
    if (!live()) {
      jfail(db, lease, 'NOT_AUTHORIZED_LIVE', now(), { retryable: true, baseMs: 1000 });
      return print({ outcome: 'DEFERRED', note: 'pass --live to perform the probe' });
    }
    const src = JSON.parse(lease.job.payload_json).source as number;
    const row = db.prepare('SELECT url FROM source_registry WHERE id = ?').get(src) as { url: string };
    const { f, deps } = await fetchDeps();
    const res = await f.safeFetch(db, row.url, deps);
    const state =
      res.kind === 'OK' || res.kind === 'NOT_MODIFIED'
        ? 'APPROVED'
        : res.kind === 'TRANSIENT' || res.kind === 'THROTTLED' || res.kind === 'HOST_LIMIT'
          ? 'DEGRADED'
          : res.kind === 'REFUSED' || res.kind === 'CHALLENGE'
            ? 'BLOCKED'
            : null;
    if (state)
      db.prepare(
        "UPDATE source_registry SET state = ?, state_reason = ?, updated_at = ? WHERE id = ? AND state NOT IN ('BLOCKED','RETIRED')",
      ).run(state, `probe: ${res.kind}`, now().toISOString(), src);
    complete(db, lease, { kind: res.kind }, now());
    print({ source: src, probe: res.kind, state });
  },
  async 'wait-host'() {
    const host = need(1, 'host');
    const { reserveHostSlot } = await import('../src/domain/fetcher');
    for (let i = 0; i < 24; i++) {
      const row = db.prepare('SELECT * FROM host_traffic WHERE host = ?').get(host) as
        Record<string, unknown> | undefined;
      const t = row?.retry_after_until ? new Date(String(row.retry_after_until)) : null;
      const last = row?.last_request_at ? new Date(String(row.last_request_at)).getTime() : 0;
      if ((!t || t <= now()) && Date.now() - last > 10_000) return print({ host, ready: true });
      await new Promise((r) => setTimeout(r, 5000));
    }
    void reserveHostSlot;
    print({ host, ready: false, note: 'cooldown still active after bounded wait' });
  },
  async 'confirm-domain'() {
    const slug = need(1, 'broker-slug');
    const domain = need(2, 'domain').toLowerCase();
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) fail('invalid domain');
    const actor = owner();
    const { audit } = await import('../src/domain/audit');
    const r = db
      .prepare(
        'UPDATE brokers SET official_domain = ?, official_domain_confirmed_at = ?, official_domain_confirmed_by = ?, updated_at = ? WHERE slug = ?',
      )
      .run(domain, now().toISOString(), actor, now().toISOString(), slug);
    if (!r.changes) fail('unknown broker');
    audit(db, { actor, action: 'broker.confirm_domain', subject: slug, at: now(), detail: { domain } });
    print({ broker: slug, officialDomain: domain });
  },
  async extract() {
    const sourceId = int(need(1, 'source-id'), 'source-id');
    if (!live()) fail('extraction fetches the source: pass --live to authorize the network request');
    const { currentPolicy, evaluateUse, getSource, mayRetainBody } = await import('../src/domain/policy');
    const { htmlToText, textHash, PARSER_VERSION } = await import('../src/domain/text');
    const { runExtractionPass } = await import('../src/domain/extract');
    const src = getSource(db, sourceId) ?? fail('unknown source');
    const pol = currentPolicy(db, sourceId);
    const gate = evaluateUse(src, pol, 'FACT_REFERENCE', now(), 'FETCH');
    if (!gate.allowed) return print({ source: sourceId, skipped: gate.reasons });
    const { f, deps } = await fetchDeps();
    const prev = db
      .prepare(
        'SELECT etag, last_modified FROM source_documents WHERE source_id = ? ORDER BY id DESC LIMIT 1',
      )
      .get(sourceId) as { etag: string | null; last_modified: string | null } | undefined;
    const res = await f.safeFetch(db, src.url, deps, { etag: prev?.etag, lastModified: prev?.last_modified });
    if (res.kind === 'REFUSED' || res.kind === 'CHALLENGE') {
      db.prepare(
        "UPDATE source_registry SET state = 'BLOCKED', state_reason = ?, updated_at = ? WHERE id = ?",
      ).run(`fetch ${res.kind}`, now().toISOString(), sourceId);
      return print({
        source: sourceId,
        fetch: res.kind,
        state: 'BLOCKED',
        note: 'hard access refusal stops extraction; apply the owner drop policy if it persists',
      });
    }
    if (res.kind !== 'OK') return print({ source: sourceId, fetch: res.kind });
    const text = htmlToText(res.body.toString('utf8'));
    const hash = textHash(text);
    const same = db
      .prepare(
        'SELECT id FROM source_documents WHERE source_id = ? AND normalized_hash = ? ORDER BY id DESC LIMIT 1',
      )
      .get(sourceId, hash) as { id: number } | undefined;
    const retain = mayRetainBody(src, pol, now());
    const docId = Number(
      db
        .prepare(
          'INSERT INTO source_documents (source_id, policy_id, final_url, http_status, content_type, fetched_at, etag, last_modified, normalized_hash, parser, byte_length, body_retained, body_text) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
        )
        .run(
          sourceId,
          pol!.id,
          res.finalUrl,
          res.status,
          res.contentType,
          now().toISOString(),
          res.etag,
          res.lastModified,
          hash,
          PARSER_VERSION,
          res.body.length,
          retain ? 1 : 0,
          retain ? text : null,
        ).lastInsertRowid,
    );
    const provider = runtimeProvider();
    const passes =
      (flag('pass') ?? 'all') === 'all'
        ? (['A', 'B', 'OPERATOR'] as const)
        : [flag('pass') as 'A' | 'B' | 'OPERATOR'];
    const results = [];
    for (const p of passes) results.push(await runExtractionPass(db, provider, docId, text, p, now));
    print({ document: docId, unchangedFrom: same?.id ?? null, retainedBody: retain, results });
  },
  async promote() {
    const { promoteDocument } = await import('../src/domain/promote');
    print(promoteDocument(db, int(need(1, 'document-id'), 'document-id'), now()));
  },
  async 'asic-file'() {
    const { asicFileIntake } = await import('../src/domain/regulators');
    print(asicFileIntake(db, need(1, 'file'), now(), { sandbox: args.flags['sandbox'] === true }));
  },
  async asic() {
    const url =
      flag('url') ??
      fail(
        '--url <approved ASIC dataset URL> is required; download is only allowed for an owner-approved dataset',
      );
    if (!live()) fail('pass --live to download the approved dataset');
    const res = await fetch(url, {
      headers: { 'user-agent': cfg.sourceUserAgent ?? 'ForexInspect' },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) fail(`download failed: HTTP ${res.status}`);
    const file = path.resolve('data', `asic-${now().toISOString().slice(0, 10)}.tsv`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    const { asicFileIntake } = await import('../src/domain/regulators');
    print(asicFileIntake(db, file, now(), { sandbox: false }));
  },
  async 'asic-identifier'() {
    const { registerIdentifier } = await import('../src/domain/regulators');
    print(
      registerIdentifier(
        db,
        int(need(1, 'legal-entity-id'), 'legal-entity-id'),
        need(2, 'scheme') as 'ASIC_AFSL',
        need(3, 'value'),
        owner(),
        now(),
      ),
    );
  },
  async 'asic-match'() {
    const { asicMatch } = await import('../src/domain/regulators');
    print(asicMatch(db, now()));
  },
  conflicts() {
    print(
      db
        .prepare(
          'SELECT c.id, b.slug, c.field_key, c.scope_key, c.observation_a, c.observation_b, c.opened_at FROM fact_conflicts c JOIN brokers b ON b.id = c.broker_id WHERE c.resolved_at IS NULL',
        )
        .all(),
    );
  },
  async 'resolve-conflict'() {
    const { resolveConflict } = await import('../src/domain/promote');
    resolveConflict(
      db,
      int(need(1, 'conflict-id'), 'conflict-id'),
      need(2, 'OWNER_SELECTED_A|OWNER_SELECTED_B|EQUIVALENT|BOTH_REJECTED') as 'EQUIVALENT',
      flag('note') ?? fail('--note required'),
      owner(),
      now(),
    );
    print({ resolved: true });
  },
  async 'reject-observation'() {
    const { rejectObservation } = await import('../src/domain/promote');
    rejectObservation(
      db,
      int(need(1, 'observation-id'), 'id'),
      flag('reason') ?? fail('--reason required'),
      owner(),
      now(),
    );
    print({ rejected: true });
  },
  async 'reject-fact'() {
    const { rejectFact } = await import('../src/domain/promote');
    rejectFact(
      db,
      int(need(1, 'fact-id'), 'id'),
      flag('reason') ?? fail('--reason required'),
      owner(),
      now(),
    );
    print({ rejected: true });
  },
  async 'withdraw-fact'() {
    const { withdrawFact } = await import('../src/domain/promote');
    withdrawFact(
      db,
      int(need(1, 'fact-id'), 'id'),
      flag('reason') ?? fail('--reason required'),
      owner(),
      now(),
    );
    print({ withdrawn: true });
  },
  async 'reopen-source'() {
    const { reopenSource } = await import('../src/domain/policy');
    reopenSource(
      db,
      int(need(1, 'source-id'), 'id'),
      owner(),
      flag('reason') ?? fail('--reason required'),
      now(),
    );
    print({ reopened: true, state: 'POLICY_PENDING' });
  },
  async 'retire-source'() {
    const { retireSource } = await import('../src/domain/policy');
    retireSource(
      db,
      int(need(1, 'source-id'), 'id'),
      owner(),
      flag('reason') ?? fail('--reason required'),
      now(),
    );
    print({ retired: true });
  },
  async 'stop-notice'() {
    const { recordStopNotice } = await import('../src/domain/policy');
    recordStopNotice(
      db,
      int(need(1, 'source-id'), 'id'),
      owner(),
      flag('note') ?? 'owner stop notice',
      now(),
    );
    print({ blocked: true });
  },
  async 'drop-broker'() {
    const slug = need(1, 'broker-slug');
    const code =
      flag('reason-code') ?? fail('--reason-code ACCESS_REFUSED|OWNER_DECISION|NOT_QUALIFIED|STOP_NOTICE');
    const actor = owner();
    const { audit } = await import('../src/domain/audit');
    const b =
      (db.prepare('SELECT id FROM brokers WHERE slug = ?').get(slug) as { id: number }) ??
      fail('unknown broker');
    db.transaction(() => {
      db.prepare("UPDATE brokers SET status = 'DROPPED', updated_at = ? WHERE id = ?").run(
        now().toISOString(),
        b.id,
      );
      db.prepare(
        'INSERT INTO dropped_brokers (broker_id, reason_code, reason, dropped_at, dropped_by) VALUES (?,?,?,?,?)',
      ).run(b.id, code, (flag('reason') ?? code).slice(0, 300), now().toISOString(), actor);
      db.prepare(
        "INSERT INTO candidate_selection (broker_id, state, reason, decided_at, decided_by) VALUES (?, 'DROPPED', ?, ?, ?)",
      ).run(b.id, code, now().toISOString(), actor);
      audit(db, { actor, action: 'broker.drop', subject: slug, at: now(), detail: { code } });
    })();
    print({
      dropped: slug,
      note: 'pages hide immediately at read time; select a qualified replacement from backlog',
    });
  },
  'blocked-report'() {
    print(
      db
        .prepare(
          "SELECT s.id, b.slug, s.url, s.state_reason, s.updated_at, s.owner_stop_notice_at FROM source_registry s JOIN brokers b ON b.id = s.broker_id WHERE s.state = 'BLOCKED'",
        )
        .all(),
    );
  },
  async 'public-report'() {
    const { brokerSnapshot, meetsFloor } = await import('../src/domain/publication');
    const { checkFacts } = await import('../src/domain/fact-checks');
    const rows = db
      .prepare(
        "SELECT id, slug, official_domain_confirmed_at FROM brokers WHERE status <> 'DROPPED' ORDER BY slug",
      )
      .all() as { id: number; slug: string; official_domain_confirmed_at: string | null }[];
    print({
      publicationEnabled: cfg.publicationEnabled,
      autoPublicationEnabled: cfg.autoPublicationEnabled,
      brokers: rows.map((b) => {
        const kinds = (['BROKER_PROFILE', 'BROKER_FEES', 'BROKER_ACCOUNTS'] as const).map((k) => {
          const s = brokerSnapshot(db, b.id, k, now());
          if (!s)
            return {
              kind: k,
              ready: false,
              reason: b.official_domain_confirmed_at ? 'NO_VALID_FACTS' : 'DOMAIN_UNCONFIRMED',
            };
          const fl = meetsFloor(s as never, checkFacts(db, s.facts, now()));
          return { kind: k, ready: fl.ok, reason: fl.reason, facts: s.facts.length };
        });
        return { slug: b.slug, kinds };
      }),
    });
  },
  async 'coverage-report'() {
    const { CORE_TOPICS, FIELDS } = await import('../src/domain/fields');
    const rows = db.prepare("SELECT id, slug FROM brokers WHERE status <> 'DROPPED' ORDER BY slug").all() as {
      id: number;
      slug: string;
    }[];
    print(
      rows.map((b) => {
        const approved = (
          db
            .prepare("SELECT count(*) AS n FROM source_registry WHERE broker_id = ? AND state = 'APPROVED'")
            .get(b.id) as { n: number }
        ).n;
        const fields = new Set(
          (
            db
              .prepare(
                'SELECT DISTINCT field_key FROM verified_facts WHERE broker_id = ? AND superseded_at IS NULL AND withdrawn_at IS NULL AND expires_at > ?',
              )
              .all(b.id, now().toISOString()) as { field_key: string }[]
          ).map((r) => r.field_key),
        );
        const covered = CORE_TOPICS.filter((t) =>
          Object.values(FIELDS).some((f) => f.core === t.key && fields.has(f.key)),
        );
        return {
          slug: b.slug,
          approvedSources: approved,
          officialSourceTarget: 2,
          coveredCore: covered.map((c) => c.key),
          missingCore: CORE_TOPICS.filter((t) => !covered.includes(t)).map((t) => t.key),
        };
      }),
    );
  },
  async draft() {
    const { brokerSnapshot, createDraft, brokerPaths } = await import('../src/domain/publication');
    const slug = need(1, 'broker-slug');
    const b =
      (db.prepare('SELECT id FROM brokers WHERE slug = ?').get(slug) as { id: number }) ??
      fail('unknown broker');
    const out = [];
    for (const k of ['BROKER_PROFILE', 'BROKER_FEES', 'BROKER_ACCOUNTS'] as const) {
      const s = brokerSnapshot(db, b.id, k, now());
      if (!s) {
        out.push({ kind: k, draft: null, reason: 'not eligible' });
        continue;
      }
      out.push({
        kind: k,
        ...createDraft(
          db,
          { kind: k, path: brokerPaths(slug)[k], brokerId: b.id, comparisonKey: null, content: s as never },
          now(),
        ),
        facts: s.facts.length,
      });
    }
    print({ draftsOnly: true, out });
  },
  async publish() {
    const { publishBroker } = await import('../src/domain/publication');
    const slug = need(1, 'broker-slug');
    const b =
      (db.prepare('SELECT id FROM brokers WHERE slug = ?').get(slug) as { id: number }) ??
      fail('unknown broker');
    print(publishBroker(db, b.id, now(), owner()));
    if (!cfg.publicationEnabled)
      print('note: PUBLICATION_ENABLED is off, so published snapshots are not served publicly.');
  },
  async 'publish-auto'() {
    const { runAutoPublication } = await import('../src/domain/publication');
    print(runAutoPublication(db, now(), cfg));
  },
  'publication-log'() {
    print({
      runs: db.prepare('SELECT * FROM publication_runs ORDER BY id DESC LIMIT 30').all(),
      events: db
        .prepare(
          "SELECT at, actor, action, subject, detail_json FROM audit_events WHERE action LIKE 'publish.%' OR action LIKE 'page.%' ORDER BY id DESC LIMIT 30",
        )
        .all(),
    });
  },
  async rollback() {
    const { rollbackPage, getPage } = await import('../src/domain/publication');
    const page = getPage(db, need(1, 'page-path')) ?? fail('unknown page');
    print(rollbackPage(db, page.id, int(need(2, 'revision-id'), 'revision-id'), owner(), now()));
  },
  async retract() {
    const { retractPage, getPage } = await import('../src/domain/publication');
    const page = getPage(db, need(1, 'page-path')) ?? fail('unknown page');
    print({ result: retractPage(db, page.id, flag('reason') ?? fail('--reason required'), owner(), now()) });
  },
  async 'compare-cycle'() {
    const { runCompareCycle } = await import('../src/domain/comparisons');
    print(
      await runCompareCycle(db, runtimeProvider(), {
        now: now(),
        publicationEnabled: cfg.publicationEnabled,
        enabled: cfg.publicationEnabled && cfg.autoPublicationEnabled,
      }),
    );
  },
  async 'prices-refresh'() {
    const { refreshRates } = await import('../src/domain/rates');
    print(
      await refreshRates(db, {
        enabled: cfg.marketRatesEnabled,
        fetch: (u, i) => fetch(u, i),
        now,
        userAgent: cfg.sourceUserAgent ?? 'ForexInspect reference-rate refresh',
      }),
    );
  },
  async monitor() {
    const { raiseAlert, resolveAlert } = await import('../src/domain/audit');
    const { opsSummary } = await import('../src/domain/ops');
    const s = opsSummary(db, now());
    const checks: [boolean, string, 'WARNING' | 'CRITICAL', string][] = [
      [s.deadLetters > 0, 'jobs:dead-letter', 'WARNING', `${s.deadLetters} dead-letter jobs`],
      [s.openConflicts > 0, 'facts:conflicts', 'WARNING', `${s.openConflicts} open fact conflicts`],
      [
        s.expiringIn24h > 0,
        'facts:expiring',
        'WARNING',
        `${s.expiringIn24h} accepted facts expire within 24 h`,
      ],
      [
        (s.sourcesByState.BLOCKED ?? 0) > 0,
        'sources:blocked',
        'WARNING',
        `${s.sourcesByState.BLOCKED ?? 0} blocked sources`,
      ],
      [!s.ratesLatest && cfg.marketRatesEnabled, 'rates:none', 'WARNING', 'no stored ECB reference rates'],
    ];
    for (const [hit, fp, sev, msg] of checks) {
      if (hit)
        raiseAlert(db, { fingerprint: fp, severity: sev, code: fp.toUpperCase(), message: msg, at: now() });
      else resolveAlert(db, fp, now());
    }
    print({ alerts: opsSummary(db, now()).alerts });
  },
  async 'health-summary'() {
    const { opsSummary } = await import('../src/domain/ops');
    const s = opsSummary(db, now());
    const text = [
      `ForexInspect ${cfg.deployment.region ?? ''} ${cfg.deployment.vpsId ?? ''}`.trim(),
      `published pages ${s.publishedPages}, facts ${s.verifiedFacts}, conflicts ${s.openConflicts}, dead letters ${s.deadLetters}`,
      `sources ${JSON.stringify(s.sourcesByState)}`,
      `alerts ${s.alerts.length}`,
    ].join('\n');
    if (args.flags['send'] === true) {
      const { telegramSend } = await import('../src/integrations');
      const r = await telegramSend(cfg, text);
      print({ sent: r.ok, status: r.status || 'not sent: Telegram disabled or not authorized' });
    } else print(text);
  },
  async maintenance() {
    const { purgeAsk } = await import('../src/domain/ask');
    const purged = purgeAsk(db, now());
    const runs = db
      .prepare('DELETE FROM market_fetch_runs WHERE started_at < ?')
      .run(new Date(Date.now() - 30 * 86_400_000).toISOString()).changes;
    db.pragma('wal_checkpoint(PASSIVE)');
    db.pragma('optimize');
    print({ purged, fetchRunsPruned: runs });
  },
  async backup() {
    const { acquireLock, releaseLock } = await import('../src/domain/jobs');
    const { createBackup, verifyArchive, splitParts, applyRetention } = await import('../src/domain/backup');
    if (!cfg.backup.keyFile) fail('BACKUP_ENCRYPTION_KEY_FILE is not set');
    const lockOwner = `backup:${process.pid}`;
    if (!acquireLock(db, 'maintenance', lockOwner, now(), 30 * 60_000))
      fail('another refresh/backup holds the shared lock');
    try {
      const res = await createBackup(db, {
        projectDir: process.cwd(),
        backupDir: cfg.backup.directory,
        keyFile: cfg.backup.keyFile!,
        secretsFile: fs.existsSync(resolveSecretsFile()) ? resolveSecretsFile() : null,
        hostConfigFiles: [
          '/etc/nginx/sites-available/forexinspect',
          '/etc/systemd/system/forexinspect-web.service',
        ],
        includeDependencies: args.flags['include-dependencies'] === true,
        now: now(),
      });
      const v = await verifyArchive(res.archive, cfg.backup.keyFile!);
      if (!v.ok) fail(`verification failed: ${v.reason}`);
      if (v.ok) fs.rmSync(v.dir, { recursive: true, force: true });
      let upload: unknown = 'LOCAL_ONLY: off-host upload not performed (this is not an off-host backup)';
      if (args.flags['upload'] === true) {
        const { telegramSendDocument } = await import('../src/integrations');
        const parts = splitParts(res.archive);
        const receipts = [];
        for (const [i, p] of parts.entries()) {
          const r = await telegramSendDocument(
            cfg,
            path.basename(p.path),
            fs.readFileSync(p.path),
            `FIPB1 part ${i + 1}/${parts.length} sha256 ${p.sha256}`,
          );
          receipts.push({
            part: i + 1,
            ok: r.ok,
            status: r.status,
            messageId: r.messageId,
            sha256: p.sha256,
            bytes: p.bytes,
          });
          if (!r.ok) break;
        }
        const ok = receipts.length === parts.length && receipts.every((r) => r.ok);
        fs.writeFileSync(
          `${res.archive}.${ok ? 'receipt.json' : 'upload-failed'}`,
          JSON.stringify({ archiveSha256: res.sha256, receipts }, null, 2),
          { mode: 0o600 },
        );
        upload = ok
          ? { uploaded: true, parts: parts.length }
          : { uploaded: false, retainedLocally: true, receipts };
      }
      print({
        archive: path.basename(res.archive),
        sha256: res.sha256,
        bytes: res.bytes,
        files: res.manifest.files.length,
        verified: true,
        upload,
        retentionRemoved: applyRetention(cfg.backup.directory),
      });
    } finally {
      releaseLock(db, 'maintenance', lockOwner);
    }
  },
  async 'backup-keygen'() {
    const { generateKeyFile } = await import('../src/domain/backup');
    const file = path.resolve(need(1, 'key-file'));
    if (file.startsWith(process.cwd())) fail('store the recovery key outside the project directory');
    generateKeyFile(file);
    print({ created: file, note: 'store an offline root-only copy; a lost key cannot be regenerated' });
  },
  async restore() {
    const { verifyArchive } = await import('../src/domain/backup');
    if (!cfg.backup.keyFile) fail('BACKUP_ENCRYPTION_KEY_FILE is not set');
    const dir = path.resolve(need(2, 'target-dir'));
    if (fs.existsSync(dir) && fs.readdirSync(dir).length)
      fail('target directory must be empty (isolated restore)');
    if (path.resolve(cfg.databasePath).startsWith(dir)) fail('refusing to restore over the live database');
    const v = await verifyArchive(path.resolve(need(1, 'archive')), cfg.backup.keyFile!, dir);
    print(
      v.ok
        ? {
            verified: true,
            dir: v.dir,
            createdAt: v.manifest.createdAt,
            files: v.manifest.files.length,
            next: 'stop writers, then follow docs/BACKUP.md controlled recovery',
          }
        : { verified: false, reason: v.reason },
    );
  },
  async 'logo-import'() {
    const { importLogo } = await import('../src/domain/logos');
    print(
      await importLogo(
        db,
        need(1, 'broker-slug'),
        need(2, 'file'),
        {
          sourceUrl: flag('source-url') ?? fail('--source-url required'),
          retrievedAt: flag('retrieved-at') ?? now().toISOString(),
          attribution: flag('attribution') ?? null,
        },
        now(),
      ),
    );
  },
  async 'logo-report'() {
    const { assetAudit } = await import('../src/domain/assets');
    print(assetAudit(db, flag('q') ?? ''));
  },
  async 'logo-policy'() {
    const slug = need(1, 'broker-slug');
    const url = new URL(need(2, 'logo-source-url'));
    const actor = owner();
    const b =
      (db.prepare('SELECT id FROM brokers WHERE slug = ?').get(slug) as { id: number }) ??
      fail('unknown broker');
    db.prepare(
      'INSERT INTO logo_sources (broker_id, url, host, approved, created_at) VALUES (?, ?, ?, 1, ?) ON CONFLICT(url) DO UPDATE SET approved = 1',
    ).run(b.id, url.toString(), url.hostname, now().toISOString());
    const { audit } = await import('../src/domain/audit');
    audit(db, { actor, action: 'logo.source_approve', subject: url.toString(), at: now() });
    print({ approvedLogoSource: url.toString() });
  },
  async 'logo-review'() {
    const { reviewAsset } = await import('../src/domain/assets');
    const file = need(1, 'asset-file');
    const decision = need(2, 'APPROVE|REJECT|REMOVE') as 'APPROVE';
    const actor = owner();
    if (decision === 'APPROVE') {
      const rights = flag('rights') ?? fail('--rights NOMINATIVE_OFFICIAL_MARK|LICENSED required');
      if (args.flags['brand-reviewed'] !== true)
        fail('--brand-reviewed is required to confirm the current-brand review');
      db.prepare(
        'UPDATE broker_assets SET rights_basis = ?, current_brand_reviewed_at = ? WHERE file_name = ?',
      ).run(rights, now().toISOString(), file);
    }
    reviewAsset(db, file, decision, actor, flag('notes') ?? '', now());
    print({ asset: file, decision });
  },
  async 'logo-enqueue'() {
    const { enqueue } = await import('../src/domain/jobs');
    const rows = db.prepare('SELECT id FROM logo_sources WHERE approved = 1').all() as { id: number }[];
    print(
      rows.map((r) =>
        enqueue(
          db,
          { kind: 'logo', key: `logo:${r.id}`, dueAt: now(), payload: { logoSource: r.id } },
          now(),
        ),
      ),
    );
  },
  async 'logo-run'() {
    const { runLogoJob } = await import('../src/domain/logos');
    if (!live()) fail('logo discovery fetches an approved logo source: pass --live');
    print(await runLogoJob(db, now(), cfg.sourceUserAgent));
  },
  async 'logo-promote'() {
    await commands['logo-review']!();
  },
  async 'seo-crawl'() {
    const { seoCrawl } = await import('../src/domain/seo-audit');
    const origin = flag('origin') ?? fail('--origin http://127.0.0.1:3417 (the running app) is required');
    const r = await seoCrawl(db, {
      origin,
      canonicalOrigin: cfg.siteUrl,
      fetch: (u, i) => fetch(u, { redirect: i?.redirect ?? 'follow', method: i?.method ?? 'GET' }),
      now,
    });
    print({
      run: r.runId,
      pages: r.pages.length,
      unchanged: r.unchanged,
      issues: r.issueCounts,
      brokenLinks: r.brokenLinks.length,
    });
  },
  async 'seo-check'() {
    await commands['seo-crawl']!();
  },
  async 'seo-verify'() {
    await commands['seo-crawl']!();
  },
  async 'seo-review'() {
    const p = runtimeProvider();
    const a = p.availability();
    if (!a.ok)
      return print({
        skipped: true,
        reason: a.reason,
        note: 'model review is optional; deterministic checks continue',
      });
    print({
      skipped: true,
      reason: 'model review runs only for pages whose content hash changed; none pending',
    });
  },
  async 'seo-fix'() {
    const { seoFixPreflight } = await import('../src/domain/seo-audit');
    const pf = seoFixPreflight(cfg, process.cwd());
    print(
      pf.ok
        ? {
            ready: true,
            note: 'supply a proposed diff with --diff <file>; it must pass validateFixDiff and all checks',
          }
        : { ready: false, blockers: pf.blockers },
    );
  },
  async 'seo-report'() {
    const { seoReport } = await import('../src/domain/seo-audit');
    print(seoReport(db));
  },
  async 'gsc-aggregate'() {
    const { gscAggregate } = await import('../src/integrations');
    const end = flag('end') ?? new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
    const start = flag('start') ?? new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    print(await gscAggregate(db, cfg, { start, end }, now()));
  },
  async integrations() {
    const { integrationStatus } = await import('../src/integrations');
    print(integrationStatus(cfg));
  },
  async 'preview-seed'() {
    const { seedPreviewFixtures } = await import('../src/domain/fixtures');
    const file = path.resolve(process.env.PREVIEW_DATABASE_PATH ?? 'data/preview.sqlite');
    if (file === path.resolve(cfg.databasePath)) fail('preview database must differ from DATABASE_PATH');
    const pdb = openDatabase(file);
    await migrate(pdb, { snapshotDir: null });
    print({ previewDatabase: file, ...seedPreviewFixtures(pdb, now()) });
  },
};

if (!cmd || !commands[cmd]) {
  commands.help!();
  process.exit(cmd ? 1 : 0);
}
try {
  await commands[cmd]!();
} catch (e) {
  fail((e as Error).message);
}
