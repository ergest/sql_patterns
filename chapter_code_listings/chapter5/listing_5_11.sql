--listing 5.11
SELECT
    id,
    COALESCE(display_name, 'unknown') AS user_name,
    COALESCE(about_me, 'unknown') AS about_me,
    COALESCE(age, 'unknown') AS age,
    COALESCE(creation_date, '1900-01-01') AS creation_date,
    COALESCE(last_access_date, '1900-01-01') AS last_access_date,
    COALESCE(location, 'unknown') AS location,
    COALESCE(reputation, 0) AS reputation,
    COALESCE(up_votes, 0) AS up_votes,
    COALESCE(down_votes, 0) AS down_votes,
    COALESCE(views, 0) AS views,
    COALESCE(profile_image_url, 'unknown') AS profile_image_url,
    COALESCE(website_url, 'unknown') AS website_url
FROM
    users
LIMIT 10;
