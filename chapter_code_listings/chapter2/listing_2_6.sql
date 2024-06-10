--listing 2.6
SELECT
	id,
	creation_date,
	post_id,
	post_history_type_id AS type_id,
	user_id 
FROM
	post_history ph
WHERE
	TRUE
	AND ph.user_id = 2702894
LIMIT 10;
