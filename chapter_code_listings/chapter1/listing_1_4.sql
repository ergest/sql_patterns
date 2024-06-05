--listing 1.4
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'users';