import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { proposeDecision } from "./dist/gateway/proposeDecision.js";
import { getPresetById } from "./dist/shared/modelPresetRegistry.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));
app.use("/dist", express.static(path.join(__dirname, "dist")));

app.post("/api/llm", async (req, res) => {
  try {
    // Extract parameters for unified decision pipeline
    const presetId = req.body.presetId || "qwen-plus";
    const actionMode = req.body.actionMode || "ai_standard"; // Default to ai_standard for backward compatibility
    
    // Extract safe identifiers for logging (never log credentials, prompts, or raw outputs)
    const handId = req.body.input?.engine_facts?.handId;
    const requestId = handId !== undefined ? `hand-${handId}` : `req-${Date.now()}`;
    
    // Log request start (safe data only)
    console.log("[SERVER] Decision proposal request", JSON.stringify({
      timestamp: new Date().toISOString(),
      requestId,
      handId,
      presetId,
      actionMode,
      provider: req.body.credential?.provider || "unknown",
    }));
    
    // Extract credential from request (optional - Phase 3)
    // Credential is never logged or included in error messages
    let credential;
    if (req.body.credential && typeof req.body.credential === "object") {
      credential = {
        provider: req.body.credential.provider,
        apiKey: req.body.credential.apiKey,
        metadata: req.body.credential.metadata,
      };
    } else if (process.env.DASHSCOPE_API_KEY && presetId.startsWith("qwen-")) {
      // Backward compatibility: use env var for Qwen
      credential = {
        provider: "qwen",
        apiKey: process.env.DASHSCOPE_API_KEY,
      };
    }

    // Extract decision input (everything except presetId, credential, and actionMode)
    const { presetId: __, credential: ___, actionMode: ____, ...decisionInput } = req.body;

    // Call unified decision pipeline (Phase 5)
    // Never throws for expected failures - always returns ProposalResult
    const result = await proposeDecision({
      input: decisionInput,
      actionMode,
      presetId,
      credential,
    });

    // Handle result - exactly one of ACCEPTED, REJECTED, or FALLBACK
    if (result.type === "ACCEPTED") {
      // Log successful decision (safe data only)
      console.log("[SERVER] Decision proposal accepted", JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        handId,
        presetId,
        action: result.decision.action.type,
        confidence: result.decision.confidence,
      }));
      res.json(result.decision);
    } else if (result.type === "FALLBACK") {
      // Fallback signal - UI must switch to manual control
      console.log("[SERVER] Decision proposal fallback", JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        handId,
        presetId,
        reason: result.reason,
      }));
      res.status(200).json({
        fallback: true,
        reason: result.reason,
        message: result.message,
      });
    } else {
      // Rejected proposal - structured failure with fallback indicator
      // All rejections trigger fallback to manual control
      console.log("[SERVER] Decision proposal rejected", JSON.stringify({
        timestamp: new Date().toISOString(),
        requestId,
        handId,
        presetId,
        reason: result.reason,
        messageCode: result.messageCode,
      }));
      res.status(400).json({
        fallback: true,
        error: result.message,
        reason: result.reason,
        messageCode: result.messageCode,
        allowManualFallback: result.allowManualFallback,
      });
    }
  } catch (err) {
    // Only unexpected errors should reach here (never expected failures)
    console.error("[SERVER] Unexpected error", JSON.stringify({
      timestamp: new Date().toISOString(),
      error: err instanceof Error ? err.message : String(err),
      errorType: err instanceof Error ? err.constructor.name : "unknown",
    }));
    // Never include credentials in error responses
    res.status(500).json({ error: "Internal server error." });
  }
});

app.listen(port, () => {
  process.stdout.write(`CardPT server running at http://localhost:${port}\n`);
});
