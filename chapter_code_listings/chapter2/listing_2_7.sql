--listing 2.7
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date,
	post_history_type_id AS type_id
FROM
	post_history ph
	INNER JOIN users u 
		ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.user_id = 2702894;
