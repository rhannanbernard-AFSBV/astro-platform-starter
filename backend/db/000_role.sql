-- Local application role. The password is a development default; replace it before
-- any shared deployment. End users never connect as this role. The API sets
-- transaction-local GUCs only after it has authenticated the caller.
SELECT format('CREATE ROLE allyanna_app LOGIN PASSWORD %L', 'allyanna_app_dev')
WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'allyanna_app')
\gexec

ALTER ROLE allyanna_app
  WITH LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE
  PASSWORD 'allyanna_app_dev';
