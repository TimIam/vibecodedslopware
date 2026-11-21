-- Follow-up to storefront_analytics: import_metrics and report were created after the blanket
-- revoke, so they kept Postgres' default EXECUTE for PUBLIC (and so anon). anon still had no USAGE
-- on the schema, so this was unreachable; this removes the second layer's gap. Revokes only.
revoke all on function storefront.import_metrics(text, text, text, jsonb) from public, anon;
revoke all on function storefront.report(date, date) from public, anon;
