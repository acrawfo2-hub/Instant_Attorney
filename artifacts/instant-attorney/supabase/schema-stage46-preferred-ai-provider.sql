-- Stage 46: user-selectable AI provider preference (Anthropic Claude vs xAI Grok).
-- Default remains Anthropic. Preference currently affects workhorse chat surfaces
-- only; cheap/premium tiers stay on Anthropic until later phases.

alter table profiles
  add column if not exists preferred_ai_provider text not null default 'anthropic';

alter table profiles
  drop constraint if exists profiles_preferred_ai_provider_check;

alter table profiles
  add constraint profiles_preferred_ai_provider_check
  check (preferred_ai_provider in ('anthropic', 'xai'));

comment on column profiles.preferred_ai_provider is
  'User-preferred AI inference provider for workhorse features: anthropic | xai. Default anthropic.';
