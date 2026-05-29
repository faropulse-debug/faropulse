CREATE OR REPLACE FUNCTION public.commit_upload(
  p_table       text,
  p_location_id uuid,
  p_hash_column text,
  p_hashes      text[],
  p_rows        jsonb
) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE
  v_deleted  bigint := 0;
  v_inserted bigint := 0;
  v_columns  text;
BEGIN
  IF p_table NOT IN ('sales_documents', 'sales_items') THEN
    RAISE EXCEPTION 'commit_upload: table % not allowed', p_table;
  END IF;

  IF p_hashes IS NOT NULL AND array_length(p_hashes, 1) > 0 THEN
    EXECUTE format(
      'DELETE FROM public.%I WHERE location_id = $1 AND %I = ANY($2)',
      p_table, p_hash_column
    ) USING p_location_id, p_hashes;
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
  END IF;

  IF p_rows IS NOT NULL AND jsonb_array_length(p_rows) > 0 THEN
    SELECT string_agg(quote_ident(key), ', ') INTO v_columns
      FROM jsonb_object_keys(p_rows -> 0) AS key;

    EXECUTE format(
      'INSERT INTO public.%I (%s) SELECT %s FROM jsonb_populate_recordset(NULL::public.%I, $1)',
      p_table, v_columns, v_columns, p_table
    ) USING p_rows;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object('deleted', v_deleted, 'inserted', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.commit_upload TO service_role;
