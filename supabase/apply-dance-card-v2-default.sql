-- Leagues created from now on score Dance Card v2 (docs/design/dance-card-v2/).
-- Apply only after the app that reads dance_card_version is deployed: before
-- that, the old app would score a "v2" league with the old rule.
alter table public.scoring_settings alter column dance_card_version set default 'v2';
