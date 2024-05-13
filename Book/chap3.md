# Chapter 3: Modularity
In this chapter we'll learn:
- Principle of Modularity
- Writing Modular SQL Using CTEs
- Single Responsibility Principle (SRP)
- Reusability Principle
- Don't Repeat Yourself Principle (DRY)
- Self Documenting Code Principle (intention revealing names)

In this chapter we're going to see how **modularity**, one of the most important system design principles applies to SQL. You will learn how to compose queries as a series of independent, simple "modules" whether they are CTEs, views, user defined functions (UDFs) and so on.

Every complex system is made up of simple, self contained elements that can be designed, developed and tested independently. And that means you can take very complex queries and systematically break them down into much simpler elements.

> **Definition**:  
> A module is a unit whose elements are tightly connected to themselves but weakly connected to other units.

Modular 
When a system is designed with modularity in mind, it makes it very easy for independent parties to build these components in parallel so they can be assembled later. It also makes it easy to debug and fix the system when it's in production.


### Three Levels of Modularity
In SQL we can apply modularity in 3 different levels:

1. Within the same SQL query using CTEs
2. Across multiple SQL queries
3. Beyond SQL queries

Have you ever written or debugged a really long SQL query? Did you get lost in trying to figure out what it was doing or was it really easy to follow?

Whether you got lost or not depends a lot on whether the query was using CTEs to decompose a problem into logical modules that made it easy to understanding and debug.

### Writing Modular SQL Using CTEs
CTEs or Common Table Expressions are temporary views whose scope is limited to the current query. They are not stored in the database; they only exist while the query is running and are only accessible inside that query. They act like subqueries but are easier to understand and use.

CTEs allow you to break down complex queries into simpler, smaller self-contained modules. By connecting them together we can solve any complex query.

When you use CTEs you can read a query top to bottom and easily understand what's going on. When you use sub-queries it's a lot harder to trace the logic and figure out which column is defined where and what scope it has. You have to read the innermost subquery first and then remember each of the definitions.

> _Side Note_:  
> Even though CTEs have been part of the definition of the SQL standard since 1999, it has taken many years for database vendors to implement them. Some versions of older databases (like MySQL before 8.0, PostgreSQL before 8.4, SQL Server before 2005) do not have support for them. All the modern cloud warehouse vendors support them.

One of the best ways to visualize CTEs is to think of them as a DAG (aka Directed Acyclical Graph) where each node handles a single processing step. Here are some examples of how CTEs could be chained to solve a complex query.

In this example each CTE uses the results of the previous CTE to build upon its result set and take it further.

