--listing 2.10
SELECT
	COUNT(*)
FROM
	post_history ph
	LEFT JOIN users u
		ON u.id = ph.user_id
WHERE
	TRUE
	AND u.reputation >= 500000;
