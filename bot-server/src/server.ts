import express from "express";
import cors from "cors";
import { config } from "./config";

const app = express();
app.use(cors({ origin: config.ALLOWED_ORIGIN }));
app.use(express.json({ limit: "16kb" }));

app.get("/health", (_req, res) => res.json({ status: "ok" }));

// POST /chat is added in the chatbot integration step.

app.listen(config.PORT, () => console.log(`bot-server listening on :${config.PORT}`));
