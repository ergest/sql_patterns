--listing 2.12
SELECT
	COUNT(*)
FROM
	post_history ph
	LEFT JOIN users u
		ON u.id = ph.user_id
WHERE
	u.id IS NULL;
