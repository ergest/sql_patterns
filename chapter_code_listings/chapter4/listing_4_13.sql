--listing 4.13
SELECT
    q.id AS post_id,
    q.creation_date,
    DATE_PART('week', creation_date) as week_of_year
FROM
    posts_questions q
WHERE
    date_part('week', creation_date) = 50
LIMIT 10;
