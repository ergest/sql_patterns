--listing 2.1
SELECT 
	creation_date,
	post_id,
	post_history_type_id AS type_id,
	user_id,
	COUNT(*) AS total
FROM post_history
GROUP BY 1,2,3,4
HAVING COUNT(*) > 1;
