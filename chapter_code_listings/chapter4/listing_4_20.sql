--listing 4.20
SELECT
    ph.post_id,
    ph.creation_date,
    u.display_name
FROM
    post_history ph
    INNER JOIN users u 
        ON u.id = ph.user_id
WHERE
   ph.post_history_type_id = 1 OR u.up_votes >= 100;
