import * as fs from "fs";
import * as path from "path";

/**
 * Durable turn-commit ledger for the context-engine host contract
 * (`transcriptSemantics.turnAdvancementIdempotency = "atomic-idempotent-v1"`).
 *
 * One append-only JSONL file per session under `<workspaceDir>/.claw-ctx/turn-commits/`.
 * Commit is idempotent on `advancementKey`: hosts may retry the same advancement
 * key after a process or plugin failure (host contract doc, config-contracts d.ts).
 *
 * Crash safety: records are appended with a single `writeSync` + `fsync`; a torn
 * trailing line (crash mid-write) is tolerated on the next load by skipping the
 * unparseable tail.
 */
export class TurnCommitLedger {
	private dir: string;
	private seen = new Map<string, string>();
	private loaded = new Set<string>();

	constructor(workspaceDir?: string) {
		this.dir = path.join(workspaceDir || process.cwd(), ".claw-ctx", "turn-commits");
	}

	private fileFor(sessionId: string): string {
		return path.join(this.dir, `${encodeURIComponent(sessionId)}.jsonl`);
	}

	private ensure(sessionId: string): void {
		if (this.loaded.has(sessionId)) return;
		try {
			const raw = fs.readFileSync(this.fileFor(sessionId), "utf-8");
			for (const line of raw.split("\n")) {
				if (!line) continue;
				try {
					const rec = JSON.parse(line) as { advancementKey?: string };
					if (rec.advancementKey) this.seen.set(this.key(sessionId, rec.advancementKey), sessionId);
				} catch { /* torn tail line from a crash mid-append: skip */ }
			}
		} catch { /* ENOENT: first commit for this session */ }
		this.loaded.add(sessionId);
	}

	private append(sessionId: string, record: Record<string, unknown>): void {
		fs.mkdirSync(this.dir, { recursive: true });
		const file = this.fileFor(sessionId);
		let created = false;
		try {
			fs.statSync(file);
		} catch {
			created = true; // first record for this session
		}

		// A crash can leave a torn tail without its trailing newline. Appending
		// directly would concatenate the next record onto that fragment and make
		// BOTH records unparseable on reload — so start on a fresh line.
		let needsLeadingNewline = false;
		if (!created) {
			const rfd = fs.openSync(file, "r");
			try {
				const size = fs.fstatSync(rfd).size;
				if (size > 0) {
					const last = Buffer.alloc(1);
					fs.readSync(rfd, last, 0, 1, size - 1);
					needsLeadingNewline = last[0] !== 0x0a;
				}
			} finally {
				fs.closeSync(rfd);
			}
		}

		const fd = fs.openSync(file, "a");
		try {
			fs.writeSync(fd, (needsLeadingNewline ? "\n" : "") + JSON.stringify(record) + "\n");
			fs.fsyncSync(fd);
		} finally {
			fs.closeSync(fd);
		}

		// File fsync does not persist the directory entry on a fresh file; best-effort
		// directory fsync keeps the first commit durable across power loss (skipped on
		// platforms that cannot open directories).
		if (created) {
			try {
				const dfd = fs.openSync(this.dir, "r");
				try {
					fs.fsyncSync(dfd);
				} finally {
					fs.closeSync(dfd);
				}
			} catch {
				/* directory fsync unsupported — file fsync still applied */
			}
		}
	}

	/** Idempotency scope is per-session: the ledger file itself is per-session. */
	private key(sessionId: string, advancementKey: string): string {
		return sessionId + "\u0000" + advancementKey;
	}

	/**
	 * Durably record a committed turn. Idempotent per `advancementKey` within
	 * the session. Returns "duplicate" when the key was already committed
	 * (host retry).
	 */
	commit(params: { advancementKey: string; sessionId: string }): "committed" | "duplicate" {
		if (typeof params.advancementKey !== "string" || params.advancementKey === "") {
			throw new Error("TurnCommitLedger: advancementKey is required");
		}
		if (typeof params.sessionId !== "string" || params.sessionId === "") {
			throw new Error("TurnCommitLedger: sessionId is required");
		}
		this.ensure(params.sessionId);
		const k = this.key(params.sessionId, params.advancementKey);
		if (this.seen.has(k)) return "duplicate";
		this.append(params.sessionId, {
			advancementKey: params.advancementKey,
			sessionId: params.sessionId,
			committedAt: new Date().toISOString(),
		});
		this.seen.set(k, params.sessionId);
		return "committed";
	}
}
