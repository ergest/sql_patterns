--listing 4.17
    SELECT
        post_id,
        creation_date,
        user_id
    FROM
        post_history
    WHERE
	   post_history_type_id IN (1,2,3);
