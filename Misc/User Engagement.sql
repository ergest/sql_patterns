-- Get the user name and collapse the granularity of post_history to the user_id, post_id, activity type and date
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
        post_history ph
        INNER JOIN users u on u.id = ph.user_id
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
-- Get the post types we care about questions and answers only and combine them in one CTE
,post_types AS (
    SELECT
        id AS post_id,
        'question' AS post_type,
    FROM
        posts_questions
    WHERE
        TRUE
        AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        posts_answers
    WHERE
        TRUE
        AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
 )
 -- Finally calculate the post metrics 
, user_post_metrics AS (
    SELECT
        user_id,
        user_name,
        CAST(activity_date AS DATE) AS activity_date,
        SUM(CASE WHEN activity_type = 'created'
            AND post_type = 'question' THEN 1 ELSE 0 END) AS questions_created,
        SUM(CASE WHEN activity_type = 'created'
            AND post_type = 'answer' THEN 1 ELSE 0 END) AS answers_created,
        SUM(CASE WHEN activity_type = 'edited'
            AND post_type = 'question' THEN 1 ELSE 0 END) AS questions_edited,
        SUM(CASE WHEN activity_type = 'edited'
            AND post_type = 'answer' THEN 1 ELSE 0 END) AS answers_edited,
        SUM(CASE WHEN activity_type = 'created' THEN 1 ELSE 0 END) AS posts_created,
        SUM(CASE WHEN activity_type = 'edited' THEN 1 ELSE 0 END)  AS posts_edited
    FROM post_types pt
         JOIN post_activity pa ON pt.post_id = pa.post_id
    GROUP BY 1,2,3
)
, comments_by_user AS (
    SELECT
        user_id,
        CAST(creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        comments
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
        comments c
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
        votes v
        INNER JOIN post_activity pa ON pa.post_id = v.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
        AND v.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND v.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
        1,2
)
, total_metrics_per_user AS (
    SELECT
        pm.user_id,
        pm.user_name,
        CAST(SUM(pm.posts_created) AS NUMERIC)     AS total_posts_created, 
        CAST(SUM(pm.posts_edited) AS NUMERIC)      AS total_posts_edited,
        CAST(SUM(pm.answers_created) AS NUMERIC)   AS total_answers_created,
        CAST(SUM(pm.answers_edited) AS NUMERIC)    AS total_answers_edited,
        CAST(SUM(pm.questions_created) AS NUMERIC) AS total_questions_created,
        CAST(SUM(pm.questions_edited) AS NUMERIC)  AS total_questions_edited,
        CAST(SUM(vu.total_upvotes) AS NUMERIC)     AS total_upvotes,
        CAST(SUM(vu.total_downvotes) AS NUMERIC)   AS total_downvotes,
        CAST(SUM(cu.total_comments) AS NUMERIC)    AS total_comments_by_user,
        CAST(SUM(cp.total_comments) AS NUMERIC)    AS total_comments_on_post,
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
)
------------------------------------------------
---- Main Query
SELECT
    user_id,
    user_name,
    total_posts_created, 
    total_answers_created,
    total_answers_edited,
    total_questions_created,
    total_questions_edited,
    total_upvotes,
    total_comments_by_user,
    total_comments_on_post,
    streak_in_days,
    ROUND(IFNULL(DIVIDE(total_posts_created, streak_in_days), 0), 1) AS posts_per_day,
    ROUND(IFNULL(DIVIDE(total_posts_edited, streak_in_days), 0), 1) AS edits_per_day,
    ROUND(IFNULL(DIVIDE(total_answers_created, streak_in_days), 0), 1) AS answers_per_day,
    ROUND(IFNULL(DIVIDE(total_questions_created, streak_in_days), 0), 1) AS questions_per_day,
    ROUND(IFNULL(DIVIDE(total_comments_by_user, streak_in_days), 0), 1) AS comments_by_user_per_day,
    ROUND(IFNULL(DIVIDE(total_answers_created, total_posts_created), 0), 1) AS answers_per_post,
    ROUND(IFNULL(DIVIDE(total_questions_created, total_posts_created), 0), 1) AS questions_per_post,
    ROUND(IFNULL(DIVIDE(total_upvotes, total_posts_created), 0), 1) AS upvotes_per_post,
    ROUND(IFNULL(DIVIDE(total_downvotes, total_posts_created), 0), 1) AS downvotes_per_post,
    ROUND(IFNULL(DIVIDE(total_comments_by_user, total_posts_created), 0), 1)  AS user_comments_per_post,
    ROUND(IFNULL(DIVIDE(total_comments_on_post, total_posts_created), 0), 1)  AS comments_on_post_per_post
FROM
    total_metrics_per_user
ORDER BY 
    total_questions_created DESC;