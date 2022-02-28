## Chapter 7: Finishing the Project
We've now explored all the sections of the query so let's see the whole thing in one place so we can see all the patterns in action. 

```
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
-- Get the post types we care about questions and answers only and combine them
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
 -- Finally calculate the post metrics at the user, date granularity
, user_post_metrics AS (
    SELECT
        user_id,
        user_name,
        CAST(activity_date AS DATE) AS activity_date ,
        SUM(CASE WHEN activity_type = 'created' 
			AND post_type = 'question' THEN 1 ELSE 0 END) AS questions_created,
        SUM(CASE WHEN activity_type = 'created' 
			AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answers_created,
        SUM(CASE WHEN activity_type = 'edited'  
			AND post_type = 'question' THEN 1 ELSE 0 END) AS questions_edited,
        SUM(CASE WHEN activity_type = 'edited'  
			AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answers_edited,
        SUM(CASE WHEN activity_type = 'created' THEN 1 ELSE 0 END) AS posts_created,
        SUM(CASE WHEN activity_type = 'edited' THEN 1 ELSE 0 END)  AS posts_edited
    FROM post_types pt
         JOIN post_activity pa ON pt.post_id = pa.post_id
    GROUP BY 1,2,3
)
-- Calculate the comments metics at the user, date granularity
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
-- Calculate the votes metrics at the user, date granularity
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
-- Combine all the above metrics in one CTE
, total_metrics_per_user AS (
    SELECT
        pm.user_id,
        pm.user_name,
        SUM(pm.posts_created)            AS total_posts_created, 
        SUM(pm.posts_edited)             AS total_posts_edited,
        SUM(pm.answers_created)          AS total_answers_created,
        SUM(pm.answers_edited)           AS total_answers_edited,
        SUM(pm.questions_created)        AS total_questions_created,
        SUM(pm.questions_edited)         AS total_questions_edited,
        SUM(vu.total_upvotes)            AS total_upvotes,
        SUM(vu.total_downvotes)          AS total_downvotes,
        SUM(cu.total_comments)           AS total_comments_by_user,
        SUM(cp.total_comments)           AS total_comments_on_post,
        COUNT(DISTINCT pm.activity_date) AS streak_in_days      
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
---- Main Query - Calculate all derived metrics
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
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_posts_created, streak_in_days), 0) AS NUMERIC), 1)          AS posts_per_day,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_posts_edited, streak_in_days), 0) AS NUMERIC), 1)           AS edits_per_day,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_answers_created, streak_in_days), 0) AS NUMERIC), 1)        AS answers_per_day,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_questions_created, streak_in_days), 0) AS NUMERIC), 1)      AS questions_per_day,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_comments_by_user, streak_in_days), 0) AS NUMERIC), 1)       AS comments_by_user_per_day,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_answers_created, total_posts_created), 0) AS NUMERIC), 1)   AS answers_per_post,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_questions_created, total_posts_created), 0) AS NUMERIC), 1) AS questions_per_post,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_upvotes, total_posts_created), 0) AS NUMERIC), 1)           AS upvotes_per_post,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_downvotes, total_posts_created), 0) AS NUMERIC), 1)         AS downvotes_per_post,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_comments_by_user, total_posts_created), 0) AS NUMERIC), 1)  AS user_comments_per_post,
    ROUND(CAST(IFNULL(SAFE_DIVIDE(total_comments_on_post, total_posts_created), 0) AS NUMERIC), 1)  AS comments_on_post_per_post
FROM
    total_metrics_per_user
ORDER BY 
    total_questions_created DESC;
```

There's one final pattern we use in the final CTE. We pre-calculate all the aggregates at the user level and then add a few more ratio-based metrics. You'll notice that we use two functions to shape the results: `CAST()` is used because SQL performs integer division and for the ratios we want to show the remainder, and then `ROUND()` is used to round the remainder to a single decimal point.

Now that you have all these wonderful metrics you can sort it by any of the metrics. For example you can sort by `questions_per_post` to see everyone who posts mostly questions or `answers_by_post` to see those who post mostly answers. You can also create new metrics that indicate who your best users are.

Some of the best uses of this type of table are for customer segmentation or as a feature table for data science.

Could we have written this query in fewer lines using subqueries? Of course! The power of SQL is that there's many ways to solve a problem, especially one as complex as this. But, by splitting our query up into multiple CTEs, aligning the granularity on the CTEs, chaining them carefully together we can achieve a solution that's cleaner, easier to read and understand, and easier to maintain.