--listing 4.12
WITH cte_lowercase_tags AS (
	SELECT
	    q.id AS post_id,
	    q.creation_date,
	    q.answer_count + q.comment_count as total_activity
	FROM
	    posts_questions q
)
SELECT *
FROM cte_lowercase_tags
WHERE total_activity >= 10
LIMIT 10;
