--listing 4.21
SELECT
    post_id,
    ph.creation_date,
    user_id
FROM
    post_history ph
    INNER JOIN users u 
        ON u.id = ph.user_id
WHERE
   post_history_type_id = 1
UNION ALL
SELECT
    post_id,
    ph.creation_date,
    user_id
FROM
    post_history ph
    INNER JOIN users u 
        ON u.id = ph.user_id
WHERE
   u.up_votes >= 100;
