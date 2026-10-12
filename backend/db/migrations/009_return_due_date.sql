-- A filed return can store the date the turnover tax is due.
-- This file does not store a statutory percentage.

ALTER TABLE allyanna.tot_returns
  ADD COLUMN due_on date,
  ADD CONSTRAINT tot_returns_due CHECK (due_on IS NULL OR due_on >= period_end);
