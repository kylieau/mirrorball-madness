-- New leagues start on Dance Card v3 (docs/design/dance-card-v3/).
-- Apply only after the app that reads 'v3' is deployed: before that, the old
-- app would score a "v3" league with the old rule.
alter table public.scoring_settings alter column dance_card_version set default 'v3';
