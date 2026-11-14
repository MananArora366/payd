# Payd — System Architecture & Kiro Spec Blueprint
> **Careem Builders '26 Hackathon** • Careem, AWS & DataCamp  
> Architecture: Spec-Driven Development via AWS Kiro • AWS Bedrock • Careem MCP

---

## 1. Hackathon Integration Matrix

| Recommended Tool | Integration Location in Payd | Verification Evidence |
| :--- | :--- | :--- |
| **AWS Bedrock** | `src/lib/ai/bedrock.ts`, `/api/ai/interpret`, `/api/ai/query` | `@aws-sdk/client-bedrock-runtime` calling **Claude 3.5 Sonnet** & **Amazon Nova** with offline fallback |
| **Kiro (AWS IDE)** | `.kiro/specs/*`, `.kiro/config.json`, `.kiro/BLUEPRINT.md` | Formal Spec-Driven Development (SDD) contracts defining ledger invariants, MCP schemas, and UI states |
| **Careem MCP** | `src/lib/mcp/careemTools.ts`, `server.ts`, `/api/mcp` | Official JSON-RPC 2.0 tools connecting to `https://mcp.careemapis.com/mcp` (Rides, Food, Quik, Pay) |

---

## 2. Super-App Scale Architecture

```
                                 ┌──────────────────────────────┐
                                 │      CAREEM SUPER APP        │
                                 │ (Rides, Food, Quik, Pay)     │
                                 └──────────────┬───────────────┘
                                                │
                                                ▼ Careem MCP (JSON-RPC 2.0)
                                    https://mcp.careemapis.com/mcp
                                                │
┌──────────────────────────────┐                │
│       AWS BEDROCK AI         │◄───────────────┤
│ • Claude 3.5 Sonnet          │                │
│ • Amazon Nova Pro            │                ▼
│ • Bedrock Converse Runtime   │   ┌──────────────────────────────┐
└──────────────┬───────────────┘   │     PAYD SOCIAL FINANCE      │
               │                   │ (Next.js 15 PWA + Kiro Spec) │
               ▼                   └──────────────┬───────────────┘
  Natural Language Intent & Vision                │
                                                  ▼
                                   ┌──────────────────────────────┐
                                   │   ZERO-LOSS DETERMINISTIC    │
                                   │        LEDGER ENGINE         │
                                   │  • Integer Fils (AED)        │
                                   │  • Min-Cash-Flow Graph       │
                                   │  • 42 Passing Acceptance     │
                                   └──────────────────────────────┘
```

---

## 3. High-Impact Hackathon Differentiators

1. **Deterministic Zero-Loss Ledger (INV-01 to INV-04):**
   - Financial balances must never hallucinate. Money is stored as signed 64-bit integer fils (`1 AED = 100 fils`), conserving 100% of money across any split division.
2. **Careem MCP Native Loop:**
   - Take a **Careem Comfort Ride** $\to$ Call `careem_rides_split_fare` $\to$ Automatically splits among friends $\to$ Generates instant **Careem Pay / Aani** settlement link $\to$ Order **Careem Food** with repaid money.
3. **Fair-Payer Coffee Roulette:**
   - Culturally tuned for Middle Eastern generosity—a debt-weighted random wheel deciding who pays coffee or lunch based on real-time net balances.
4. **Reimbursement Lag Analytics:**
   - Detects collection bottlenecks before awkward conversations happen, with polite 1-tap WhatsApp and Careem Pay nudges.
