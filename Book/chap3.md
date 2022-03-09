# Chapter 4: Query Decomposition
In this chapter we're going to learn one of the most important patterns in SQL. This pattern will help you solve very complex queries by systematically decomposing them into simpler ones. Before we go that far, first we need to talk about CTEs

## Common Table Expressions (CTEs)
CTEs or Common Table Expressions are temporary views whose scope is limited to the current query. They are not stored in the database; they only exist while the query is running and are only accessible in that query. They act like subqueries but are easier to understand and use.

CTEs allow you to break down complex queries into simpler, smaller self-contained modules. By connecting them together we can solve just about any complex query. One of the key requirements is that these CTEs should not try to do too much. They should have a single purpose or responsibility so you can write, test and debug them independently.

_Side Note: Even though CTEs have been part of the definition of the SQL standard since 1999, it has taken many years for database vendors to implement them. Some versions of older databases (like MySQL before 8.0, PostgreSQL before 8.4, SQL Server before 2005) do not have support for CTEs. All the modern cloud vendors have support for CTEs

We define a single CTE using the `WITH` keyword and then use it in the main query like this:
```sql
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

We have separate tables for these activities, so our first step is to aggregate the data from each of the tables to the `user_id` and `aciticity_date` granularity and put each one on its own CTE.

We can break this down into several subproblems and map out a solution like this:

### Sub-problem 1
Calculate user metrics for post types and post activity types. 

To get there we first have to manipulate the granularity of the `post_history` table so we have one row per `user_id` per `post_id` per `activity_type` per `activity_date`.

That would look like this:
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
ORDER BY activity_date;

post_id |user_id |user_name  |activity_date          |activity_type|
--------+--------+-----------+-----------------------+-------------+
68226767|16366214|Tony Agosta|2021-07-02 10:18:42.410|created      |
68441160|16366214|Tony Agosta|2021-07-19 09:16:57.660|created      |
68469502|16366214|Tony Agosta|2021-07-21 08:29:22.773|created      |
68469502|16366214|Tony Agosta|2021-07-26 07:31:43.513|edited       |
68441160|16366214|Tony Agosta|2021-07-26 07:32:07.387|edited       |

Table 3.1
```

We then join this with the `posts_questions` and `post_answers` on `post_id`. That would look like this:

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
, post_types AS (
    SELECT
        id AS post_id,
        'question' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_questions
    WHERE
        TRUE
        AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_answers
    WHERE
        TRUE
        AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
 )
SELECT
    pa.user_id,
    CAST(pa.activity_date AS DATE) AS activity_date,
    pa.activity_type,
    pt.post_type
FROM
    post_activity pa
    JOIN post_types pt ON pa.post_id = pt.post_id
WHERE user_id = 16366214
ORDER BY activity_date;

user_id |date      |activity_type|post_type|
--------+----------+-------------+---------+
16366214|2021-07-18|created      |question |
16366214|2021-07-20|created      |question |
16366214|2021-07-25|edited       |question |
16366214|2021-07-25|created      |answer   |
16366214|2021-07-01|created      |question |
16366214|2021-07-25|edited       |question |

Table 3.2
```

The final result should look like this:
```
user_id |date      |question_created|answer_created|question_edited|answer_edited|
--------+----------+----------------+--------------+---------------+-------------+
16366214|2021-07-25|               0|             1|              2|            0|
16366214|2021-07-18|               1|             0|              0|            0|
16366214|2021-07-01|               1|             0|              0|            0|
16366214|2021-07-20|               1|             0|              0|            0|

