/**
 * User engagement score
 */
WITH post_activity AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
        	 WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
        END AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id BETWEEN 1 AND 6
    	AND user_id > 0 --exclude automated processes
    	AND user_id IS NOT NULL --exclude deleted accounts
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
		CAST(activity_date AS DATE) AS activity_date ,
		SUM(CASE WHEN activity_type = 'created' AND post_type = 'question' THEN 1 ELSE 0 END) AS questions_created,
		SUM(CASE WHEN activity_type = 'created' AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answers_created,
		SUM(CASE WHEN activity_type = 'edited'  AND post_type = 'question' THEN 1 ELSE 0 END) AS questions_edited,
		SUM(CASE WHEN activity_type = 'edited'  AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answers_edited,
		SUM(CASE WHEN activity_type = 'created' THEN 1 ELSE 0 END) AS posts_created,
		SUM(CASE WHEN activity_type = 'edited' THEN 1 ELSE 0 END)  AS posts_edited
	FROM post_types pt
		 JOIN post_activity pa ON pt.post_id = pa.post_id
	GROUP BY 1,2,3
	HAVING SUM(CASE WHEN activity_type = 'created' THEN 1 ELSE 0 END) > 0
)
, comments_by_user AS (
    SELECT
        user_id,
        CAST(creation_date AS DATE) AS activity_date,
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
        CAST(c.creation_date AS DATE) AS activity_date,
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
        CAST(v.creation_date AS DATE) AS activity_date,
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
------------------------------------------------
---- Main Query
SELECT
    pm.user_id,
    pm.user_name,
    SUM(pm.posts_created)     	AS posts_created,
    SUM(pm.answers_created) 	AS answers_created,
    SUM(pm.questions_created)	AS questions_created,
    COUNT(pm.activity_date) 	AS streak_in_days,
    ROUND(SUM(pm.posts_created)	  * 1.0 
        / COUNT(pm.activity_date), 1) AS posts_per_day,
    ROUND(SUM(pm.answers_created) * 1.0
        / COUNT(pm.activity_date), 1) AS answers_created_per_day,
    ROUND(SUM(pm.questions_created) * 1.0
        / COUNT(pm.activity_date), 1) AS questions_created_per_day,
    ROUND(SUM(vu.total_upvotes)  * 1.0 
        / COUNT(pm.activity_date), 1) AS upvotes_per_day,
    ROUND(SUM(vu.total_downvotes) * 1.0 
        / COUNT(pm.activity_date), 1) AS downvotes_per_day,
    ROUND(SUM(cp.total_comments)  * 1.0 
        / COUNT(pm.activity_date), 1) AS comments_on_user_posts_per_day,
    ROUND(SUM(cu.total_comments)  * 1.0 
        / COUNT(pm.activity_date), 1) AS comments_by_user_per_day,
    ROUND(SUM(pm.answers_created) * 1.0 
        / SUM(pm.posts_created), 1)   AS answers_per_post_ratio,
    ROUND(SUM(vu.total_upvotes)   * 1.0 
        / SUM(pm.posts_created), 1)   AS upvotes_per_post,
    ROUND(SUM(vu.total_downvotes) * 1.0 
        / SUM(pm.posts_created), 1)   AS downvotes_per_post,
    ROUND(SUM(cp.total_comments)  * 1.0 
        / SUM(pm.posts_created), 1)   AS comments_per_post_on_user_posts,
    ROUND(SUM(cu.total_comments)  * 1.0 
        / SUM(pm.posts_created), 1)   AS comments_by_user_per_per_post
FROM
    user_post_metrics pm
    JOIN votes_on_user_post vu
        ON pm.activity_date = vu.activity_date
        AND pm.user_id = vu.user_id
    JOIN comments_on_user_post cp 
        ON pm.activity_date = cp.activity_date
        AND pm.user_id = cp.user_id
    JOIN comments_by_user cu
        ON pm.activity_date = cu.activity_date
        AND pm.user_id = cu.user_id
-- WHERE
--	pm.user_id = 1144035
GROUP BY
	1,2
ORDER BY 
	posts_created DESC;