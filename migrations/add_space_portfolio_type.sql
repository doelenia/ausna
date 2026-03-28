-- Step 1: add enum label (must run in its own migration / transaction before using `space` in UPDATE)
ALTER TYPE portfolio_type ADD VALUE IF NOT EXISTS 'space';
