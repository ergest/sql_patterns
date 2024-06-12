--listing 4.9
SELECT
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    posts_questions q
WHERE
    TRUE
    AND tags ilike '%sql%'
LIMIT 10;
