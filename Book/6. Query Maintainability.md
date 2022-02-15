#### Chaining and Nesting CTEs
In order to solve the first sub-problem we have to break down the query into small, single-purpose CTEs that can be tested independently. As described in the previous chapter, the first one is about combining the post activity and the post types into a single CTE aggregated at the `user_id, date` level of granularity.

Since we want to apply the SRP to our CTEs, we can create one for each post activity like this:
```
WITH post_created AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        'posted' AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        LEFT JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id = 1
    	AND user_id > 0 --anything < 0 are automated processes
    	AND user_id IS NOT NULL
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4
)
, post_edited AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        'edited' AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        LEFT JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id = 4
    	AND user_id > 0 --anything < 0 are automated processes
    	AND user_id IS NOT NULL
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4

)
```

This is a perfect application of the SRP to CTEs. Each one has a very specific responsibility. But notice how the code for each CTE is 98% the same. This pattern violates the DRY principle.

**Don't Repeat Yourself (DRY)**
The DRY principle states that if you find yourself copy-pasting the same chunk of code in multiple locations, it's probably a good idea to put that code in a single CTE and reference that CTE where it's needed.

This will help both with breaking up complex queries into smaller pieces and also make your queries more readable, easier to test, and easier to maintain.

We can rewrite the above pattern by using a `CASE WHEN` statement to define the activity type like this:
```
WITH post_activity AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
        	 WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
        END AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id BETWEEN 1 AND 6
    	AND user_id > 0 --exclude automated processes
    	AND user_id IS NOT NULL --exclude deleted accounts
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4,5
)
SELECT *
FROM post_activity
WHERE user_id = 16366214
ORDER BY activity_date 

post_id |user_id |user_name  |activity_date          |activity_type|
--------+--------+-----------+-----------------------+-------------+
68226767|16366214|Tony Agosta|2021-07-02 10:18:42.410|created      |
68441160|16366214|Tony Agosta|2021-07-19 09:16:57.660|created      |
68469502|16366214|Tony Agosta|2021-07-21 08:29:22.773|created      |
68469502|16366214|Tony Agosta|2021-07-26 07:31:43.513|edited       |
68441160|16366214|Tony Agosta|2021-07-26 07:32:07.387|edited       |
```

The astute reader would have noticed the aggregation pattern to reduce granularity. At this point we still don't know if the user posted a question or an answer but we can get that by chaining this CTE with one that has the post types.

#### CTE Chaining
Now that we have the `post_activity` CTE, we need to join it with the questions and answers and then aggregate the activity. 

Since the schema of both `post_questions` and `post_answers` is identical, we can combine them into a single CTE using `UNION ALL` and then we join with `post_activity`. This is a textbook example of **CTE chaining.**
```
WITH post_activity AS (
	SELECT
		ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
        	 WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
        END AS activity_type
    FROM
        `bigquery-public-data.stackoverflow.post_history` ph
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
    	TRUE 
    	AND ph.post_history_type_id BETWEEN 1 AND 6
    	AND user_id > 0 --exclude automated processes
    	AND user_id IS NOT NULL --exclude deleted accounts
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4,5
)
,post_types as (
    SELECT
        ph.user_id,
        ph.user_name,
        activity_date,
        activity_type,
        'question' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_questions` p
        INNER JOIN post_activity ph on p.id = ph.post_id
    WHERE
        TRUE
    	AND p.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND p.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        ph.user_id,
        ph.user_name,
        activity_date,
        activity_type,
        'answer' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_answers` p
        INNER JOIN post_activity ph on p.id = ph.post_id
    WHERE
        TRUE
    	AND p.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND p.creation_date <= CAST('2021-09-30' as TIMESTAMP)
)
SELECT
	user_id,
	user_name,
	DATE_TRUNC(activity_date, DAY) AS date,
	SUM(CASE WHEN activity_type = 'created'
		AND post_type = 'question' THEN 1 ELSE 0 END) AS question_created,
	SUM(CASE WHEN activity_type = 'created'
		AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_created,
	SUM(CASE WHEN activity_type = 'edited'
		AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edited,
	SUM(CASE WHEN activity_type = 'edited'
		AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edited	
FROM post_types 
WHERE user_id = 16366214
GROUP BY 1,2,3
```

