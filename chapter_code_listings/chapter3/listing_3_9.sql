--code snippet will not actually run
--listing 3.9
SELECT
    user_id,
    CAST(pa.activity_date AS DATE) AS activity_date,
    SUM(CASE WHEN activity_type = 'create'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_created,
    SUM(CASE WHEN activity_type = 'create'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_created,
    SUM(CASE WHEN activity_type = 'edit'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edited,
    SUM(CASE WHEN activity_type = 'edit'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edited  
FROM
	post_activity pa
    JOIN post_types pt ON pt.post_id = pa.post_id
GROUP BY
	1,2
