-- Append-only event log for upload operations (Stripe-grade audit trail)
-- Records every step of every upload: received, validated, parsed, committed, rejected, rolled_back
-- Triggers block UPDATE and DELETE: defense in depth at DB level

CREATE TABLE IF NOT EXISTS public.upload_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL,
  event_type   TEXT NOT NULL,
  contract_id  TEXT NOT NULL,
  org_id       UUID,
  location_id  UUID,
  payload      JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_upload_events_event_id   ON public.upload_events(event_id);
CREATE INDEX idx_upload_events_event_type ON public.upload_events(event_type);
CREATE INDEX idx_upload_events_contract   ON public.upload_events(contract_id);
CREATE INDEX idx_upload_events_location   ON public.upload_events(location_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.block_upload_events_modifications() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'upload_events is append-only (% blocked)', TG_OP;
END;
$$;

CREATE TRIGGER trg_block_update_upload_events
  BEFORE UPDATE ON public.upload_events
  FOR EACH ROW EXECUTE FUNCTION public.block_upload_events_modifications();

CREATE TRIGGER trg_block_delete_upload_events
  BEFORE DELETE ON public.upload_events
  FOR EACH ROW EXECUTE FUNCTION public.block_upload_events_modifications();

COMMENT ON TABLE public.upload_events IS 'Append-only event log. INSERTs only. UPDATE/DELETE blocked by trigger.';
