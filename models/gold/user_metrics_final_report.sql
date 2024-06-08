WITH cte_metrics_per_user AS (
    SELECT
        user_id,
        user_name,
        SUM(posts_created) AS posts_created, 
        SUM(posts_edited) AS posts_edited,
        SUM(answers_created) AS answers_created,
        SUM(questions_created) AS questions_created,
        SUM(total_upvotes) AS total_upvotes,
        SUM(total_downvotes) AS total_downvotes,
        SUM(comments_by_user) AS comments_by_user,
        SUM(comments_on_post) AS comments_on_post,
        COUNT(DISTINCT activity_date) AS streak_in_days
    FROM
        {{ ref('all_user_metrics_per_day') }}
    GROUP BY
        1,2
)
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
    {{- safe_divide('posts_created', 'streak_in_days') }} AS posts_per_day,
    {{- safe_divide('posts_edited', 'streak_in_days') }} AS edits_per_day,
    {{- safe_divide('answers_created', 'streak_in_days') }} AS answers_per_day,
    {{- safe_divide('questions_created', 'streak_in_days') }} AS questions_per_day,
    {{- safe_divide('comments_by_user', 'streak_in_days') }} AS user_comments_per_day,
    {{- safe_divide('comments_by_user', 'streak_in_days') }} AS user_comments_per_day,

    -- per post metrics
    {{- safe_divide('answers_created', 'posts_created') }} AS answers_per_post,
    {{- safe_divide('questions_created', 'posts_created') }} AS questions_per_post,
    {{- safe_divide('total_upvotes', 'posts_created') }} AS upvotes_per_post,
    {{- safe_divide('total_downvotes', 'posts_created') }} AS downvotes_per_post,
    {{- safe_divide('comments_by_user', 'posts_created') }} AS user_comments_per_post,
    {{- safe_divide('comments_on_post', 'posts_created') }} AS comments_per_post
FROM
    cte_metrics_per_user
