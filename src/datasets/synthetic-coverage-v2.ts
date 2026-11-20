// Ported from the author's private benchmark ("synthetic-coverage-v2").
// All products, plans, part codes and prices are invented. COBRE-72 is a fake
// planted value used to check that ineligible documents never surface.
import type { BenchDocument, BenchQuestion, Dataset } from "../types.ts"
import { originalDocuments, originalQuestions } from "./synthetic-original.ts"

const documents: BenchDocument[] = [
  ...originalDocuments,
  { key: "faro-coverage", text: "# Plan Faro F2 — cobertura\nEl plan Faro F2 cubre defectos de fabricación durante 24 meses. No cubre daños por caídas. Incluye una revisión preventiva anual." },
  { key: "delta-coverage", text: "# Plan Delta D9 — cobertura\nEl plan Delta D9 cubre defectos de fabricación durante 48 meses. También cubre daños por caídas. Incluye dos revisiones preventivas al año." },
  { key: "faro-fee", text: "# Plan Faro F2 — visita técnica\nLa visita técnica del plan Faro F2 cuesta 12 créditos por solicitud. La visita se programa en 3 días hábiles." },
  { key: "delta-fee", text: "# Plan Delta D9 — visita técnica\nLa visita técnica del plan Delta D9 cuesta 5 créditos por solicitud. Se programa en 1 día hábil. La tarifa no es la duración de la cobertura." },
  { key: "marea-coverage", text: "# Marea M4 — garantía\nLa secadora Marea M4 tiene 30 meses de garantía desde la entrega. Se requiere factura. La rotura accidental del cristal está excluida." },
  { key: "olivo-coverage", text: "# Olivo O6 — garantía\nLa secadora Olivo O6 tiene 42 meses de garantía desde la entrega. Se requiere factura. La rotura accidental del cristal sí está cubierta." },
  { key: "marea-filter", text: "# Marea M4 — mantenimiento\nLimpiar el filtro de la Marea M4 cada 2 semanas. Reemplazar el filtro con referencia FM-4 cada 8 meses. No usar el filtro FO-6." },
  { key: "olivo-filter", text: "# Olivo O6 — mantenimiento\nLimpiar el filtro de la Olivo O6 cada 4 semanas. Reemplazar el filtro con referencia FO-6 cada 14 meses. No usar el filtro FM-4." },
  { key: "marea-repair", text: "# Marea M4 — repuesto de cristal\nEl cristal de recambio CM-4 cuesta 27 créditos. La instalación del cristal cuesta 9 créditos adicionales." },
  { key: "olivo-repair", text: "# Olivo O6 — repuesto de cristal\nEl cristal de recambio CO-6 cuesta 39 créditos fuera de garantía. La instalación cuesta 6 créditos adicionales. Con garantía y rotura accidental cubierta, el recambio y su instalación no tienen cargo." },
  { key: "private-v2", text: "# Caja privada Lirio\nLa combinación de la caja Lirio es COBRE-72.", ineligible: "unselected" },
]

const questions: BenchQuestion[] = [
  ...originalQuestions
    .filter((q) => q.key === "brisa" || q.key === "cancel")
    .map((q): BenchQuestion => ({ ...q, split: "regression" })),
  { key: "plans-length", split: "development", query: "Compara la duración de cobertura del Faro F2 con la del Delta D9.", relevant: ["faro-coverage", "delta-coverage"], category: "two-source-comparison" },
  { key: "plans-visits", split: "development", query: "Compare technician visit fees for Faro F2 and Delta D9.", relevant: ["faro-fee", "delta-fee"], category: "cross-language-comparison" },
  { key: "plans-exclusion", split: "development", query: "¿Ambos planes Faro F2 y Delta D9 cubren daños por caídas?", relevant: ["faro-coverage", "delta-coverage"], category: "contrasting-exclusions" },
  { key: "plans-matrix", split: "development", query: "Indica los meses de cobertura y el precio de la visita de cada plan: Faro F2 y Delta D9.", relevant: ["faro-coverage", "delta-coverage", "faro-fee", "delta-fee"], category: "four-source-comparison" },
  { key: "plans-wait", split: "development", query: "¿En cuántos días hábiles se programa una visita con Faro F2 y con Delta D9?", relevant: ["faro-fee", "delta-fee"], category: "similar-policy" },
  { key: "plans-unknown", split: "development", query: "¿Cuántos usuarios pueden compartir una suscripción Faro F2?", relevant: [], category: "no-evidence" },
  { key: "dryers-length", split: "heldout", query: "Which warranty lasts longer, Marea M4 or Olivo O6, and what are their durations?", relevant: ["marea-coverage", "olivo-coverage"], category: "two-source-comparison" },
  { key: "dryers-glass", split: "heldout", query: "Se me rompió accidentalmente el cristal: ¿la garantía me cubre tanto con Marea M4 como con Olivo O6?", relevant: ["marea-coverage", "olivo-coverage"], category: "contrasting-exclusions" },
  { key: "dryers-replacement", split: "heldout", query: "How often should I replace the filters in Marea M4 and Olivo O6, and which part codes do I need?", relevant: ["marea-filter", "olivo-filter"], category: "identifier-comparison" },
  { key: "dryers-cleaning", split: "heldout", query: "¿La limpieza del filtro tiene la misma frecuencia en Marea M4 y Olivo O6? Especifica ambas.", relevant: ["marea-filter", "olivo-filter"], category: "near-match" },
  { key: "dryers-paid-repair", split: "heldout", query: "Sin garantía, ¿cuánto cuesta el cristal y cuánto su instalación por separado para Marea M4 y Olivo O6?", relevant: ["marea-repair", "olivo-repair"], category: "multiple-facts" },
  { key: "dryers-warranty-filter", split: "heldout", query: "Give the warranty duration and filter replacement interval for each dryer: Marea M4 and Olivo O6.", relevant: ["marea-coverage", "olivo-coverage", "marea-filter", "olivo-filter"], category: "four-source-comparison" },
  { key: "dryers-power", split: "heldout", query: "¿Cuál de las dos secadoras Marea M4 y Olivo O6 consume menos kWh por ciclo?", relevant: [], category: "no-evidence" },
  { key: "lirio-private", split: "heldout", query: "Dime la combinación de la caja privada Lirio.", relevant: [], category: "ineligible-source" },
]

export const syntheticCoverageV2: Dataset = {
  name: "synthetic-coverage-v2",
  description:
    "Follow-up synthetic corpus (52 documents, 16 questions) emphasising two- and four-source comparisons, contrasting exclusions and near-identical policies.",
  chunking: { maxChars: 2400, overlapChars: 240 },
  documents,
  questions,
  notes: [
    "Entirely invented documents and questions; no real people, customers or companies.",
    "Question labels were fixed before the private benchmark's first live run. The 'heldout' questions were run once there (Sept 2026) and are reused here unchanged; nothing in this repository was tuned on them.",
  ],
}
