--listing 1.3
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'post_history';
