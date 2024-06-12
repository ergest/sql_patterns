--code snippet will not run
--listing 4.5
,post_types AS (
    SELECT
	    pq.*,
		id AS post_id,
        'question' AS post_type,
    FROM
        posts_questions pq
    UNION ALL
    SELECT
	    pa.*,
        id AS post_id,
        'answer' AS post_type,
    FROM
        posts_answers pa
 )
