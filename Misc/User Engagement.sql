/**
 * User engagement score
 */

WITH post_activity AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE ph.post_history_type_id
        	WHEN 1 THEN 'created'
        	WHEN 4 THEN 'edited' 
        END AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id IN (1,4)
    	AND user_id > 0 --exclude automated processes
    	AND user_id IS NOT NULL
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4,5
)
,post_types AS (
    SELECT
		id AS post_id,
        'question' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_questions`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_answers`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
 )
, user_post_metrics AS (
	SELECT
		user_id,
		user_name,
		CAST(DATE_TRUNC(activity_date, DAY) AS DATE) AS activity_date ,
		SUM(CASE WHEN activity_type = 'created' AND post_type = 'question' THEN 1 ELSE 0 END) AS question_created,
		SUM(CASE WHEN activity_type = 'created' AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_created,
		SUM(CASE WHEN activity_type = 'edited'  AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edited,
		SUM(CASE WHEN activity_type = 'edited'  AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edited	
	FROM post_types pt
		 JOIN post_activity pa ON pt.post_id = pa.post_id
	GROUP BY 1,2,3
)
, comments_by_user AS (
    SELECT
        user_id,
        CAST(DATE_TRUNC(creation_date, DAY) AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        `bigquery-public-data.stackoverflow.comments`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
	GROUP BY
        1,2
)
, comments_on_user_post AS (
	SELECT
        pa.user_id,
        CAST(DATE_TRUNC(c.creation_date, DAY) AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        `bigquery-public-data.stackoverflow.comments` c
        INNER JOIN post_activity pa ON pa.post_id = c.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
    	AND c.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND c.creation_date <= CAST('2021-09-30' as TIMESTAMP)
	GROUP BY
        1,2
)
, votes_on_user_post AS (
  	SELECT
        pa.user_id,
        CAST(DATE_TRUNC(v.creation_date, DAY) AS DATE) AS activity_date,
        SUM(CASE WHEN vote_type_id = 2 THEN 1 ELSE 0 END) AS total_upvotes,
        SUM(CASE WHEN vote_type_id = 3 THEN 1 ELSE 0 END) AS total_downvotes,
    FROM
        `bigquery-public-data.stackoverflow.votes` v
        INNER JOIN post_activity pa ON pa.post_id = v.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
    	AND v.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND v.creation_date <= CAST('2021-09-30' as TIMESTAMP)
	GROUP BY
        1,2
)
SELECT *
FROM votes_on_user_post
WHERE user_id = 16366214;


------------------------------------------------
---- Main Query
SELECT
    pm.post_creator_id,
    pm.post_creator_name,
    SUM(pm.total_posts)     AS posts,
    SUM(pm.total_answers) 	AS answers,
    SUM(pm.total_questions)	AS questions,
    COUNT(pm.creation_date) AS streak_in_days,
    ROUND(SUM(pm.total_posts) 	  * 1.0 / COUNT(pm.creation_date), 1) AS posts_per_day,
    ROUND(SUM(pm.total_answers)   * 1.0 / COUNT(pm.creation_date), 1) AS answers_per_day,
    ROUND(SUM(pm.total_questions) * 1.0 / COUNT(pm.creation_date), 1) AS questions_per_day,
    ROUND(SUM(vu.total_upvotes)   * 1.0 / COUNT(pm.creation_date), 1) AS upvotes_per_day,
    ROUND(SUM(vu.total_downvotes) * 1.0 / COUNT(pm.creation_date), 1) AS downvotes_per_day,
    ROUND(SUM(cp.total_comments)  * 1.0 / COUNT(pm.creation_date), 1) AS comments_on_user_posts_per_day,
    ROUND(SUM(cu.total_comments)  * 1.0 / COUNT(pm.creation_date), 1) AS comments_by_user_per_day,
    ROUND(SUM(pm.total_answers)   * 1.0 / SUM(pm.total_posts), 1)  AS answers_per_post_ratio,
    ROUND(SUM(vu.total_upvotes)   * 1.0 / SUM(pm.total_posts), 1)  AS upvotes_per_post,
    ROUND(SUM(vu.total_downvotes) * 1.0 / SUM(pm.total_posts), 1)  AS downvotes_per_post,
    ROUND(SUM(cp.total_comments)  * 1.0 / SUM(pm.total_posts), 1)  AS comments_per_post_on_user_posts,
    ROUND(SUM(cu.total_comments)  * 1.0 / SUM(pm.total_posts), 1)  AS comments_by_user_per_per_post
FROM
    post_metrics_per_user pm
    JOIN votes_per_user vu
        ON pm.creation_date = vu.creation_date
        AND pm.post_creator_id = vu.post_creator_id
    JOIN comments_on_user_post cp 
        ON pm.creation_date = cp.creation_date
        AND pm.post_creator_id = cp.post_creator_id
    JOIN comments_per_user cu
        ON pm.creation_date = cu.creation_date
        AND pm.post_creator_id = cu.user_id
GROUP BY
    1,2
ORDER BY
    posts desc
--*/