Table 3.1
```

How do we go from *Table 3.2* to *Table 3.1*? If you recall from **Chapter 2**, we can use aggregation and pivoting:
```sql
--code snippet will not actually run
SELECT
    user_id,
    CAST(pa.activity_date AS DATE) AS activity_date,
    SUM(CASE WHEN activity_type = 'created'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_created,
    SUM(CASE WHEN activity_type = 'created'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_created,
    SUM(CASE WHEN activity_type = 'edited'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edited,
    SUM(CASE WHEN activity_type = 'edited'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edited  
FROM post_activity pa
     JOIN post_types pt ON pt.post_id = pa.post_id
WHERE user_id = 16366214
GROUP BY 1,2
```
This query will not run and is only shown for demonstration purposes.

### Sub-problem 2
Calculate comments metrics. There are two types of comments: 
1. Comments by a user (on one or many posts)
2. Comments on a user's post (by other users)

The query and final result should look like this:
```sql
--code snippet will not actually run
, comments_on_user_post AS (
    SELECT
        pa.user_id,
        CAST(c.creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        bigquery-public-data.stackoverflow.comments c
        INNER JOIN post_activity pa ON pa.post_id = c.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
        AND c.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND c.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
        1,2
)
, comments_by_user AS (
    SELECT
        user_id,
        CAST(creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        bigquery-public-data.stackoverflow.comments
    WHERE
        TRUE
        AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
        1,2
)
SELECT
    c1.user_id,
    c1.activity_date,
    c1.total_comments AS comments_by_user,
    c2.total_comments AS comments_on_user_post 
FROM comments_by_user c1
     LEFT OUTER JOIN comments_on_user_post c2 
        ON c1.user_id = c2.user_id
        AND c1.activity_date = c2.activity_date 
WHERE 
    c1.user_id = 16366214

user_id |activity_date|comments_by_user|comments_on_user_post|
--------+-------------+----------------+---------------------+
16366214|   2021-07-19|               1|                    2|
16366214|   2021-07-21|               1|                 NULL|
16366214|   2021-07-26|               3|                    4|

Table 3.3
```

### Sub-problem 3
Calculate votes metrics. There are two types of votes:
1. Upvotes on a user's post
2. Downvotes on a user's post

The query and final result should look like this:
```sql
--code snippet will not actually run
, votes_on_user_post AS (
      SELECT
        pa.user_id,
        CAST(v.creation_date AS DATE) AS activity_date,
        SUM(CASE WHEN vote_type_id = 2 THEN 1 ELSE 0 END) AS total_upvotes,
        SUM(CASE WHEN vote_type_id = 3 THEN 1 ELSE 0 END) AS total_downvotes,
    FROM
        bigquery-public-data.stackoverflow.votes v
        INNER JOIN post_activity pa ON pa.post_id = v.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
        AND v.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
        AND v.creation_date <= CAST('2021-09-30' as TIMESTAMP)
    GROUP BY
        1,2
)
SELECT
    v.user_id,
    v.activity_date,
    v.total_upvotes,
    v.total_downvotes
FROM 
    votes_on_user_post v
WHERE 
    v.user_id = 16366214

user_id |activity_date|total_upvotes|total_downvotes|
--------+-------------+-------------+---------------+
16366214|   2021-07-26|            2|              0|
16366214|   2021-07-06|            0|              1|
16366214|   2021-07-07|            0|              0|

Table 3.4
```

By now you should start to see very clearly how the final result is constructed. All we have to do is take the 3 results from the sub-problems and join them together on `user_id` and `activity_date` This will allow us to have a single table with a granularity of one row per user and all the metrics aggregated on the day level like this:
```sql
--code snippet will not actually run
SELECT
	pm.user_id,
	pm.user_name,
	CAST(SUM(pm.posts_created) AS NUMERIC)            AS total_posts_created, 
	CAST(SUM(pm.posts_edited) AS NUMERIC)             AS total_posts_edited,
	CAST(SUM(pm.answers_created) AS NUMERIC)          AS total_answers_created,
	CAST(SUM(pm.answers_edited) AS NUMERIC)           AS total_answers_edited,
	CAST(SUM(pm.questions_created) AS NUMERIC)        AS total_questions_created,
	CAST(SUM(pm.questions_edited) AS NUMERIC)         AS total_questions_edited,
	CAST(SUM(vu.total_upvotes) AS NUMERIC)            AS total_upvotes,
	CAST(SUM(vu.total_downvotes) AS NUMERIC)          AS total_downvotes,
	CAST(SUM(cu.total_comments) AS NUMERIC)           AS total_comments_by_user,
	CAST(SUM(cp.total_comments) AS NUMERIC)           AS total_comments_on_post,
	CAST(COUNT(DISTINCT pm.activity_date) AS NUMERIC) AS streak_in_days      
FROM
	user_post_metrics pm
	JOIN votes_on_user_post vu
		ON pm.activity_date = vu.activity_date
		AND pm.user_id = vu.user_id
	JOIN comments_on_user_post cp 
		ON pm.activity_date = cp.activity_date
		AND pm.user_id = cp.user_id
	JOIN comments_by_user cu
		ON pm.activity_date = cu.activity_date
		AND pm.user_id = cu.user_id
GROUP BY
	1,2
```

In the next chapter we'll extend these patterns and see how they help us with query maintainability.