--listing 1.1
SELECT table_name
FROM information_schema.tables
WHERE table_name like 'posts_%';
