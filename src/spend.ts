import { writeFileSync } from "node:fs"

/** Voyage list prices in USD per million tokens (voyageai.com pricing, checked 2026-09-18).
 * The benchmark never assumes free-token allowances: costs are list-price estimates. */
export const PRICE_PER_MTOK: Record<string, number> = {
  "voyage-4": 0.06,
  "rerank-2.5-lite": 0.02,
}
export function microusdFor(model: string, tokens: number): number {
  const price = PRICE_PER_MTOK[model]
  if (price === undefined) throw new Error(`No price configured for ${model}`)
  return Math.ceil(tokens * price) // tokens * ($ per 1M tokens) = micro-USD
}

export type Operation = {
  seq: number
  kind: "embed" | "rerank"
  model: string
  inputs: number
  /** Conservative token ceiling reserved before the request (UTF-8 bytes + 64 per input). */
  ceilingTokens: number
  reservedMicrousd: number
  status: "reserved" | "settled" | "rejected" | "uncertain"
  tokens?: number
  actualMicrousd?: number
  httpStatus?: number
}

export class BudgetExceeded extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BudgetExceeded"
  }
}

/**
 * Hard spend cap. Every request reserves a conservative ceiling first; the
 * request is refused (never sent) if committed spend plus that ceiling would
 * exceed the cap. Successful calls settle to reported usage. Failures whose
 * charge is uncertain keep their full reservation.
 */
export class SpendLedger {
  readonly operations: Operation[] = []
  constructor(
    readonly capMicrousd: number,
    private readonly journalPath: string | null
  ) {}

  committedMicrousd(): number {
    let total = 0
    for (const op of this.operations) {
      if (op.status === "settled") total += op.actualMicrousd!
      else if (op.status !== "rejected") total += op.reservedMicrousd
    }
    return total
  }

  reserve(kind: Operation["kind"], model: string, ceilingTokens: number, inputs: number): Operation {
    const reservedMicrousd = microusdFor(model, ceilingTokens)
    if (this.committedMicrousd() + reservedMicrousd > this.capMicrousd)
      throw new BudgetExceeded(
        `Spend cap of $${(this.capMicrousd / 1e6).toFixed(2)} would be exceeded; request not sent`
      )
    const op: Operation = {
      seq: this.operations.length + 1,
      kind,
      model,
      inputs,
      ceilingTokens,
      reservedMicrousd,
      status: "reserved",
    }
    this.operations.push(op)
    this.persist()
    return op
  }

  settle(op: Operation, tokens: number): void {
    op.status = "settled"
    op.tokens = tokens
    op.actualMicrousd = microusdFor(op.model, tokens)
    this.persist()
  }

  /** HTTP 4xx: the provider rejected the request (e.g. 429). Treated as uncharged. */
  reject(op: Operation, httpStatus: number): void {
    op.status = "rejected"
    op.httpStatus = httpStatus
    this.persist()
  }

  /** Timeout, network error, 5xx or malformed response: charge uncertain; keep the reservation. */
  uncertain(op: Operation, httpStatus?: number): void {
    op.status = "uncertain"
    if (httpStatus !== undefined) op.httpStatus = httpStatus
    this.persist()
  }

  summary() {
    const settled = this.operations.filter((o) => o.status === "settled")
    const models = [...new Set(settled.map((o) => o.model))]
    return {
      capUsd: this.capMicrousd / 1e6,
      requests: this.operations.length,
      settledTokens: Object.fromEntries(
        models.map((m) => [m, settled.filter((o) => o.model === m).reduce((n, o) => n + o.tokens!, 0)])
      ),
      settledUsd: settled.reduce((n, o) => n + o.actualMicrousd!, 0) / 1e6,
      uncertainReservedUsd:
        this.operations
          .filter((o) => o.status === "uncertain" || o.status === "reserved")
          .reduce((n, o) => n + o.reservedMicrousd, 0) / 1e6,
    }
  }

  private persist(): void {
    if (this.journalPath)
      writeFileSync(
        this.journalPath,
        JSON.stringify({ capMicrousd: this.capMicrousd, operations: this.operations }, null, 2),
        { mode: 0o600 }
      )
  }
}

/**
 * Client-side pacing for low Voyage tiers (no payment method: 3 requests/min and
 * 10K tokens/min). Waits for both a minimum request interval and a sliding
 * 60-second token window. A request larger than the token budget is refused.
 */
export class Pacer {
  private last = 0
  private readonly window: { at: number; tokens: number }[] = []
  waitedMs = 0
  constructor(
    readonly rpm: number,
    readonly tpm: number
  ) {}

  async acquire(estimatedTokens: number): Promise<void> {
    if (estimatedTokens > this.tpm)
      throw new Error(`Request of ~${estimatedTokens} tokens exceeds the ${this.tpm} tokens/min pacing budget`)
    const interval = Math.ceil(60_000 / this.rpm) + 500
    for (;;) {
      const now = Date.now()
      while (this.window.length && now - this.window[0]!.at >= 60_000) this.window.shift()
      const used = this.window.reduce((n, w) => n + w.tokens, 0)
      const waitInterval = Math.max(0, this.last + interval - now)
      const waitTokens = used + estimatedTokens > this.tpm ? this.window[0]!.at + 60_000 - now + 250 : 0
      const wait = Math.max(waitInterval, waitTokens)
      if (wait <= 0) break
      this.waitedMs += wait
      await new Promise((r) => setTimeout(r, wait))
    }
    this.last = Date.now()
    this.window.push({ at: this.last, tokens: estimatedTokens })
  }

  /** Replace the latest estimate with reported usage when it is larger. */
  record(actualTokens: number): void {
    const latest = this.window.at(-1)
    if (latest && actualTokens > latest.tokens) latest.tokens = actualTokens
  }
}
