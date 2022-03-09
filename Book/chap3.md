# Chapter 4: Query Decomposition
In this chapter we're going to learn some of the most important patterns in SQL. These patterns will help you solve very complex queries by systematically decomposing them into simpler queries that can be tested independently. Before we go that far, first we need to talk about CTEs

## Common Table Expressions (CTEs)
CTEs or Common Table Expressions are temporary views whose scope is limited to the current query. They are not stored in the database; they only exist while the query is running and are only accessible in that query. They act like subqueries but are easier to understand and use.

CTEs allow you to break down complex queries into simpler, smaller self-contained modules. By connecting them together we can solve just about any complex query. One of the key requirements is that these CTEs should not try to do too much. They should have a single purpose or responsibility so you can write, test and debug them independently.

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

We can define multiple CTEs similarly using the `WITH` keyword like this:
```sql
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

We can refer to a previous CTE in a new CTE so you chain them together like this:
```sql
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

We'll talk about chaining in a little bit.

When you use CTEs you can read a query top to bottom and easily understand what's going on. When you use sub-queries it's a lot harder to trace the logic and figure out which column is defined where and what scope it has. You have to read the innermost subquery first and then remember each of the definitions.

## Query Decomposition
Getting our user data from the current form to the final form of one row per user is not something that can be done in a single step. Well you probably could hack something together that works but that will not be very easy to maintain. It's a complex query.

In order to solve it, we need to decompose (break down) our complex query into smaller, easier to write pieces. Here's how to think about it:

We know that a user can perform any of the following activities on any given date:
1. Post a question
2. Post an answer
3. Edit a question
4. Edit an answer
5. Comment on a post
6. Receive a comment on their post
7. Receive a vote (upvote or downvote) on their post

We have separate tables for these activities, so our first step is to get each activity 

We can break this down into several subproblems and map out a solution like this:

Sub-problem 1
In order to get the first 4 activities at the `user_id, date granularity` we first need to solve the problem of reducing the granularity of the `post_history` to the `user_id, date, post_id` level. Then we'll join that back to the posts (by combining questions and answers) so we can get the post types. Finally we will aggregate data to the `user_id, date` level and calculate some of the metrics.

Sub-problem 2
We will apply the same granularity reduction pattern to comments and votes so that in the end we have 3-4 CTEs all at the same granularity of `user_id, date`. 

Sub-problem 3
Once we get all activity types on the same granularity, we will join them on `user_id` and `date` in order to calculate all the final metrics per user.

### Chaining CTEs
We saw how we can define multiple CTEs above and we also saw how each CTE can use a previous CTE which allows us to chain them together to solve out complex query.

There is however a limit on how many CTEs, it doesn't mean we can do that infinitely. There are practical limitations on levels of chaining because after a while the query will end up becoming computationally complex. This depends on the database system you're using.

To solve the first sub-problem we have to define a CTE that gets the post activity for each `user_id`, `post_id`, `activity_type`, `date` combination. We then need to restrict this activity to only creation and editing because we don't care about the other kinds. That makes for a perfect small, self-contained CTE which can also be used later when we need to join in votes to users. 
```sql
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
        bigquery-public-data.stackoverflow.post_history ph
        INNER JOIN bigquery-public-data.stackoverflow.users u 
			ON u.id = ph.user_id
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

Notice that we're performing an `INNER JOIN` which will eliminate any users that do not exist in both tables. For our purposes this is exactly what you want but remember that I recommended starting with a `LEFT JOIN` in the previous chapter. That's only a recommendation not a rule. Check your data to be sure.

The astute reader would have also noticed the aggregation pattern to reduce granularity. Remember that we don't need the use an aggregate function to actually aggregate our data, we can just use the `GROUP BY` keyword to reduce granularity and remove duplicates.

Now that we have the `post_activity` CTE, we need to join it with the questions and answers and then aggregate the activity.

Since the schema of both `post_questions` and `post_answers` is identical, we can combine them into a single CTE using `UNION ALL` and then we join with `post_activity`. This is a textbook example of **CTE chaining.**

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

You'll notice that I'm using a `DATE_TRUNC()` function on the `activity_date` field. What does it do? As it turns out, a date or timestamp field contains multiple levels of granularity embedded all of which are accessible via date functions.

Let's review what we've done so far. We created two CTEs, one for post types and one for the post activity by user. We joined these two CTEs and pivoted the data at the `user_id`, `date` level in order to create 4 new metrics.

You might ask why didn't we join the post_types as a subquery in the first CTE and then aggregate everything? Well that's the idea behind single purpose. If we need to use the first CTE later on, which we do, then by joining to smaller CTE, we ensure that the query is more efficient. Yes a modern database might optimize by saving the results somewhere instead of running the query again, but this way we don't assume.

Also the nice thing about using CTEs vs sub-queries is that you can read the query top to bottom and understand exactly what's happening. With sub-queries you typically have to read from the inside out. You read the innermost subquery first then you work your way out. It can become pretty tedious to keep it all in your head.

Also if we wanted to test each CTE we can highlight the portions of the code we care about and run just that.

### Important Notes
Before we go further I want to highlight a few things regarding CTEs. First like I said earlier, not all databases support them. You'd have to be on the latest version in order to get all the benefits. We're focusing on cloud data warehouses here so that's not really an issue.