--listing 2.2.1
SELECT
    ph.post_id,
    ph.user_id,
    ph.creation_date AS activity_date,
    ph.post_history_type_id
FROM
    post_history ph
WHERE
    TRUE 
    AND ph.post_history_type_id BETWEEN 1 AND 6
    AND ph.user_id > 0 --exclude automated processes
    AND ph.user_id IS NOT NULL --exclude deleted accounts
    AND ph.creation_date >= '2021-12-01'
    AND ph.creation_date <= '2021-12-31'
    AND ph.post_id = 70182248;
