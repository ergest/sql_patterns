--listing 4.15
WITH cte_user_activity_by_type AS (
    SELECT
        user_id,
        CASE WHEN post_history_type_id IN (1,2,3) THEN 'create'
             WHEN post_history_type_id IN (4,5,6) THEN 'edit' 
        END AS activity_type,
        COUNT(*) as total_activity
    FROM
        post_history
    GROUP BY
        1,2
    UNION
    SELECT
        user_id,
        'commented' AS activity_type,
        COUNT(*) as total_activity
    FROM
        comments
    GROUP BY
        1,2
)
SELECT
    user_id,
    sum(total_activity) as total_activity
FROM
    cte_user_activity_by_type
GROUP BY 1
LIMIT 10;
