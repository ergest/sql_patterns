# Chapter 4: Query Performance
In this chapter we're going to talk about query performance, aka how to make your queries run faster. Why do we care about making queries run faster? Faster queries get you results faster, obviously, but they also consume fewer resources, making them cheaper on modern data warehouses.

This chapter isn't just about speed. There are many clever hacks to make your queries run really fast, but many of them will make your code unreadable and unmaintainable. We need to strike a balance between performance and maintainability.

## Reduce Rows as Early as Possible
The most important pattern that improves query performance is reducing data as much as possible as early as possible. What does that mean?

So far we've learned that using modularity via CTEs and views is the best way to tackle complex queries. We also learned to keep our modules small and single purpose to ensure maximum composability. CTEs are great for aggregation and calculation of metrics but they can also be used to filter data as early as possible.

Let's take a look at the example from the last chapter but now let's add a filter for only the activity that occurred in the second week of December 2021.
```sql
--listing 4.1
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
WHERE activity_date BETWEEN '2021-12-14' AND '2021-12-21';
```

This is a correct way to filter the results and it may even be performant in our case given our small database and the really fast DuckDB engine. But there's an even better way to write it if we know we need to filter data before using it. For example we might want a rolling window of just the current week's post activity.
```sql
--listing 4.2
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
        AND activity_date BETWEEN '2021-12-14' AND '2021-12-21'
    GROUP BY
        1,2,3,4,5
)
SELECT *
FROM post_activity;
```

Did you notice the difference? We moved the date filter inside the CTE vs outside. Now of course I know that many modern database will automatically do "predicate pushdown" which means they will see the `WHERE` clause outside the CTE but still apply it inside. They will filter the rows before doing anything else.

But it doesn't always happen. I've seen cases where due to the table setup, a query like `4.1` took 10 hours and changing it to the query in `4.2` reduced execution time to 10 minutes!! Rather than relying on databases to do the right thing, we can ensure that we do the right thing for it. Filtering data inside a CTE is a great application of "filtering rows as early as possible."

## Reducing Columns
Almost every book or course will tell you to start exploring a table by doing:
```sql
--listing 4.3
SELECT *
FROM posts_questions
LIMIT 10;
```

This may be ok in a traditional RDBMS, but with modern data warehouses things are different. Because they store data in columns vs rows `SELECT *` will scan the entire table and your query will be slower. Imagine running `SELECT * FROM table` where the table has 300 columns.

You don't have to know anything about databases to know that the query will be much slower than if you selected a subset of columns.

Here's an example you've seen before. In the `post_activity` CTE we select only the `id` column which is the only one we need to join with `post_activity` on. The `post_type` is a static value which is negligible when it comes to performance.
```sql
-- code snippet will not run
,post_types AS (
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
 ```

Compared to:
```sql
-- code snippet will not run
,post_types AS (
    SELECT
	    pq.*,
		id AS post_id,
        'question' AS post_type,
    FROM
        posts_questions pq
    UNION ALL
    SELECT
	    pa.*,
        id AS post_id,
        'answer' AS post_type,
    FROM
        posts_answers pa
 )
 ```

It may seem innocent at first, but if any of those tables contained 300 columns, now you'll be selecting them everytime you join on those CTEs.
## Delaying Sorting
As a rule of thumb you should AVOID any kind of sorting inside production level queries. Sorting is a very expensive operation, especially for really large tables and it wll dramatically slow down your queries. If you add an `ORDER BY` operation in your CTEs or views, anytime you join with that CTE or view, the database engine will be forced to sort data in memory.

Sorting is best left to reporting and BI tools if it's not needed, or done at the very end, if it is at all necessary. You can't always avoid it though. Window functions for example sometimes necessitate sorting in order to choose the top row. We'll see an example of this later.

For example, the following is unnecessary and slows down performance because the sorting is done is inside a CTE. You don't need to sort your data yet.
```sql
-- code snippet will not run
, votes_on_user_post AS (
  	SELECT
        pa.user_id,
        CAST(DATE_TRUNC(v.creation_date, DAY) AS DATE) AS activity_date,
        SUM(CASE WHEN vote_type_id = 2 THEN 1 ELSE 0 END) AS total_upvotes,
        SUM(CASE WHEN vote_type_id = 3 THEN 1 ELSE 0 END) AS total_downvotes,
    FROM
        votes v
        INNER JOIN post_activity pa ON pa.post_id = v.post_id
    WHERE
        TRUE
        AND pa.activity_type = 'created'
		AND v.creation_date BETWEEN '2021-12-14' AND '2021-12-21'
	GROUP BY
        1,2
    ORDER BY
	    v.creation_date
)
```

## Avoid Using Functions in the WHERE Clause
In case you didn't know, you can put anything in the where clause. You already know about filtering on dates, numbers and strings of course but you can also filter calculations, functions, `CASE` statements, etc.

When you use compare a column to a fixed value or to another column, the query optimizer can filter down to the relevant rows much faster. When you use a function or a complicated formula, the optimizer needs to scan the entire table before doing the filtering. This is negligible for small tables but when dealing with millions of rows query performance will suffer.

