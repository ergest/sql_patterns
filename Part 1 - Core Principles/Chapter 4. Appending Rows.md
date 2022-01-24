Just like a `JOIN` adds columns to a result set a `UNION` appends rows to it by combining two or more tables length-wise. There are two types of unions, `UNION ALL` and `UNION` (distinct) 

`UNION ALL` will append two tables regardless of whether they both have the exact same row which of course will cause duplicates. `UNION` (distinct) will append the tables and remove all matching rows from the second one thus guaranteeing unique rows for the final result set. 

One of the most common use cases for `UNION` is when you have similar shape data coming from multiple divisions or business units of a company and it needs to be combined to create a single reporting table for finance. Same thing if you have 

Most SQL flavors only use `UNION` keyword for the distinct version, but BigQuery forces you to use `UNION DISTINCT` as a full keyword making the query far more explicit

Appending rows to a table also has two requirements:
1. The number of the columns from all tables has to be the same
2. The data types of the columns from all the tables has to line up 

In order to `UNION` two tables they have to have the same number of columns, which makes sense. If you're stacking columns on top of each other they all need to line up.

Let's take a look at the schema of `posts_answers` and `posts_questions`. In BigQuery you do this by running:
```
select column_name, data_type
from `bigquery-public-data.stackoverflow.INFORMATION_SCHEMA.COLUMNS`
where table_name = 'posts_answers'
```

and we get this for both tables
```
column_name             |data_type|
------------------------+---------+
id                      |INT64    |
title                   |STRING   |
body                    |STRING   |
accepted_answer_id      |STRING   |
answer_count            |STRING   |
comment_count           |INT64    |
community_owned_date    |TIMESTAMP|
creation_date           |TIMESTAMP|
favorite_count          |STRING   |
last_activity_date      |TIMESTAMP|
last_edit_date          |TIMESTAMP|
last_editor_display_name|STRING   |
last_editor_user_id     |INT64    |
owner_display_name      |STRING   |
owner_user_id           |INT64    |
parent_id               |INT64    |
post_type_id            |INT64    |
score                   |INT64    |
tags                    |STRING   |
view_count              |STRING   |
```

This means that we could `UNION ALL` these tables together to produce a single result set for all posts. This is helpful because it lets us combine the posts in one table. 

Here's what that looks like:
```
select
	id as post_id,
	p.creation_date,
	'question' as post_type,
	p.score as post_score
from
	`bigquery-public-data.stackoverflow.posts_questions` p
where
	true
	and p.creation_date >= '2021-09-01'
	and p.creation_date <= '2021-09-02'
union all
select
	id as post_id,
	p.creation_date,
	'answer' as post_type,
	p.score as post_score
from
	`bigquery-public-data.stackoverflow.posts_answers` p
where
	true
	and p.creation_date >= '2021-09-01'
	and p.creation_date <= '2021-09-02'
```

As a rule of thumb, whenever you're appending two or more tables, it's a good idea to add a constant column to indicate the source table or some kind of type. This is helpful when appending say activity tables to create a long, time-series table and you want to identify each activity type in the final result set.

In the case of this dataset, the original schema had all the posts in a single table called `posts` which the engineers at BigQuery split up by type and stored in separate tables to optimize storage so appending it together using `UNION ALL` vs `UNION DISTINCT` makes sense.

However if you're not sure, just like in the case of JOINs, err on the side of using `UNION DISTINCT`. The main difference is the added computational complexity to dedupe rows which the query engine doesn't have to perform if you're just appending rows.

#### Special Use Cases
You can often use a `UNION` operator to replace the `OR` condition on a `WHERE` clause . This has two main benefits: first, it makes the query easier to read and understand and second it makes the query much faster.

Replacing OR with union works great in cases when you need to check two or more columns for the same value like a start date and end date.

Let's look at an example.

Suppose we wanted all the questions and answers that were either created or modified on a given day. Both `posts_answers`  and `post_questions` tables have a `creation_date` and a `last_activity_date` so the easiest way to get what we need is this query:

```
with posts as (
	 select
        id as post_id,
        p.creation_date,
        p.last_activity_date,
        'question' as post_type,
        p.score as post_score
    from
        `bigquery-public-data.stackoverflow.posts_questions` p
    union all
    select
        id as post_id,
        p.creation_date,
        p.last_activity_date,
        'answer' as post_type,
        p.score as post_score
    from
        `bigquery-public-data.stackoverflow.posts_answers` p
)
select *
from posts
where (creation_date >= '2021-09-01'
	and creation_date < '2021-09-02')
	or
	(last_activity_date >= '2021-09-01'
	and last_activity_date < '2021-09-02');
```

What's wrong with this query? Well yes it will get us the desired result but it's kind of clunky. We had to use parentheses to separate the `AND` from the `OR`