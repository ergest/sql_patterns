The query we're working for this project is a complex one. We're taking several tables at varying granularities and transforming them into a single table at the `user_id, date` granularity.

Every complex query can and should be broken down into smaller, simpler elements that can be written and tested independently. In order to achieve this goal we need to first cover the Single Responsibility Principle.

**Single Responsibility Principle (SRP)**
SRP hails from the world of software engineering and states simply that every component in a software system should have a single purpose. This ensures that each component is simple to write, easy to understand and can be tested independently.

When I first started writing queries professionally to answer business questions, I wanted to show off my smarts. I wanted to get the entire query written in one fell swoop, one single, perfect, beautiful query. Reality, however, had other plans.

You see real world data is messy. From inconsistent field types, missing or duplicate rows, unexpected values, etc. I learned pretty quickly that queries, no matter how simple they might seem, needed to be broken down into smaller components and each one tested individually.

Initially I did this with temporary tables where each step built upon the previous step and together they could get me the correct result faster and more accurately. Later I learned how to use CTEs (Common Table Expressions) and I've only used CTEs since then.

#### Keep CTEs small

#### Brief Introduction to CTEs
CTEs or Common Table Expressions are temporary views whose scope is limited to the current query. They are not stored in the database; they only exist while the query is running and are only accessible in that query.

_Side Note: Even though CTEs have been part of the definition of the SQL standard since 1999, it has taken many years for database vendors to implement them. Some versions of older databases (like MySQL before 8.0, PostgreSQL before 8.4, SQL Server before 2005) do not have support for CTEs. All the modern cloud vendors have support for CTEs

We define a single CTE using the `WITH` keyword and then use it in the main query like this:
```
-- Define CTE
WITH <cte_name> AS (
	SELECT col1, col2
	FROM table_name
)

-- Main query
SELECT *
FROM <cte_name>
```

We can define multiple CTEs using `WITH` keyword like this:
```
-- Define CTE 1
WITH <cte1_name> AS (
	SELECT col1
	FROM table1_name
)

-- Define CTE 2
, <cte2_name> AS (
	SELECT col1
	FROM table2_name
)

-- Main query
SELECT *
FROM <cte1_name> AS cte1
JOIN <cte2_name> AS cte2 ON cte1.col1 = cte2.col1
```
Notice that you only use the `WITH` keyword once then you separate them using a comma in front of the name of the each one.

We can refer to a previous CTE in a new CTE thus chaining them together like this:
```
-- Define CTE 1
WITH <cte1_name> AS (
	SELECT col1
	FROM table1_name
)

-- Define CTE 2 by referring to CTE 1
, <cte2_name> AS (
	SELECT col1
	FROM cte1_name
)

-- Main query
SELECT *
FROM <cte2_name>
```

This pattern allows for a lot of flexibility with multi-step calculations. We'll cover that later. 

When CTEs are used it lets us read a query top to bottom and easily understand what's going on. When sub-queries are used, it's a lot harder to trace the logic and figure out which column is defined where and what scope it has.

Just because we can chain CTEs, it doesn't mean we can do that infinitely. There are practical limitations on levels of chaining because after a while the query will end up becoming computationally complex. This depends on the database system you're using.

Applying the SRP to CTEs we state that every CTE needs to have a single responsibility.

#### How to decompose a query
In order to understand how to break down a large, complex query into simpler ones we need to think about what we want to achieve and map out a solution. We're looking to build a table at the `user_id, date` level starting from tables with user activity and date.

We know that a user can perform any of the following activities on any given date:
1. Post a question
2. Post an answer
3. Edit a question
4. Edit an answer
5. Comment on a post
6. Receive a comment on their post
7. Receive a vote (upvote or downvote) on their post

Solving a complex problem is a matter of breaking it down into simpler problems. Let's illustrate this with our user engagement project.

Sub-problem 1
In order to get the first 4 activities at the `user_id, date granularity` we first need to solve the problem of reducing the granularity of the `post_history` to the `user_id, date, post_id` level.

Then we'll join that back to the posts (by combining questions and answers) so we can get the post types. Finally we will reduce the granularity to just the `user_id, date` by aggregating each activity on each post type.

Sub-problem 2
We will apply the same granularity reduction logic to comments and votes so that in the end we have 3-4 CTEs all at the same granularity of `user_id, date`. 

Sub-problem 3
Once we get all activity types on the same granularity, it will be very easy to calculate all the metrics per user per date.

In the next chapter we'll begin designing all the CTEs we need for the final query

#### Chaining CTEs
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

**Don't Repeat Yourself (DRY)** The DRY principle states that if you find yourself copy-pasting the same chunk of code in multiple locations, it's probably a good idea to put that code in a single CTE and reference that CTE where it's needed.

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

#### [](https://github.com/ergest/SQL_Patterns/blob/master/Part%201%20-%20Patterns/Chapter%205.%20Chaining%20CTEs.md#cte-chaining)

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

Of course we can. This new version avoids joining twice on the `post_activity` CTE and runs slightly faster.

You'll notice that I'm using a `DATE_TRUNC()` function on the `activity_date` field. What does it do? As it turns out, a date or timestamp field contains multiple levels of granularity embedded all of which are accessible via date functions.
#### Principles of Unix Programming

#### Recap
