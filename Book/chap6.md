# Chapter 6: Finishing the Project
In this chapter we wrap up our query and go over it one more time highlighting the various patterns we've learned so far. This is a good opportunity to test yourself and see what you've learned. Analyze the query and see what patterns you recognize.

So here's the whole query
```sql
 -- Get the user name and collapse the granularity of post_history to the user_id, post_id, activity type and date
 -- Get the user name and collapse the granularity of post_history to the user_id, post_id, activity type and date
WITH post_activity AS (
    SELECT
        ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'create'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edit' 
        END AS activity_type
    FROM
        post_history ph
        INNER JOIN users u 
            ON u.id = ph.user_id
    WHERE
        TRUE 
        AND ph.post_history_type_id BETWEEN 1 AND 6
        AND user_id > 0 --exclude automated processes
        AND user_id IS NOT NULL --exclude deleted accounts
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
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        posts_answers
 )
 -- Finally calculate the post metrics 
, user_post_metrics AS (
    SELECT
        user_id,
        user_name,
        TRY_CAST(activity_date AS DATE) AS activity_date,
        SUM(CASE WHEN activity_type = 'create' AND post_type = 'question' 
                THEN 1 ELSE 0 END) AS questions_created,
        SUM(CASE WHEN activity_type = 'create' AND post_type = 'answer' 
                THEN 1 ELSE 0 END) AS answers_created,
        SUM(CASE WHEN activity_type = 'edit' AND post_type = 'question'
                THEN 1 ELSE 0 END) AS questions_edited,
        SUM(CASE WHEN activity_type = 'edit' AND post_type = 'answer'
                THEN 1 ELSE 0 END) AS answers_edited,
        SUM(CASE WHEN activity_type = 'create'
                THEN 1 ELSE 0 END) AS posts_created,
        SUM(CASE WHEN activity_type = 'edit'
                THEN 1 ELSE 0 END)  AS posts_edited
    FROM 
        post_types pt
        JOIN post_activity pa ON pt.post_id = pa.post_id
    GROUP BY 1,2,3
)
, comments_by_user AS (
    SELECT
        user_id,
        TRY_CAST(creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        comments
    WHERE
        TRUE
    GROUP BY
        1,2
)
, comments_on_user_post AS (
    SELECT
        pa.user_id,
        TRY_CAST(c.creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        comments c
        INNER JOIN post_activity pa ON pa.post_id = c.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'create'
    GROUP BY
        1,2
)
, votes_on_user_post AS (
      SELECT
        pa.user_id,
        TRY_CAST(v.creation_date AS DATE) AS activity_date,
        SUM(CASE WHEN vote_type_id = 2 THEN 1 ELSE 0 END) AS total_upvotes,
        SUM(CASE WHEN vote_type_id = 3 THEN 1 ELSE 0 END) AS total_downvotes,
    FROM
        votes v
        INNER JOIN post_activity pa ON pa.post_id = v.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'create'
    GROUP BY
        1,2
)
, total_metrics_per_user AS (
    SELECT
        pm.user_id,
        pm.user_name,
        CAST(SUM(pm.posts_created) AS NUMERIC) AS posts_created, 
        CAST(SUM(pm.posts_edited) AS NUMERIC) AS posts_edited,
        CAST(SUM(pm.answers_created) AS NUMERIC) AS answers_created,
        CAST(SUM(pm.questions_created) AS NUMERIC) AS questions_created,
        CAST(SUM(vu.total_upvotes) AS NUMERIC) AS total_upvotes,
        CAST(SUM(vu.total_downvotes) AS NUMERIC) AS total_downvotes,
        CAST(SUM(cu.total_comments) AS NUMERIC) AS comments_by_user,
        CAST(SUM(cp.total_comments) AS NUMERIC) AS comments_on_post,
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
    posts_created, 
    answers_created,
    questions_created,
    total_upvotes,
    comments_by_user,
    comments_on_post,
    streak_in_days,
    -- per day metrics
    CASE
        WHEN streak_in_days > 0 THEN
            ROUND(TRY_CAST(posts_created AS NUMERIC) /
                  TRY_CAST(streak_in_days AS NUMERIC), 1)
        ELSE 0
    END AS posts_per_day,
    CASE
        WHEN streak_in_days > 0 THEN
            ROUND(TRY_CAST(posts_edited AS NUMERIC) /
                  TRY_CAST(streak_in_days AS NUMERIC), 1)
        ELSE 0
    END AS edits_per_day,
    CASE
        WHEN streak_in_days > 0 THEN
            ROUND(TRY_CAST(answers_created AS NUMERIC) /
                  TRY_CAST(streak_in_days AS NUMERIC), 1)
        ELSE 0
    END AS answers_per_day,
    CASE
        WHEN streak_in_days > 0 THEN
            ROUND(TRY_CAST(questions_created AS NUMERIC) /
                  TRY_CAST(streak_in_days AS NUMERIC), 1)
        ELSE 0
    END AS questions_per_day,
    CASE
        WHEN streak_in_days > 0 THEN
            ROUND(TRY_CAST(comments_by_user AS NUMERIC) /
                  TRY_CAST(streak_in_days AS NUMERIC), 1)
        ELSE 0
    END AS user_comments_per_day,
    CASE
        WHEN streak_in_days > 0 THEN
            ROUND(TRY_CAST(comments_by_user AS NUMERIC) /
                  TRY_CAST(streak_in_days AS NUMERIC), 1)
        ELSE 0
    END AS user_comments_per_day,

    -- per post metrics
    CASE
        WHEN posts_created > 0 THEN
            ROUND(TRY_CAST(answers_created AS NUMERIC) /
                  TRY_CAST(posts_created AS NUMERIC), 1)
        ELSE 0
    END AS answers_per_post,
    CASE
        WHEN posts_created > 0 THEN
            ROUND(TRY_CAST(questions_created AS NUMERIC) /
                  TRY_CAST(posts_created AS NUMERIC), 1)
        ELSE 0
    END AS questions_per_post,
    CASE
        WHEN posts_created > 0 THEN
            ROUND(TRY_CAST(total_upvotes AS NUMERIC) /
                  TRY_CAST(posts_created AS NUMERIC), 1)
        ELSE 0
    END AS upvotes_per_post,
    CASE
        WHEN posts_created > 0 THEN
            ROUND(TRY_CAST(total_downvotes AS NUMERIC) /
                  TRY_CAST(posts_created AS NUMERIC), 1)
        ELSE 0
    END AS downvotes_per_post,
    CASE
        WHEN posts_created > 0 THEN
            ROUND(TRY_CAST(comments_by_user AS NUMERIC) /
                  TRY_CAST(posts_created AS NUMERIC), 1)
        ELSE 0
    END AS user_comments_per_post,
    CASE
        WHEN posts_created > 0 THEN
            ROUND(TRY_CAST(comments_on_post AS NUMERIC) /
                  TRY_CAST(posts_created AS NUMERIC), 1)
        ELSE 0
    END AS comments_per_post
FROM
    total_metrics_per_user
ORDER BY 
    posts_created DESC;
```

Now that you have all these wonderful metrics you can sort the results by any of them to see different types of users. For example you can sort by `questions_per_post` to see everyone who posts mostly questions or `answers_by_post` to see those who post mostly answers. You can also create new metrics that indicate who your best users are.

## Final Comments

Some of the best uses of this type of table are for customer segmentation or as a feature table for data science.
