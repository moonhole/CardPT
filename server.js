import express from "express";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/dist", express.static(path.join(__dirname, "dist")));

app.post("/api/llm", async (req, res) => {
  console.log("[LLM PROXY] handler entered");
  const apiKey = process.env.DASHSCOPE_API_KEY;
  if (!apiKey) {
    console.log("[LLM PROXY] no api key");
    res.status(500).send("Missing DASHSCOPE_API_KEY.");
    return;
  }
  try {
    console.log("[LLM] request received");
    const openai = new OpenAI({
      apiKey,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    });
    const completion = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: req.body.messages || [],
    });
    res.json(completion);
  } catch (err) {
    console.error("[LLM] request failed", err);
    res.status(500).send("LLM request failed.");
  }
});

app.listen(port, () => {
  process.stdout.write(`CardPT server running at http://localhost:${port}\n`);
});