Let's see some examples:

The `tags` column in both questions and answers is a collection of strings separated by `|` character as you see here:
```sql
--listing 4.4
SELECT 
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    posts_questions q
LIMIT 10;
```

Here's a sample output (yours might differ):
```sql
post_id |creation_date          |tags                                 |
--------+-----------------------+-------------------------------------+
70177589|2021-12-01 00:02:03.777|blockchain|nearprotocol|near|nearcore|
70177596|2021-12-01 00:02:52.657|google-oauth|google-workspace        |
70177598|2021-12-01 00:03:16.373|python|graph|networkx                |
70177601|2021-12-01 00:03:32.413|elasticsearch                        |
70177623|2021-12-01 00:06:16.950|python|tkinter                       |
70177624|2021-12-01 00:06:19.537|c#                                   |
70177627|2021-12-01 00:07:50.607|flutter                              |
70177629|2021-12-01 00:08:02.943|python|python-3.x|pexpect            |
70177630|2021-12-01 00:08:16.173|sql|sql-server|tsql                  |
70177633|2021-12-01 00:08:46.233|sql|sql-server|tsql                  |

Table 4.1
```

The tags pertain to the list of topics or subjects that a post is about. One of the tricky things about storing tags like this is that you don't have to worry about the order in which they appear. There's no categorization system here. A tag can appear anywhere in the string.

Suppose we're looking for posts mentioning SQL. How would we do it? I'm pretty sure you're familiar with pattern matching in SQL using the keyword `LIKE` But since we don't know if the string is capitalized (i.e. it could be SQL, sql, Sql, etc) and we want to match all of them, it's common to use the function `LOWER()` before matching the pattern.

Here's an example of what NOT to do (unless you're doing ad-hoc querying)
```sql
--listing 4.5
SELECT
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    posts_questions q
WHERE
    TRUE
    AND lower(tags) like '%sql%'
LIMIT 10;
```

Here's how to get the same result without using functions in `WHERE`
```sql
--listing 4.6
SELECT
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    posts_questions q
WHERE
    TRUE
    AND tags ilike '%sql%'
LIMIT 10;
```

In our small database this query will be quite fast, however by using the function `LOWER()` in the `WHERE` clause, you're inadvertently causing the database engine to scan the entire table, perform the lowercase operation and then perform the filtering. By using the keyword `ILIKE` which makes the search case-insensitive and avoids using `LOWER()`

Alternatively you can perform the `LOWER()` operator beforehand in a CTE or view like this:
```sql
WITH cte_lowercase_tags AS (
	SELECT
	    q.id AS post_id,
	    q.creation_date,
	    LOWER(q.tags) as tags
	FROM
	    posts_questions
)
SELECT *
FROM 
```

The same thing happens when you perform any other operations in the `WHERE` clause like addition, multiplication or any other math or date functions:
```sql
--listing 4.6
SELECT
    q.id AS post_id,
    q.creation_date,
    q.answer_count + q.comment_count as total_activity
FROM
    posts_questions q
WHERE
    TRUE
    AND answer_count + comment_count >= 10
LIMIT 10;
```

Here's the output:
```sql
post_id |creation_date          |total_activity|
--------+-----------------------+--------------+
70270242|2021-12-08 05:09:48.113|            10|
70255288|2021-12-07 05:19:45.337|            12|
70256716|2021-12-07 08:04:30.497|            10|
70318632|2021-12-11 20:10:08.213|            12|
70334900|2021-12-13 12:45:37.097|            11|
70333905|2021-12-13 11:29:00.117|            14|
70237681|2021-12-05 19:13:40.890|            10|
70257087|2021-12-07 08:38:39.263|            10|
70281346|2021-12-08 20:29:31.357|            13|
70190971|2021-12-01 20:43:14.507|            12|

Table 4.3
```

Here's another common example:
```sql
--listing 4.7
SELECT
    q.id AS post_id,
    q.creation_date,
    date_part('week', creation_date) as week_of_year
FROM
    posts_questions q
WHERE
    date_part('week', creation_date) = 50
LIMIT 10;
```

And here's some sample output:
```sql
post_id |creation_date          |week_of_year|
--------+-----------------------+------------+
70337022|2021-12-13 15:25:08.903|          50|
70338059|2021-12-13 16:46:16.940|          50|
70348470|2021-12-14 11:56:02.373|          50|
70347796|2021-12-14 11:02:31.563|          50|
70347279|2021-12-14 10:24:40.953|          50|
70337072|2021-12-13 15:28:32.317|          50|
70328850|2021-12-13 00:35:38.387|          50|
70332341|2021-12-13 09:22:07.927|          50|
70333562|2021-12-13 11:00:05.760|          50|
70341363|2021-12-13 21:50:42.510|          50|

Table 4.4
```
## Avoid Using DISTINCT (if possible)
Watch out for UNION vs UNION ALL

## Avoid using OR in the WHERE clause


That wraps up query performance. There's a lot more to learn about improving query performance but that's not the purpose of this book. In the next chapter we'll cover how to make your queries robust against unexpected changes in the underlying data.