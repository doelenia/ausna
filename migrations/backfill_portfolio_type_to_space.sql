-- Step 2: run after add_space_portfolio_type.sql is committed
UPDATE portfolios SET type = 'space'::portfolio_type WHERE type::text = 'portfolio';
