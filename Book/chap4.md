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

Here's a rule of thumb when it comes to making queries faster. Always try to make the `wHERE` clause simple. Compare a column to another column or to a fixed value and avoid using functions.

When you use compare a column to a fixed value or to another column, the query optimizer can filter down to the relevant rows much faster. When you use a function or a complicated formula, the optimizer needs to scan the entire table to do the filtering. This is negligible for small tables but when dealing with millions of rows query performance will suffer.

Let's see some examples:

The `tags` column in both questions and answers is a collection of strings separated by `|` character as you see here:
```sql
SELECT 
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    bigquery-public-data.stackoverflow.posts_questions q
WHERE
    TRUE
    AND creation_date >= '2021-06-01' 
    AND creation_date <= '2021-09-30'
LIMIT 10
```

Here's the output:
```sql

post_id |creation_date          |tags                                  |
--------+-----------------------+--------------------------------------+
67781287|2021-05-31 20:00:59.663|python|selenium|screen-scraping|      |
67781291|2021-05-31 20:01:48.593|python                                |
67781295|2021-05-31 20:02:38.043|html|css|bootstrap-4                  |
67781298|2021-05-31 20:03:01.413|xpages|lotus-domino                   |
67781300|2021-05-31 20:03:12.987|bash|awk|sed                          |
67781306|2021-05-31 20:03:54.117|c                                     |
67781310|2021-05-31 20:04:33.980|php|html|navbar                       |
67781313|2021-05-31 20:04:57.957|java|spring|dependencies              |
67781314|2021-05-31 20:05:12.723|python|qml|kde                        |
67781315|2021-05-31 20:05:15.703|javascript|reactjs|redux|react-router||
```

The tags pertain to the list of topics or subjects that a post is about. One of the tricky things about storing tags like this is that you don't have to worry about the order in which they appear. There's no categorization system here. A tag can appear anywhere in the string.

How would you go about filtering all the posts that are about SQL? Since the tag `|sql|` can appear anywhere in the string, you'll need a way to search the entire string. One way to do that is to use the `INSTR()` function like this:
```sql
SELECT 
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    bigquery-public-data.stackoverflow.posts_questions q
WHERE
    TRUE
    AND creation_date >= '2021-06-01' 
    AND creation_date <= '2021-09-30'
    AND INSTR(tags, "|sql|") > 0
LIMIT 10
```

Here's the output:
```sql

post_id |creation_date          |tags                           |
--------+-----------------------+-------------------------------+
67941534|2021-06-11 13:55:08.693|mysql|sql|database|datatable   |
67810767|2021-06-02 14:40:44.110|mysql|sql|sqlite               |
67814136|2021-06-02 20:55:41.193|mysql|sql|where-clause         |
67849335|2021-06-05 07:58:09.493|php|mysql|sql|double|var-dump  |
68074104|2021-06-21 16:08:25.487|php|sql|postgresql|mdb2        |
67920305|2021-06-10 07:32:21.393|python|sql|pandas|pyodbc       |
68015950|2021-06-17 04:47:27.713|c#|sql|.net|forms|easy-modbus  |
68058413|2021-06-20 13:28:00.980|java|sql|spring|kotlin|jpa     |
68060567|2021-06-20 18:39:04.150|mysql|sql|ruby-on-rails|graphql|
68103046|2021-06-23 11:40:56.087|php|mysql|sql|stored-procedures|
```

This should be pretty simple to understand. We're searching for the sub-string `|sql|` anywhere in the `tags` column. The `INSTR()` searches for a sub-string within a string and returns the position of the character where it's found. Since we don't care about that, we only care that it's found our condition is > 0.

This is a very typical example of using functions in the `WHERE` clause. This particular query might be fast but in general this pattern is not advised. So what can you do instead?

Use the `LIKE` keyword to look for patterns. Many query optimizers perform much better with `LIKE` then with using a function:
```sql
SELECT 
    q.id AS post_id,
    q.creation_date,
    q.tags
FROM
    bigquery-public-data.stackoverflow.posts_questions q
WHERE
    TRUE
    AND creation_date >= '2021-06-01' 
    AND creation_date <= '2021-09-30'
    AND tags LIKE "%|sql|%"
LIMIT 10
```

Here's the output:
```sql

post_id |creation_date          |tags                           |
--------+-----------------------+-------------------------------+
67941534|2021-06-11 13:55:08.693|mysql|sql|database|datatable   |
67810767|2021-06-02 14:40:44.110|mysql|sql|sqlite               |
67814136|2021-06-02 20:55:41.193|mysql|sql|where-clause         |
67849335|2021-06-05 07:58:09.493|php|mysql|sql|double|var-dump  |
68074104|2021-06-21 16:08:25.487|php|sql|postgresql|mdb2        |
67920305|2021-06-10 07:32:21.393|python|sql|pandas|pyodbc       |
68015950|2021-06-17 04:47:27.713|c#|sql|.net|forms|easy-modbus  |
68058413|2021-06-20 13:28:00.980|java|sql|spring|kotlin|jpa     |
68060567|2021-06-20 18:39:04.150|mysql|sql|ruby-on-rails|graphql|
68103046|2021-06-23 11:40:56.087|php|mysql|sql|stored-procedures|
```
## Avoid Using DISTINCT (if possible)
Watch out for UNION vs UNION ALL

## Avoid using OR in the WHERE clause


That wraps up query performance. There's a lot more to learn about improving query performance but that's not the purpose of this book. In the next chapter we'll cover how to make your queries robust against unexpected changes in the underlying data.