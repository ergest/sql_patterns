--listing 4.7
SELECT 
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    posts_questions q
LIMIT 10;
