--listing 5.12
WITH cte_test_data AS (
    SELECT 94 as comments_on_post, 38 as posts_created
    UNION ALL
    SELECT 62, 0
    UNION ALL
    SELECT 39, 20
    UNION ALL
    SELECT 34, 19
    UNION ALL
    SELECT 167, 120
    UNION ALL
    SELECT 189, 48
    UNION ALL
    SELECT 96, 17
    UNION ALL
    SELECT 15, 15
)
SELECT
    ROUND(CAST(comments_on_post AS NUMERIC) / 
          CAST(posts_created AS NUMERIC), 1) AS comments_on_post_per_post
FROM
    cte_test_data
WHERE
    posts_created > 0;
    