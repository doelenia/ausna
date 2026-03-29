-- Normalize every non-human portfolio row to canonical `type = space`.
-- Prerequisite: `portfolio_type` enum includes `space` (see add_space_portfolio_type.sql).
-- Safe to re-run: rows already `space` are unchanged.

UPDATE portfolios
SET type = 'space'::portfolio_type
WHERE type IS DISTINCT FROM 'human'::portfolio_type;
