// Downloads the BEIR copy of SciFact (test split) into data/external/scifact/.
// SciFact (Wadden et al., EMNLP 2020) is licensed CC BY-NC 2.0, so it is
// fetched on demand and never committed to this repository.
//
// Downloads are untrusted data: every file is pinned to an exact Hugging Face
// revision and SHA-256, size-limited, and written only into its own directory.
// Nothing downloaded is ever executed.
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join, resolve } from "node:path"
import { gunzipSync } from "node:zlib"

const CORPUS_REV = "984eed826375f18d27936c4a32bf0f8491e3f414"
const QRELS_REV = "2938d17dc3b09882fdb8c12bbbe2e2dc0e75a029"
const FILES = [
  {
    url: `https://huggingface.co/datasets/BeIR/scifact/resolve/${CORPUS_REV}/corpus.jsonl.gz`,
    sha256: "2f4a2a264485e5b5b95ae9cd5534817447757423991a4767d6da811539c0853e",
    out: "corpus.jsonl",
    gzip: true,
  },
  {
    url: `https://huggingface.co/datasets/BeIR/scifact/resolve/${CORPUS_REV}/queries.jsonl.gz`,
    sha256: "c29574b9cb8fdf043df8494f689de15f4604ac4b585eb34bda9b6a389aa6c4d3",
    out: "queries.jsonl",
    gzip: true,
  },
  {
    url: `https://huggingface.co/datasets/BeIR/scifact-qrels/resolve/${QRELS_REV}/test.tsv`,
    sha256: "0864bb985e0ca2367ba217977e72004d549054b2b06666ed9d4825ac7c21284c",
    out: "qrels-test.tsv",
    gzip: false,
  },
] as const
const MAX_BYTES = 20 * 1024 * 1024

const target = resolve("data/external/scifact")
mkdirSync(target, { recursive: true })
for (const file of FILES) {
  const outPath = join(target, file.out)
  const rawPath = `${outPath}${file.gzip ? ".gz" : ".download"}`
  if (!existsSync(rawPath)) {
    console.log(`Downloading ${file.url}`)
    const response = await fetch(file.url, { signal: AbortSignal.timeout(120_000) })
    if (!response.ok) throw new Error(`Download failed: HTTP ${response.status} for ${file.url}`)
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length > MAX_BYTES) throw new Error("Download larger than expected; refusing")
    writeFileSync(rawPath, bytes)
  }
  const raw = readFileSync(rawPath)
  const digest = createHash("sha256").update(raw).digest("hex")
  if (digest !== file.sha256)
    throw new Error(`SHA-256 mismatch for ${rawPath} (got ${digest}); delete it and retry`)
  const content = file.gzip ? gunzipSync(raw, { maxOutputLength: 64 * 1024 * 1024 }) : raw
  writeFileSync(outPath, content)
}
console.log(`SciFact files verified and written to ${target}`)
