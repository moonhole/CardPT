import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { proposeDecision } from "./gateway/proposeDecision.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/dist", express.static(path.join(__dirname, "dist")));

app.post("/api/llm", async (req, res) => {
  try {
    console.log("[LLM] raw request:", JSON.stringify(req.body, null, 2));
    const decision = await proposeDecision(req.body);
    res.json(decision);
  } catch (err) {
    console.error("[LLM] request failed", err);
    res.status(500).send("LLM request failed.");
  }
});

app.listen(port, () => {
  process.stdout.write(`CardPT server running at http://localhost:${port}\n`);
});
