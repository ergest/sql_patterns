--listing 1.6
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'votes';