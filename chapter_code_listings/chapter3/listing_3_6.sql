--code snippet will not actually run
--listing 3.6
SELECT
	pm.user_id,
	pm.user_name,
	CAST(SUM(pm.posts_created) AS NUMERIC) AS total_posts_created, 
	CAST(SUM(pm.posts_edited) AS NUMERIC)  AS total_posts_edited,
	CAST(SUM(pm.answers_created) AS NUMERIC) AS total_answers_created,
	CAST(SUM(pm.answers_edited) AS NUMERIC)  AS total_answers_edited,
	CAST(SUM(pm.questions_created) AS NUMERIC) AS total_questions_created,
	CAST(SUM(pm.questions_edited) AS NUMERIC)  AS total_questions_edited,
	CAST(SUM(vu.total_upvotes) AS NUMERIC)   AS total_upvotes,
	CAST(SUM(vu.total_downvotes) AS NUMERIC) AS total_downvotes,
	CAST(SUM(cu.total_comments) AS NUMERIC)  AS total_comments_by_user,
	CAST(SUM(cp.total_comments) AS NUMERIC)  AS total_comments_on_post,
	CAST(COUNT(DISTINCT pm.activity_date) AS NUMERIC) AS streak_in_days      
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
GROUP BY
	1,2
    