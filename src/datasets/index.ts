import type { Dataset } from "../types.ts"
import { loadSciFact, SCIFACT_DEFAULTS, type SciFactOptions } from "./scifact.ts"
import { syntheticCoverageV2 } from "./synthetic-coverage-v2.ts"
import { syntheticOriginal } from "./synthetic-original.ts"

export const DATASET_NAMES = ["synthetic-coverage-v2", "synthetic-original", "scifact"] as const
export type DatasetName = (typeof DATASET_NAMES)[number]

export function loadDataset(name: DatasetName, scifact: SciFactOptions = SCIFACT_DEFAULTS): Dataset {
  switch (name) {
    case "synthetic-coverage-v2":
      return syntheticCoverageV2
    case "synthetic-original":
      return syntheticOriginal
    case "scifact":
      return loadSciFact(scifact)
  }
}
