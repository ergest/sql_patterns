/**
 * User engagement score
 */

-- number of total posts
with date_parameters as (
    select
        cast('2021-06-01' as timestamp) as start_date,
        cast('2021-09-30' as timestamp) as end_date
)
, post_history as ( --rewrite this wirh row_num() to be sure there's no dupes for each history type, in fact check
    select
        ph.post_id as post_id,
        ph.user_id,
        u.display_name as user_name,
        ph.creation_date as revision_date,
        case 
            when ph.post_history_type_id in (1,2,3) then 'posted'
            when ph.post_history_type_id in (4,5,6) then 'edited'
            when ph.post_history_type_id in (7,8,9) then 'rolledback'
        end as activity_type,
        row_number() over(partition by ph.post_id, ph.user_id order by ph.creation_date asc) as row_id
    from
        `bigquery-public-data.stackoverflow.post_history` ph
        join `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
        cross join date_parameters dt
    where
        true
        and user_id > 0 --anything < 0 are automated processes
        and post_history_type_id between 1 and 9
        and ph.creation_date >= dt.start_date
        and ph.creation_date <= dt.end_date
)
, post_history2 as (
    select
        ph.post_id as post_id,
        ph.user_id,
        u.display_name as user_name,
        ph.creation_date as revision_date,
        case 
            when ph.post_history_type_id in (1,2,3) then 'posted'
            when ph.post_history_type_id in (4,5,6) then 'edited'
            when ph.post_history_type_id in (7,8,9) then 'rolledback'
        end as activity_type,
		count(*)
    from
        `bigquery-public-data.stackoverflow.post_history` ph
        join `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
        cross join date_parameters dt
    where
        true
        and user_id > 0 --anything < 0 are automated processes
        and post_history_type_id between 1 and 9
        and ph.creation_date >= dt.start_date
        and ph.creation_date <= dt.end_date
    group by
        1,2,3,4,5
)
, posts as (
    select
        id as post_id,
        p.creation_date,
        ifnull(safe_cast(p.favorite_count as integer), 0) as favorite_count,
        'question' as post_type,
        p.score as post_score,
        ph.user_id as post_creator_id,
        ph.user_name as post_creator_name
    from
        `bigquery-public-data.stackoverflow.posts_questions` p
        join post_history ph on p.id = ph.post_id
        cross join date_parameters dt
    where
        true
        and ph.row_id = 1
        and ph.activity_type = 'posted'
        and p.creation_date >= dt.start_date
        and p.creation_date <= dt.end_date
    union all
    select
        id as post_id,
        p.creation_date,
        ifnull(safe_cast(p.favorite_count as integer), 0) as favorite_count,
        'answer' as post_type,
        p.score as post_score,
        ph.user_id as post_creator_id,
        ph.user_name as post_creator_name
    from
        `bigquery-public-data.stackoverflow.posts_answers` p
        join post_history ph on p.id = ph.post_id
        cross join date_parameters dt
    where
        true
        and ph.row_id = 1
        and ph.activity_type = 'posted'
        and p.creation_date >= dt.start_date
        and p.creation_date <= dt.end_date
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