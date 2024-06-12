--listing 4.8
SELECT
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    posts_questions q
WHERE
    TRUE
    AND lower(tags) like '%sql%'
LIMIT 10;