You'll notice that in this query we join the `post_activity` CTE twice in the `post_types` CTE. An astute reader might ask isn't that breaking the DRY principle?

```
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
    WHERE
    	TRUE 
    	AND ph.post_history_type_id IN (1,4)
    	AND user_id > 0 --exclude automated processes
    	AND user_id IS NOT NULL
    	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
    	1,2,3,4,5
)
,post_types as (
    SELECT
		id AS post_id,
        'question' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_questions`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_answers`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
 )
SELECT
	pt.user_id,
	pt.user_name,
	DATE_TRUNC(pt.activity_date, DAY) AS date,
	SUM(CASE WHEN activity_type = 'created'
		AND post_type = 'question' THEN 1 ELSE 0 END) AS question_created,
	SUM(CASE WHEN activity_type = 'created'
		AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_created,
	SUM(CASE WHEN activity_type = 'edited'
		AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edited,
	SUM(CASE WHEN activity_type = 'edited'
		AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edited	
FROM post_types pt
	 JOIN post_activity pa ON pt.post_id = pa.post_id
WHERE user_id = 16366214
GROUP BY 1,2,3
```

Of course we can. This new version avoids joining twice on the `post_activity` CTE and  runs slightly faster.

You'll notice that I'm using a `DATE_TRUNC()` function on the `activity_date` field. What does it do? As it turns out, a date or timestamp field contains multiple levels of granularity embedded all of which are accessible via date functions.

#### Appending Rows
In the previous section we combined the two posts tables using the `UNION ALL` operator to make a single `post_types` CTE like this:
```
post_types as (
    SELECT
		id AS post_id,
        'question' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_questions`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        `bigquery-public-data.stackoverflow.posts_answers`
    WHERE
        TRUE
    	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
    	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
 )
 ```

Let's take a moment to see how this pattern works. Just like a `JOIN` adds columns to a result set the `UNION` operator appends rows to it by combining two or more tables length-wise. There are two types of unions, `UNION ALL` and `UNION` (distinct) 

`UNION ALL` will append two tables without checking if they have the same exact row. This might cause duplicates but it's really fast. If you know for sure your tables don't contain duplicates, as in our case this is the preferred way to append two tables. 

`UNION` (distinct) will append the tables but remove all duplicates from the final result thus guaranteeing unique rows for the final result set. This of course is slower because of the extra operations to remove duplicates. Use this only when you're not sure if the tables contain duplicates or you cannot remove duplicates beforehand.

Most SQL flavors only use `UNION` keyword for the distinct version, but BigQuery forces you to use `UNION DISTINCT` in order to make the query far more explicit

Appending rows to a table also has two requirements:
1. The number of the columns from all tables has to be the same
2. The data types of the columns from all the tables has to line up 

One of the most annoying things when appending two or more tables with a lot of columns is lining up all the columns in the right order. There's been many a time when I've had to use Excel to line up the columns. There's no shame in admitting that.

As a rule of thumb, whenever you're appending tables, it's a good idea to add a constant column to indicate the source table or some kind of type. This is helpful when appending say activity tables to create a long, time-series table and you want to identify each activity type in the final result set.

You'll notice in my query above I create a `post_type` column indicating where the data is coming from.

#### Recap
1. You can chain multiple CTEs as you define them and combine them to decompose a complex query into simple problems
2. The Don't Repeat Yourself (DRY) principle states that if a piece of code or join is repeated multiple times it's a good idea to split it out into its own CTE

We'll see more examples of CTE chaining in the following chapters. In the next chapter we'll talk about query performance patterns.