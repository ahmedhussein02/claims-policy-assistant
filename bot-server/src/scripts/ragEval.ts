/**
 * Calibration / smoke test: npm run rag:eval
 * Prints, per question, the retrieval similarities (what the RAG_MIN_SCORE gate sees) and the final answer.
 * Use it to pick a RAG_MIN_SCORE that passes the "on-topic" questions and blocks the "off-topic" ones.
 */
import { retrieve, answerPolicyQuestion } from "../services/ragService";
import { config } from "../config";
import { formatSources } from "../rag/ragUtils";
import { describeError } from "../rag/describeError";

const ON_TOPIC = [
  "What documents do I need to submit a claim?",
  "How long do I have to appeal a rejected claim?",
  "How long does it take to get paid after approval?",
  "What does Action Required mean?",
  "Is flood damage covered under my home policy?",
  "What happens if I don't upload documents in time?",
];
const OFF_TOPIC = ["What is the capital of France?", "Write me a poem about cats", "How do I bake sourdough bread?"];

async function main() {
  console.log(`RAG_MIN_SCORE=${config.RAG_MIN_SCORE}  TOP_K=${config.RAG_TOP_K}  semantic=${config.SEARCH_USE_SEMANTIC}\n`);
  for (const [label, qs] of [["ON-TOPIC", ON_TOPIC], ["OFF-TOPIC", OFF_TOPIC]] as const) {
    console.log(`=== ${label} ===`);
    for (const q of qs) {
      const { all } = await retrieve(q);
      const top = all.slice(0, 3).map((c) => c.similarity.toFixed(2)).join(", ");
      const r = await answerPolicyQuestion(q);
      console.log(`\nQ: ${q}\n   top similarities: ${top || "none"}\n   status: ${r.status}${r.fallbackReason ? ` (${r.fallbackReason})` : ""}`);
      console.log(`   A: ${r.answer}`);
      if (r.sources.length) console.log("   " + formatSources(r.sources).replace(/\n/g, "\n   "));
    }
    console.log();
  }
}
main().catch((e) => { console.error("Eval failed:", describeError(e)); process.exit(1); });
