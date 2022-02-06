/**
 * User engagement score
 */


-- number of total posts
WITH date_parameters AS (
    SELECT
        CAST('2021-06-01' as timestamp) as start_date,
        CAST('2021-09-30' as timestamp) as end_date
)
WITH post_activity AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE ph.post_history_type_id
        	WHEN 1 THEN 'created'
        	WHEN 4 THEN 'edited' 
        END AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
        CROSS JOIN date_parameters dt
    WHERE
    	TRUE 
    	AND ph.post_history_type_id IN (1,4)
    	AND user_id > 0 --exclude automated processes
    	AND user_id IS NOT NULL
    	AND ph.creation_date >= start_date
    	AND ph.creation_date <= end_date 
    GROUP BY
    	1,2,3,4,5
)
, post_types as (
    SELECT
        id AS post_id,
        p.creation_date,
        ifnull(safe_cast(p.favorite_count AS INTEGER), 0) AS favorite_count,
        'question' AS post_type,
        p.score AS post_score,
        ph.user_id AS post_creator_id,
        ph.user_name AS post_creator_name
    FROM
        `bigquery-public-data.stackoverflow.posts_questions` p
        INNER JOIN post_history ph on p.id = ph.post_id
        CROSS JOIN date_parameters dt
    WHERE
        TRUE
        AND p.creation_date >= dt.start_date
        AND p.creation_date <= dt.end_date
    UNION ALL
    SELECT
        id AS post_id,
        p.creation_date,
        ifnull(safe_cast(p.favorite_count AS INTEGER), 0) AS favorite_count,
        'answer' AS post_type,
        p.score AS post_score,
        ph.user_id AS post_creator_id,
        ph.user_name AS post_creator_name
    FROM
        `bigquery-public-data.stackoverflow.posts_answers` p
        INNER JOIN post_history ph on p.id = ph.post_id
        CROSS JOIN date_parameters dt
    WHERE
        TRUE
        AND p.creation_date >= dt.start_date
        AND p.creation_date <= dt.end_date
)
, votes_per_user as (
    select
        p.post_creator_id,
        cast(v.creation_date as date) as creation_date,
        sum(case when vote_type_id = 2 then 1 else 0 end) as total_upvotes,
        sum(case when vote_type_id = 3 then 1 else 0 end) as total_downvotes
    from
        `bigquery-public-data.stackoverflow.votes` v
        join posts p on v.post_id = p.post_id
        cross join date_parameters dt
    where
        true 
        and v.creation_date >= dt.start_date
        and v.creation_date <= dt.end_date
    group by
        1,2
)
, comments_on_user_post as (
    select
        p.post_creator_id,
        cast(c.creation_date as date) as creation_date,
        count(*) as total_comments
    from
        `bigquery-public-data.stackoverflow.comments` c
        join posts p on c.post_id = p.post_id
        cross join date_parameters dt
    where
        true
        and c.creation_date >= dt.start_date
        and c.creation_date <= dt.end_date
    group by
        1,2
)
, comments_per_user as (
    select
        c.user_id,
        cast(c.creation_date as date) as creation_date,
        count(*) as total_comments
    from
        `bigquery-public-data.stackoverflow.comments` c
        cross join date_parameters dt
    where
        true 
        and c.creation_date >= dt.start_date
        and c.creation_date <= dt.end_date
    group by
        1,2
)
, post_metrics_per_user as (
    select
        cast(creation_date as date) as creation_date,
        p.post_creator_name,
        p.post_creator_id,
        sum(case when post_type = 'answer' then 1 else 0 end) as total_answers,
        sum(case when post_type = 'question' then 1 else 0 end) as total_questions,
        count(*) as total_posts
    from
        posts p
    group by
        1,2,3
    having
        count(*) > 1
)
------------------------------------------------
---- Main Query
select
    pm.post_creator_id,
    pm.post_creator_name,
    sum(pm.total_posts)     as posts,
    sum(pm.total_answers) 	as answers,
    sum(pm.total_questions)	as questions,
    count(pm.creation_date) as streak_in_days,
    round(sum(pm.total_posts) 	  * 1.0 / count(pm.creation_date), 1) as posts_per_day,
    round(sum(pm.total_answers)   * 1.0 / count(pm.creation_date), 1) as answers_per_day,
    round(sum(pm.total_questions) * 1.0 / count(pm.creation_date), 1) as questions_per_day,
    round(sum(vu.total_upvotes)   * 1.0 / count(pm.creation_date), 1) as upvotes_per_day,
    round(sum(vu.total_downvotes) * 1.0 / count(pm.creation_date), 1) as downvotes_per_day,
    round(sum(cp.total_comments)  * 1.0 / count(pm.creation_date), 1) as comments_on_user_posts_per_day,
    round(sum(cu.total_comments)  * 1.0 / count(pm.creation_date), 1) as comments_by_user_per_day,
    round(sum(pm.total_answers)   * 1.0 / sum(pm.total_posts), 1)  as answers_per_post_ratio,
    round(sum(vu.total_upvotes)   * 1.0 / sum(pm.total_posts), 1)  as upvotes_per_post,
    round(sum(vu.total_downvotes) * 1.0 / sum(pm.total_posts), 1)  as downvotes_per_post,
    round(sum(cp.total_comments)  * 1.0 / sum(pm.total_posts), 1)  as comments_per_post_on_user_posts,
    round(sum(cu.total_comments)  * 1.0 / sum(pm.total_posts), 1)  as comments_by_user_per_per_post
from
    post_metrics_per_user pm
    join votes_per_user vu
        on pm.creation_date = vu.creation_date
        and pm.post_creator_id = vu.post_creator_id
    join comments_on_user_post cp 
        on pm.creation_date = cp.creation_date
        and pm.post_creator_id = cp.post_creator_id
    join comments_per_user cu
        on pm.creation_date = cu.creation_date
        and pm.post_creator_id = cu.user_id
group by
    1,2
order by
    posts desc
--*/