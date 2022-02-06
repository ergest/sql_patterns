The query we're working for this project is a complex one. We're taking several tables at varying granularities and transforming them into a single table at the `user_id, date` granularity.

Every complex query can and should be broken down into smaller, simpler elements that can be written and tested independently. In order to achieve this goal we need to first cover the Single Responsibility Principle.

**Single Responsibility Principle (SRP)**
SRP hails from the world of software engineering and states simply that every component in a software system should have a single purpose. This ensures that each component is simple to write, easy to understand and can be tested independently.

When I first started writing queries professionally to answer business questions, I wanted to show off my smarts. I wanted to get the entire query written in one fell swoop, one single, perfect, beautiful query. Reality, however, had other plans.

You see real world data is messy. From inconsistent field types, missing or duplicate rows, unexpected values, etc. I learned pretty quickly that queries, no matter how simple they might seem, needed to be broken down into smaller components and each one tested individually.

Initially I did this with temporary tables where each step built upon the previous step and together they could get me the correct result faster and more accurately. Later I learned how to use CTEs (Common Table Expressions) and I've only used CTEs since then.

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

In order to sketch out a solution for this query, we'll start by getting the *create* and *edit* posting activity from the `post_history` table and reduce its granularity to one row per user, per date, per post. 

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

We can rewrite the above pattern by using a `CASE WHEN` statement to define the activity type like this:
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

By the way
```
CASE field_name
    WHEN value1 THEN 'label1'
    WHEN value2 THEN 'label2'
	WHEN value3 THEN 'label3'
END as column
```
is equivalent to
```
CASE 
	WHEN field_name = value1 THEN 'label1'
    WHEN field_name = value2 THEN 'label2'
    WHEN field_name = value3 THEN 'label3'
END as column
```

The astute reader would have noticed the aggregation pattern to reduce granularity. At this point we still don't know if the user posted a question or an answer but we can get that by chaining this CTE with one that has the post types.

Yes we could have joined the post types here but then the CTE would be doing way too much work