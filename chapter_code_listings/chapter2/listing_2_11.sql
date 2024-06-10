--listing 2.11
SELECT
	COUNT(*)
FROM
	post_history ph
	LEFT JOIN users u
		ON u.id = ph.user_id
		AND u.reputation >= 500000;
