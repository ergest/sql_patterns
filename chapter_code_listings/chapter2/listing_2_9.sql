--listing 2.9
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	post_history ph
	LEFT JOIN users u
		ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 70286266
ORDER BY
	activity_date;
