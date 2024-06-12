# Chapter 3: Modularity Patterns
In this chapter we'll learn some key concepts that make SQL code more easy to read, understand and maintain. We first talk about the concept of modularity and explore some patterns there. Then we'll cover SRP, DRY and a few other interesting patterns.

## Concept 1: Modularity
Every complex system is made up of simple, self contained elements that can be designed, developed and tested independently. And that means you can take very complex queries and systematically break them down into much simpler elements.

Just about every modern system is modular. Your smartphone might seem like a single piece of hardware but in reality all its components (the screen, CPU, memory, battery, speaker, GPU, accelerometer, GPS chip, etc. were designed independently and assembled.

> **Definition**:  
> A module is a unit whose elements are tightly connected to themselves but weakly connected to other units.

Modular code has the following benefits:
- When the modules are simple and self-contained the code is infinitely more readable, easy to understand, easy to debug and fix, easy to extend and easy to scale.
- When the modules are carefully thought out, logical and with clean interfaces the code becomes much easier to write. You're mostly assembling code like "LEGO(tm)" blocks instead of writing it from scratch.
- When a system is designed with modularity in mind, the modules can be developed by other parties in parallel so they can be assembled later. It also makes it easy to improve functionality by swapping out old modules for new ones as long as the interface is the same.

Before we dive into the specifics of applying modularity to SQL, let's cover a couple of key principles you'll use repeatedly throughout the book. They will be illustrated later.
### Principle 1: Don't Repeat Yourself (DRY)
The DRY principle dictates that a piece of code encapsulating some functionality must appear only once in a codebase. So ff you find yourself copying and pasting the same chunk of code everywhere your code is not DRY. The main benefit of DRY code is maintainability. If you need to change your logic, and there's a lot of repetition, you have to change all the places where the code repeats instead of a single place.

### Principle 2: Single Responsibility Principle (SRP)
The SRP principle dictates that your modules should be small, self-contained and have a single responsibility or purpose. For example you don't expect the GPS chip on your phone to also handle WiFi connectivity. The main benefit of SRP is that it makes modules more composable and facilitates code reuse. By organizing your code into well thought out "LEGO(tm)" blocks, writing complex queries becomes infinitely easier.

### Principle 3: Self Documenting Code
The self-documenting code principle dictates that your code be easy to read without needing comments. When you name your CTEs and views in ways that describe exactly what they do, even if it's a long description, your code will be infinitely easier to read, understand and maintain. For example `cte_user_agg` doesn't mean much while `cte_user_agg_by_region` is far more useful.

### Principle 4: Move Logic Upstream
When you find yourself implementing very specific logic in a model that might be used elsewhere, move that logic upstream *closer to the source* of data. In the world of DAGs, upstream has a very precise meaning. It means to move potentially common logic onto earlier nodes in the graph because you never know which downstream models might use it.

![[sql_dag4.png]]
(Models here represent dbt models which will be covered in a separate chapter)

With these principles out of the way let's dive into modularity patterns:

In SQL there are 3 ways to modularize your code:
1. Writing modular SQL using CTEs
2. Writing modular SQL using views/UDFs
3. Writing modular SQL using an external compiler (like *dbt* or *sqlmesh*)

In this chapter we'll only cover the first two levels. The third level is more advanced so we'll cover it in its own separate chapter.
## Pattern 1: Writing Modular SQL Using CTEs
CTEs or Common Table Expressions are temporary views whose scope is limited to the current query. They are not stored in the database; they only exist while the query is running and are only accessible inside that query. They act like subqueries but are easier to understand and use.

CTEs allow you to break down complex queries into simpler, smaller self-contained modules. By connecting them together we can solve any complex query.

When you use CTEs you can read a query top to bottom and easily understand what's going on. When you use sub-queries it's a lot harder to trace the logic and figure out which column is defined where and what scope it has. You have to read the innermost subquery first and then remember each of the definitions.

> **Side Note**: 
> Even though CTEs have been part of the definition of the SQL standard since 1999, it has taken many years for database vendors to implement them. Some versions of older databases (like MySQL before 8.0, PostgreSQL before 8.4, SQL Server before 2005) do not have support for them. All the modern cloud warehouse vendors support them.

One of the best ways to visualize CTEs is to think of them as a DAG (aka Directed Acyclical Graph) where each node handles a single processing step. Here are some examples of how CTEs could be chained to solve a complex query.

In this example each CTE uses the results of the previous CTE to build upon its result set and take it further.

![[Example-Dag-Dag1.drawio.png]]
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

![[Example-Dag-Dag2.drawio.png]]
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

![[Example-Dag-Dag3.drawio.png]]
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
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'create'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edit' 
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

--sample output:
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
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'create'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edit' 
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
ORDER BY activity_date
LIMIT 10;

--sample output:
user_id|activity_date|activity_type|post_type|
-------+-------------+-------------+---------+
4603670|   2021-12-01|edit         |answer   |
4603670|   2021-12-01|create       |answer   |
4603670|   2021-12-02|edit         |answer   |
4603670|   2021-12-02|edit         |answer   |
4603670|   2021-12-02|create       |answer   |
4603670|   2021-12-02|edit         |question |
4603670|   2021-12-02|edit         |answer   |
4603670|   2021-12-03|edit         |answer   |
4603670|   2021-12-03|create       |answer   |
4603670|   2021-12-03|edit         |question |
```

The final result should look like this:
```sql
user_id|activity_dt|question_create|answer_create|question_edit|answer_edit|
-------+-----------+---------------+-------------+-------------+-----------+
4603670| 2021-12-01|              0|            1|            0|          1|
4603670| 2021-12-02|              0|            1|            1|          3|
4603670| 2021-12-03|              0|            3|            1|          5|
4603670| 2021-12-04|              0|            2|            0|          6|
4603670| 2021-12-05|              0|            2|            0|          3|
4603670| 2021-12-06|              0|            3|            2|          9|
4603670| 2021-12-07|              0|            2|            3|          2|
4603670| 2021-12-08|              0|            2|            2|          6|
4603670| 2021-12-09|              0|            0|            1|          0|
4603670| 2021-12-10|              0|            1|            1|          1|
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
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'create'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edit' 
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
    CAST(pa.activity_date AS DATE) AS activity_dt,
    SUM(CASE WHEN activity_type = 'create'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_create,
    SUM(CASE WHEN activity_type = 'create'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_create,
    SUM(CASE WHEN activity_type = 'edit'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edit,
    SUM(CASE WHEN activity_type = 'edit'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edit  
FROM post_activity pa
     JOIN post_types pt ON pt.post_id = pa.post_id
WHERE user_id = 4603670
GROUP BY 1,2
LIMIT 10;

--sample output
user_id|activity_dt|question_create|answer_create|question_edit|answer_edit|
-------+-----------+---------------+-------------+-------------+-----------+
4603670| 2021-12-01|              0|            1|            0|          1|
4603670| 2021-12-02|              0|            1|            1|          3|
4603670| 2021-12-03|              0|            3|            1|          5|
4603670| 2021-12-04|              0|            2|            0|          6|
4603670| 2021-12-05|              0|            2|            0|          3|
4603670| 2021-12-06|              0|            3|            2|          9|
4603670| 2021-12-07|              0|            2|            3|          2|
4603670| 2021-12-08|              0|            2|            2|          6|
4603670| 2021-12-09|              0|            0|            1|          0|
4603670| 2021-12-10|              0|            1|            1|          1|
```

### Sub-problem 2
Calculate comments metrics. There are two types of comments: 
1. Comments by a user (on one or many posts)
2. Comments on a user's post (by other users)

The query and final result should look like this:
```sql
--listing 3.4
WITH post_activity AS (
    SELECT
        ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'create'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edit' 
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
        AND pa.activity_type = 'create'
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

--sample output
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
```

### Sub-problem 3
Calculate votes metrics. There are two types of votes:
1. Upvotes on a user's post
2. Downvotes on a user's post

The query and final result should look like this:
```sql
--listing 3.5
WITH post_activity AS (
    SELECT
        ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'create'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edit' 
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
        AND pa.activity_type = 'create'
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

--sample output:
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
```

By now you should start to see very clearly how the final result is constructed. All we have to do is take the 3 results from the sub-problems and join them together on `user_id` and `activity_date` This will allow us to have a single table with a granularity of one row per user and all the metrics aggregated on the day level like this:
```sql
--code snippet will not actually run
--listing 3.6
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


## Pattern 2: Writing modular SQL using views/UDFs
When you find yourself copying and pasting CTEs across multiple queries it's time to turn them into views or UDFs.

Views are database objects that can be queried with SQL just like a table. The difference between the two is that views typically don't contain any data. They store a query that gets executed every time the view is queried (just like a CTE).

I say "typically" because there are certain types of views that do contain data (known as *materialized views* but we won't cover them here.

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

![[Example-Dag-Dag4.drawio.png]]

> **Side Note:**
> By combining views and CTEs, you're nesting many queries within others. Not only does this negatively impact performance but some databases have limits to how many levels of nesting you can have.

A great application of SRP is to use a view to rename the columns of an external table or present several joined tables as a single object thus providing a safe *interface* to the rest of your downstream code.

One of the benefits of building reusable CTEs is that if you find yourself copying and pasting the same CTE in multiple places, you can turn it into a view and store it in the database.

What could be made into a view in our specific query?

I think the `post_types` CTE would be a good candidate. That way whenever you have to combine all the post types you don't have to use that CTE everywhere.
```sql
CREATE OR REPLACE VIEW v_post_types AS
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
        posts_answers;
 ```

#### User Defined Functions (UDFs)
Similar to views you can also put commonly used logic into UDFs (user-defined functions) Pretty much all databases allow you to create UDFs but they each use different programming languages to do so. Different database systems use different programming languages to allow for UDF creation. DuckDB offers Python for such functionality. You can read about it [here](https://duckdb.org/docs/api/python/function.html)

Functions allow for a lot more flexibility in data processing. While tables and views use set based logic (set algebra) for operating on data, functions allow you to work on a single row at a time, use conditional flow of logic (if-then-else), variables and loops which makes it easy to implement complex logic.

They can return a single scalar value or a table. A single scalar value can be used for example to parse JSON formatted strings via regular expressions. Table valued functions return a table instead of a single value. They behave exactly like views but the main difference is that they can take input parameters and return different result sets based on that. Very useful.

## Pattern 3: Applying SRP
When you're designing a query and breaking it up into CTEs, there is one principle to keep in mind. As much as possible construct CTEs in such a way that they can be reused in the query later.

Let's take a look at the example from earlier:
```sql
--listing 3.6
WITH post_activity AS (
    SELECT
        ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'create'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edit' 
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
FROM post_activity;
```

This CTE performs several operations like aggregation -- to decrease granularity of the underlying data -- joining and filtering. Its main purpose is to get a mapping between `user_id` and `post_id` at the right level of granularity so it can be used later.

What's great it is that we can also use it for generating user metrics:
```sql
--code snippet will not actually run
SELECT
    user_id,
    CAST(pa.activity_date AS DATE) AS activity_date,
    SUM(CASE WHEN activity_type = 'create'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_created,
    SUM(CASE WHEN activity_type = 'create'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_created,
    SUM(CASE WHEN activity_type = 'edit'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edited,
    SUM(CASE WHEN activity_type = 'edit'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edited  
FROM
	post_activity pa
    JOIN post_types pt ON pt.post_id = pa.post_id
GROUP BY
	1,2
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
        comments c
        INNER JOIN post_activity pa ON pa.post_id = c.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'create'
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
        votes v
        INNER JOIN post_activity pa ON pa.post_id = v.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'create'
    GROUP BY
        1,2
)
```

This is at the heart of well-designed CTE. Notice here that we're being very careful about granularity multiplication! If we simply joined with `post_activity` on post_id without specifying the `activity_type` we'd get duplication. By filtering to just created posts, since a post can only be created once, we're pretty safe in getting a single row per post.

## Pattern 4: Applying DRY
In the previous section we saw how we can decompose a large complex query into multiple smaller components. The main benefit for doing this is that it makes the queries more readable. In that same vein, the DRY (Don't Repeat Yourself) principle ensures that your query is clean from unnecessary repetition.

The DRY principle states that if you find yourself copy-pasting the same chunk of code in multiple locations, you should put that code in a CTE and reference that CTE where it's needed.

To illustrate let's rewrite the query from the previous chapter so that it still produces the same result but it clearly shows repeating code
```sql
--listing 3.7
WITH post_activity AS (
    SELECT
        ph.post_id,
        ph.user_id,
        u.display_name AS user_name,
        ph.creation_date AS activity_date,
        CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'create'
             WHEN ph.post_history_type_id IN (4,5,6) THEN 'edit' 
        END AS activity_type
    FROM
        post_history ph
        INNER JOIN users u on u.id = ph.user_id
    WHERE
        TRUE 
        AND ph.post_history_type_id BETWEEN 1 AND 6
        AND user_id > 0 --exclude automated processes
        AND user_id IS NOT NULL --exclude deleted accounts
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
        posts_questions q
        INNER JOIN post_activity pa ON q.id = pa.post_id
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
        posts_answers q
        INNER JOIN post_activity pa ON q.id = pa.post_id
)
SELECT
    user_id,
    CAST(activity_date AS DATE) AS activity_dt,
    SUM(CASE WHEN activity_type = 'create'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_create,
    SUM(CASE WHEN activity_type = 'create'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_create,
    SUM(CASE WHEN activity_type = 'edit'
        AND post_type = 'question' THEN 1 ELSE 0 END) AS question_edit,
    SUM(CASE WHEN activity_type = 'edit'
        AND post_type = 'answer'   THEN 1 ELSE 0 END) AS answer_edit
FROM
    (SELECT * FROM questions
     UNION ALL
     SELECT * FROM answers) AS p
WHERE 
    user_id = 4603670
GROUP BY 1,2
LIMIT 10;

--sample output
user_id|activity_dt|question_create|answer_create|question_edit|answer_edit|
-------+-----------+---------------+-------------+-------------+-----------+
4603670| 2021-12-01|              0|            1|            0|          1|
4603670| 2021-12-02|              0|            1|            1|          3|
4603670| 2021-12-03|              0|            3|            1|          5|
4603670| 2021-12-04|              0|            2|            0|          6|
4603670| 2021-12-05|              0|            2|            0|          3|
4603670| 2021-12-06|              0|            3|            2|          9|
4603670| 2021-12-07|              0|            2|            3|          2|
4603670| 2021-12-08|              0|            2|            2|          6|
4603670| 2021-12-09|              0|            0|            1|          0|
4603670| 2021-12-10|              0|            1|            1|          1|
```
This query will get you the same results as table 3.3 you saw earlier but notice that the `questions` and `answers` CTEs both have almost identical code. What if we had 10 different post types? You'd be copying and pasting a lot of code thus repeating yourself. Also, the subquery that handles the `UNION` is not ideal. I'm not a fan of subqueries.

With that out of the way let's now look at performance patterns.