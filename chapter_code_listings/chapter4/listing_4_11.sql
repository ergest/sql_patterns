--listing 4.11
SELECT
    q.id AS post_id,
    q.creation_date,
    q.answer_count + q.comment_count as total_activity
FROM
    posts_questions q
WHERE
    TRUE
    AND answer_count + comment_count >= 10
LIMIT 10;