![](https://www.ergestx.com/content/images/2022/12/Example-Dag-Dag1.drawio-2.png)

```sql
-- Define CTE 1
WITH cte1_name AS (
    SELECT col1
    FROM table1_name
),
-- Define CTE 2 by referring to CTE 1
cte2_name AS (
    SELECT col1
    FROM cte1_name
),
-- Define CTE 3 by referring to CTE 2
cte3_name AS (
    SELECT col1
    FROM cte2_name
),
-- Define CTE 4 by referring to CTE 3
cte4_name AS (
    SELECT col1
    FROM cte3_name
)
-- Main query
SELECT *
FROM cte4_name
```

In this example, CTE 3 depends on CTE 1 and CTE 2 which are independent of each other and CTE 4 depends on CTE 3.

![](https://www.ergestx.com/content/images/2022/12/Example-Dag-Dag2.drawio.png)

```sql
-- Define CTE 1
WITH cte1_name AS (
    SELECT col1
    FROM table1_name
),
-- Define CTE 2
cte2_name AS (
    SELECT col1
    FROM table2_name
),
-- Define CTE 3 by referring to CTE 1 and 2
cte3_name AS (
    SELECT *
    FROM cte1_name AS cte1
    JOIN cte2_name AS cte2 
        ON cte1.col1 = cte2.col1
),
-- Define CTE 4 by referring to CTE 3
cte4_name AS (
    SELECT col1
    FROM cte3_name
)
-- Main query
SELECT *
FROM cte4_name
```

Finally here's something more complex and its corresponding code.

![](https://www.ergestx.com/content/images/2022/12/Example-Dag-Dag3.drawio.png)

```sql
-- Define CTE 1
WITH cte1_name AS (
    SELECT col1
    FROM table1_name
),
-- Define CTE 2 by referring to CTE 1
cte2_name AS (
    SELECT col1
    FROM cte1_name
),
-- Define CTE 3 by referring to CTE 1
cte3_name AS (
    SELECT col1
    FROM cte1_name
)
-- Define CTE 4 by referring to CTE 1
cte4_name AS (
    SELECT col1
    FROM cte1_name
),
-- Define CTE 5 by referring to CTE 4
cte5_name AS (
    SELECT col1
    FROM cte4_name
),
-- Define CTE 6 by referring to CTEs 2, 3 and 5
cte6_name AS (
    SELECT *
    FROM cte2_name cte2
        JOIN cte3_name cte3 ON cte2.column1 = cte3.column1
        JOIN cte5_name cte5 ON cte3.column1 = cte5.column1
)
-- Main query
SELECT *
FROM cte6_name
```
As you can see, there's an endless way in which you can chain or stack CTEs to solve complex queries.

## Example
Now that you've seen the basics of what CTEs are, let's apply them to our project. Getting our user data from the current form to the final form of one row per user is not something that can be done in a single step.

Well you probably could hack something together that works but that will not be very easy to maintain. It's a complex query. So In order to solve it, we need to decompose (break down) our complex query into smaller, easier to write pieces. Here's how to think about it:

We know that a user can perform any of the following activities on any given date:
1. Post a question
2. Post an answer
3. Edit a question
4. Edit an answer
5. Comment on a post
6. Receive a comment on their post
7. Receive a vote (upvote or downvote) on their post

We have separate tables for these activities, so our first step is to aggregate the data from each of the tables to the `user_id` and `activity_date` granularity and put each one on its own CTE.

We can break this down into several subproblems and map out a solution like this:

### Sub-problem 1
Calculate user metrics for post types and post activity types. 

To get there we first have to manipulate the granularity of the `post_history` table so we have one row per `user_id` per `post_id` per `activity_type` per `activity_date`.

That would look like this:
```sql
--listing 3.1
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
        post_history ph
        INNER JOIN users u 
            ON u.id = ph.user_id
    WHERE
        TRUE
        AND ph.post_history_type_id BETWEEN 1 AND 6
        AND user_id > 0 --exclude automated processes
        AND user_id IS NOT NULL --exclude deleted accounts
    GROUP BY
        1,2,3,4,5
)
SELECT *
FROM post_activity
WHERE user_id = 4603670
ORDER BY activity_date
LIMIT 10;
```

Here's the output:
```sql
post_id |user_id|user_name       |activity_date          |activity_type|
--------+-------+----------------+-----------------------+-------------+
70192540|4603670|Barmak Shemirani|2021-12-01 23:30:38.057|created      |
70192540|4603670|Barmak Shemirani|2021-12-01 23:35:42.157|edited       |
70193076|4603670|Barmak Shemirani|2021-12-02 01:06:08.973|edited       |
70192540|4603670|Barmak Shemirani|2021-12-02 01:56:02.137|edited       |
70199876|4603670|Barmak Shemirani|2021-12-02 12:54:40.230|created      |
70199876|4603670|Barmak Shemirani|2021-12-02 13:21:05.200|edited       |
70199876|4603670|Barmak Shemirani|2021-12-02 14:14:56.210|edited       |
70208753|4603670|Barmak Shemirani|2021-12-03 02:18:58.930|created      |
70208753|4603670|Barmak Shemirani|2021-12-03 02:40:51.667|edited       |
70212702|4603670|Barmak Shemirani|2021-12-03 11:40:09.240|edited       |

Table 3.1
```

We then join this with the `posts_questions` and `post_answers` on `post_id`. That would look like this:

```sql
--listing 3.2
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
        post_history ph
        INNER JOIN users u 
			ON u.id = ph.user_id
    WHERE
        TRUE
        AND ph.post_history_type_id BETWEEN 1 AND 6
        AND user_id > 0 --exclude automated processes
        AND user_id IS NOT NULL --exclude deleted accounts
    GROUP BY
        1,2,3,4,5
),
post_types AS (
    SELECT
        id AS post_id,
        'question' AS post_type,
    FROM
        posts_questions
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        posts_answers
)
SELECT
    pa.user_id,
    CAST(pa.activity_date AS DATE) AS activity_date,
    pa.activity_type,
    pt.post_type
FROM
    post_activity pa
    JOIN post_types pt ON pa.post_id = pt.post_id
WHERE user_id = 4603670
ORDER BY activity_date;
```

Here's the output:
```sql
user_id|activity_date|activity_type|post_type|
-------+-------------+-------------+---------+
4603670|   2021-12-01|edited       |answer   |
4603670|   2021-12-01|created      |answer   |
4603670|   2021-12-02|edited       |answer   |
4603670|   2021-12-02|edited       |answer   |
4603670|   2021-12-02|created      |answer   |
4603670|   2021-12-02|edited       |answer   |
4603670|   2021-12-02|edited       |question |
4603670|   2021-12-03|created      |answer   |
4603670|   2021-12-03|edited       |answer   |
4603670|   2021-12-03|created      |answer   |

Table 3.2
```

The final result should look like this:
```sql
user_id|activity_date|question_created|answer_created|question_edited|answer_edited|
-------+-------------+----------------+--------------+---------------+-------------+
4603670|   2021-12-01|               0|             1|              0|            1|
4603670|   2021-12-02|               0|             1|              1|            3|
4603670|   2021-12-03|               0|             3|              1|            5|
4603670|   2021-12-04|               0|             2|              0|            6|
4603670|   2021-12-05|               0|             2|              0|            3|
4603670|   2021-12-06|               0|             3|              2|            9|
4603670|   2021-12-07|               0|             2|              3|            2|
4603670|   2021-12-08|               0|             2|              2|            6|
4603670|   2021-12-09|               0|             0|              1|            0|
4603670|   2021-12-10|               0|             1|              1|            1|

Table 3.3
```

How do we go from *Table 3.2* to *Table 3.3*? If you recall from **Chapter 2**, we can use aggregation and pivoting:
```sql
--listing 3.3
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
        post_history ph
        INNER JOIN users u 
			ON u.id = ph.user_id
    WHERE
        TRUE
        AND ph.post_history_type_id BETWEEN 1 AND 6
        AND user_id > 0 --exclude automated processes
        AND user_id IS NOT NULL --exclude deleted accounts
    GROUP BY
        1,2,3,4,5
),
post_types AS (
    SELECT
        id AS post_id,
        'question' AS post_type,
    FROM
        posts_questions
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        posts_answers
)
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
WHERE user_id = 4603670
GROUP BY 1,2
```

### Sub-problem 2
Calculate comments metrics. There are two types of comments: 
1. Comments by a user (on one or many posts)
2. Comments on a user's post (by other users)

The query and final result should look like this:
```sql
--code snippet will not actually run
--listing 3.4
, comments_on_user_post AS (
    SELECT
        pa.user_id,
        CAST(c.creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        comments c
        INNER JOIN post_activity pa ON pa.post_id = c.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
    GROUP BY
        1,2
)
, comments_by_user AS (
    SELECT
        user_id,
        CAST(creation_date AS DATE) AS activity_date,
        COUNT(*) as total_comments
    FROM
        comments
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
    c1.user_id = 4603670
LIMIT 10;
```

Here's the output:
```sql
user_id|activity_date|comments_by_user|comments_on_user_post|
-------+-------------+----------------+---------------------+
4603670|   2021-12-03|               3|                    7|
4603670|   2021-12-05|               7|                    1|
4603670|   2021-12-06|               9|                    6|
4603670|   2021-12-08|               6|                    7|
4603670|   2021-12-10|               4|                    2|
4603670|   2021-12-11|               3|                    6|
4603670|   2021-12-12|               2|                    4|
4603670|   2021-12-13|               1|                    1|
4603670|   2021-12-26|               1|                    3|
4603670|   2021-12-24|               3|                    2|

Table 3.4
```

### Sub-problem 3
Calculate votes metrics. There are two types of votes:
1. Upvotes on a user's post
2. Downvotes on a user's post

The query and final result should look like this:
```sql
--code snippet will not actually run
--listing 3.5
, votes_on_user_post AS (
      SELECT
        pa.user_id,
        CAST(v.creation_date AS DATE) AS activity_date,
        SUM(CASE WHEN vote_type_id = 2 THEN 1 ELSE 0 END) AS total_upvotes,
        SUM(CASE WHEN vote_type_id = 3 THEN 1 ELSE 0 END) AS total_downvotes,
    FROM
        votes v
        INNER JOIN post_activity pa ON pa.post_id = v.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
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
    v.user_id = 4603670
LIMIT 10;
```

Here's the output:
```sql
user_id|activity_date|total_upvotes|total_downvotes|
-------+-------------+-------------+---------------+
4603670|   2021-12-02|            0|              1|
4603670|   2021-12-03|            3|              0|
4603670|   2021-12-05|            2|              0|
4603670|   2021-12-06|            5|              0|
4603670|   2021-12-07|            2|              0|
4603670|   2021-12-08|            2|              0|
4603670|   2021-12-09|            1|              0|
4603670|   2021-12-10|            0|              0|
4603670|   2021-12-11|            2|              0|
4603670|   2021-12-12|            1|              0|

Table 3.5
```

By now you should start to see very clearly how the final result is constructed. All we have to do is take the 3 results from the sub-problems and join them together on `user_id` and `activity_date` This will allow us to have a single table with a granularity of one row per user and all the metrics aggregated on the day level like this:
```sql
--code snippet will not actually run
SELECT
	pm.user_id,
	pm.user_name,
	CAST(SUM(pm.posts_created) AS NUMERIC) AS total_posts_created, 
	CAST(SUM(pm.posts_edited) AS NUMERIC)  AS total_posts_edited,
	CAST(SUM(pm.answers_created) AS NUMERIC) AS total_answers_created,
	CAST(SUM(pm.answers_edited) AS NUMERIC)  AS total_answers_edited,
	CAST(SUM(pm.questions_created) AS NUMERIC) AS total_questions_created,
	CAST(SUM(pm.questions_edited) AS NUMERIC)  AS total_questions_edited,
	CAST(SUM(vu.total_upvotes) AS NUMERIC)   AS total_upvotes,
	CAST(SUM(vu.total_downvotes) AS NUMERIC) AS total_downvotes,
	CAST(SUM(cu.total_comments) AS NUMERIC)  AS total_comments_by_user,
	CAST(SUM(cp.total_comments) AS NUMERIC)  AS total_comments_on_post,
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


### Level 2- Across multiple queries

When you find yourself copying and pasting CTEs across multiple queries it's time to refactor them into views, UDFs or stored procedures.

Views are great for encapsulating business logic that applies to many queries. They're also used in security applications to limit the rows or columns exposed to the end user based on their permissions.

#### Views

Creating a view is easy:

```sql
CREATE OR REPLACE VIEW <view_name> AS
	SELECT col1
	FROM table1
	WHERE col1 > x;
```

Once created you can run:

```sql
SELECT *
FROM <view_name>
```

This view is now stored in the database but it doesn't take up any space (unless it's materialized) It only stores the query which is executed each time you select from the view or join the view in a query.

Views can be put inside of CTEs or can themselves contain CTEs, thus creating multiple layers of modularity. Here's an example of what that would look like.

![](https://www.ergestx.com/content/images/2022/12/Example-Dag-Dag4.drawio.png)

> Side Note:  
> By combining views and CTEs, you're nesting many queries within others. Not only does this negatively impact performance but some databases have limits to how many levels of nesting you can have.

#### UDFs

Similar to views you can also put commonly used logic into UDFs (user-defined functions) Pretty much all databases allow you to create UDFs but they each use different programming languages to do so.

SQL Server uses T-SQL to create functions. PostgreSQL uses PL/pgsql or Python (with the right extension) BigQuery and Snowflake use Javascript, Python, etc.

Functions allow for conditional flow of logic and variables which makes it easy to implement complex logic.

UDFs can return a single scalar value or a table. A single scalar value can be used for example to parse certain strings via regular expressions.

Table valued functions return a table instead of a single value. They behave exactly like views but the main difference is that they can take input parameters and return different tables based on that. Very useful.

In the next chapter we'll extend these patterns and see how they help us with query maintainability.

# Chapter 4: Query Maintainability
In this chapter we're going to extend the pattern of decomposition into the realm of query maintainability. Breaking down large queries into small pieces doesn't only make them easier to read, write and understand, it also makes them easier to maintain.

## Reusability Principle
We start off with a very important principle that rarely gets talked about in SQL. When you're designing a query and breaking it up into CTEs, there is one principle to keep in mind. The CTEs should be constructed in such a way that they can be reused if needed later. This principle makes code easier to maintain and compact.

Let's take a look at the example from the previous chapter:
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
        AND ph.creation_date >= '2021-06-01' 
        AND ph.creation_date <= '2021-09-30'
    GROUP BY
        1,2,3,4,5
)
```

This CTE performs several operations like aggregation, to decrease granularity of the underlying data, and filtering. Its main purpose is to get a mapping between `user_id` and `post_id` at the right level of granularity so it can be used later.

What's great about this CTE is that we can use it both for generating user metrics as shown here: 
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

and to join with comments and votes to user level data via the `post_id`
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
        AND c.creation_date >= '2021-06-01' 
        AND c.creation_date <= '2021-09-30'
    GROUP BY
        1,2
)
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
        AND v.creation_date >= '2021-06-01' 
        AND v.creation_date <= '2021-09-30'
    GROUP BY
        1,2
)
```

This is at the heart of well-designed CTE. Notice here that we're being very careful about granularity multiplication! If we simply joined with `post_activity` on post_id without specifying the `activity_type` we'd get at least two times the number of rows. Since a post can only be created once, we're pretty safe in getting a single row by filtering.

## DRY Principle
In the previous section we saw how we can decompose a large complex query into multiple smaller components. The main benefit for doing this is that it makes the queries more readable. In that same vein, the DRY (Don't Repeat Yourself) principle ensures that your query is clean from unnecessary repetition.

The DRY principle states that if you find yourself copy-pasting the same chunk of code in multiple locations, you should put that code in a CTE and reference that CTE where it's needed.

To illustrate let's rewrite the query from the previous chapter so that it still produces the same result but it clearly shows repeating code
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
        INNER JOIN `bigquery-public-data.stackoverflow.users` u on u.id = ph.user_id
    WHERE
        TRUE 
        AND ph.post_history_type_id BETWEEN 1 AND 6
        AND user_id > 0 --exclude automated processes
        AND user_id IS NOT NULL --exclude deleted accounts
        AND ph.creation_date >= '2021-06-01' 
        AND ph.creation_date <= '2021-09-30'
    GROUP BY
        1,2,3,4,5
)
, questions AS (
     SELECT
        id AS post_id,
        'question' AS post_type,
        pa.user_id,
        pa.user_name,
        pa.activity_date,
        pa.activity_type
    FROM
        bigquery-public-data.stackoverflow.posts_questions q
        INNER JOIN post_activity pa ON q.id = pa.post_id
    WHERE
        TRUE
        AND creation_date >= '2021-06-01' 
        AND creation_date <= '2021-09-30'
)
, answers AS (
     SELECT
        id AS post_id,
        'answer' AS post_type,
        pa.user_id,
        pa.user_name,
        pa.activity_date,
        pa.activity_type
    FROM
        bigquery-public-data.stackoverflow.posts_answers q
        INNER JOIN post_activity pa ON q.id = pa.post_id
    WHERE
        TRUE
        AND creation_date >= '2021-06-01' 
        AND creation_date <= '2021-09-30'
)
SELECT
    user_id,
    CAST(activity_date AS DATE) AS activity_date,
    SUM(CASE WHEN activity_type = 'created'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_created,
    SUM(CASE WHEN activity_type = 'created'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_created,
    SUM(CASE WHEN activity_type = 'edited'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edited,
    SUM(CASE WHEN activity_type = 'edited'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edited 
FROM
    (SELECT * FROM questions
     UNION ALL
     SELECT * FROM answers) AS p
WHERE 
    user_id = 16366214
GROUP BY 1,2;
```

This query will get you the same results as table 3.1 in the previous chapter but as you can see the `questions` and `answers` CTEs both have almost identical code. Imagine if you had to do this for all question types. You'd be copying and pasting a lot of code. Also, the subquery that handles the UNION is not ideal. I'm not a fan of subqueries

Since both questions and answers tables have the exact same schema, a great way to deal with the above problem is by appending their rows using the `UNION` operator like this:
```sql
SELECT
	id AS post_id,
	'question' AS post_type,
FROM
	bigquery-public-data.stackoverflow.posts_questions
WHERE
	TRUE
	AND creation_date >= '2021-06-01' 
	AND creation_date <= '2021-09-30'

UNION ALL

SELECT
	id AS post_id,
	'answer' AS post_type,
FROM
	bigquery-public-data.stackoverflow.posts_answers
WHERE
	TRUE
	AND creation_date >= '2021-06-01' 
	AND creation_date <= '2021-09-30'
 ```

There are two types of unions, `UNION ALL` and `UNION` (distinct) 

`UNION ALL` will append two tables without checking if they have the same exact row. This might cause duplicates but it's really fast. If you know for sure your tables don't contain duplicates, this is the preferred way to append them. 

`UNION` (distinct) will append the tables but remove all duplicates from the final result thus guaranteeing unique rows. This is slower because of the extra operations to find and remove duplicates. Use this only when you're not sure if the tables contain duplicates or you cannot remove duplicates beforehand.

Most SQL flavors only use `UNION` keyword for the distinct version, but BigQuery forces you to use `UNION DISTINCT` in order to make the query far more explicit

Appending rows to a table also has two requirements:
1. The number of the columns from all tables has to be the same
2. The data types of the columns from all the tables has to line up 

You can achieve the first requirement by using `SELECT` to choose only the columns that match across multiple tables or if you know the tables have the same exact schema. Note that when you union tables with different schemas, you have to line up all the columns in the right order. This is useful when two tables have the same column named differently.

For example:
```sql
SELECT
	col1 as column_name
FROM
	table1

UNION ALL

SELECT
	col2 as column_name
FROM
	table2
```

As a rule of thumb, when you append tables, it's a good idea to add a constant column to indicate the source table or some kind of type. This is helpful when appending say activity tables to create a long, time-series table and you want to identify each activity type in the final result set.

You'll notice in my query above I create a `post_type` column indicating where the data is coming from.

### Creating Views
One of the benefits of building reusable CTEs is that if you find yourself copying and pasting the same CTE in multiple places, you can turn it into a view and store it in the database.

Views are great for encapsulating business logic that applies to many queries. They're also used in security applications

Creating a view is easy:
```sql
CREATE OR REPLACE VIEW <view_name> AS
	SELECT col1
	FROM table1
	WHERE col1 > x;
```

Once created you can run:
```sql
SELECT col1
FROM <view_name>
```
This view is now stored in the database but it doesn't take up any space (unless it's materialized) It only stores the query which is executed each time you select from the view or join the view in a query. 

What could be made into a view in our specific query?

I think the `post_types` CTE would be a good candidate. That way whenever you have to combine all the post types you don't have to use that CTE everywhere.
```sql
CREATE OR REPLACE VIEW v_post_types AS
    SELECT
        id AS post_id,
        'question' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_questions
    WHERE
        TRUE
        AND creation_date >= '2021-06-01' 
        AND creation_date <= '2021-09-30'
    UNION ALL
    SELECT
        id AS post_id,
        'answer' AS post_type,
    FROM
        bigquery-public-data.stackoverflow.posts_answers
    WHERE
        TRUE
        AND creation_date >= '2021-06-01' 
        AND creation_date <= '2021-09-30';
 ```

*Note: In BigQuery views are considered like CTEs so they count towards the maximum level of nesting. That is if you call a view from inside a CTE, that's two levels of nesting and if you then join that CTE in another CTE that's three levels of nesting. BigQuery has a hard limitation on how deep nesting can go beyond which you can no longer run your query. At that point, perhaps the view is best materialized into a table.

So far we've talked about how to optimize queries so they're easy to read, write, understand and maintain. In the next chapter we tackle patterns regarding query performance.