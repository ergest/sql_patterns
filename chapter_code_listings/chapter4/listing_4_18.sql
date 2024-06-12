--listing 4.18
    SELECT
        post_id,
        creation_date,
        user_id
    FROM
        post_history
    WHERE
	   post_history_type_id = 1
	   OR post_history_type_id = 2
	   OR post_history_type_id = 3;
       