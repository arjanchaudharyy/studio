# Logging Layer Plan

## Goals
- Decouple worker components from storage backends (Postgres/Loki) by introducing a Kafka-compatible bus (Redpanda initially).
- Provide a dedicated logging pipeline (structured + leveled) separate from lifecycle events.
- Lay the groundwork to move lifecycle events and custom streams onto the same bus later.

## Phase 1 – Provision Redpanda ✅ COMPLETED
1. ✅ Extended `docker/docker-compose.full.yml` with Redpanda service + console UI.
2. ✅ Added env/config entries (`LOG_KAFKA_BROKERS`, `LOG_KAFKA_TOPIC`, `EVENT_KAFKA_TOPIC`, etc.).
3. ✅ Redpanda available via `docker compose -p shipsec up -d`.
4. ✅ Codebase uses Kafka APIs for agnostic implementation.

## Phase 2 – Logging over the bus ✅ COMPLETED
### Worker ✅
- ✅ `KafkaLogAdapter` implemented in `worker/src/adapters/kafka-log.adapter.ts`
- ✅ `createExecutionContext` routes `logger.info/warn/error` through `logCollector` instead of `trace.record`
- ✅ Structured JSON entries (`runId`, `nodeRef`, `timestamp`, `level`, `stream`, `message`, metadata)
- ✅ Asynchronous, fire-and-forget semantics with batching and retry

### Backend ✅
- ✅ `LogIngestService` implemented that subscribes to `telemetry.logs` topic
- ✅ Enriches entries with org/workflow metadata
- ✅ Forwards to Loki via HTTP push for long-term search
- ✅ Updates `log_stream` metadata table for frontend queries
- ✅ Frontend logs panel queries new Loki-based endpoint instead of `workflow_traces`

## Phase 3 – Events over the bus ✅ COMPLETED
- ✅ Mirrored logging architecture for lifecycle events
- ✅ Worker publishes `TraceEvent` JSON to `telemetry.events` via `KafkaTraceAdapter`
- ✅ Backend `EventIngestService` consumer persists to Postgres (same schema)
- ✅ UI/event APIs unchanged while removing direct DB writes from worker

## Future Phases
- Unify custom streams (terminal, AI agent) as Kafka topics if we want a single ingress point, or retain Redis for ultra-low-latency use cases.
- Add alerting/analytics consumers (e.g., stream logs to Datadog, derive metrics from events) without touching workers.

---

## ✅ ALL PHASES COMPLETED - Logging Layer Fully Operational

### What Was Accomplished:
1. ✅ **Redpanda Infrastructure**: Provisioned in `docker/docker-compose.full.yml`
2. ✅ **Worker Log Producer**: `KafkaLogAdapter` sends logs to `telemetry.logs` topic
3. ✅ **Backend Log Ingestor**: `LogIngestService` forwards logs to Loki + metadata to DB
4. ✅ **Frontend Integration**: Uses generated OpenAPI client for type-safe log fetching
5. ✅ **Events Over Bus**: `KafkaTraceAdapter` + `EventIngestService` for lifecycle events
6. ✅ **OpenAPI Generation**: Fixed to skip ingest services during spec generation

### ⚠️ Known Issue - Frontend Pagination
- **Backend**: Supports full pagination with `hasMore`/`nextCursor`
- **Frontend**: Currently fetches only first 500 logs, no "Load More" functionality
- **Impact**: Large log sets (>500 entries) are truncated in UI
- **Priority**: Medium - logs are functional but incomplete for large datasets

### Future Work:
- Implement proper pagination in `ExecutionInspector.tsx`
- Add "Load More" button and cursor-based fetching
- Consider infinite scroll for better UX
