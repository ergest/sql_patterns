--listing 4.16
WITH cte_user_activity_by_type AS (
    SELECT
        user_id,
        CASE WHEN post_history_type_id IN (1,2,3) THEN 'create'
             WHEN post_history_type_id IN (4,5,6) THEN 'edit' 
        END AS activity_type
    FROM
        post_history
    UNION ALL
    SELECT
        user_id,
        'comment' AS activity_type
    FROM
        comments
)
SELECT
    user_id,
    COUNT(*) as total_activity
FROM
    cte_user_activity_by_type
LIMIT 10;
