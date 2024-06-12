--listing 4.14
SELECT
    q.id AS post_id,
    q.creation_date,
    date_part('week', creation_date) as week_of_year
FROM
    posts_questions q
WHERE
    creation_date >= DATE_TRUNC('week', '2021-01-01'::date + INTERVAL 50 WEEK)
    AND creation_date < DATE_TRUNC('week', '2021-01-01'::date + INTERVAL 51 WEEK)
LIMIT 10;
