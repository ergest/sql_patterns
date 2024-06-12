--listing 4.19
SELECT
    post_id,
    creation_date,
    user_id
FROM
    post_history
WHERE
    (
        post_history_type_id = 1
        OR post_history_type_id = 2
        OR post_history_type_id = 3
    )
    AND
    (
        user_id = 17335553
        OR user_id = 17551873
        OR user_id = 15137025
    );