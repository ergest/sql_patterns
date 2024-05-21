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

It may seem innocent at first, but if any of those tables contained 300 columns, now you'll be selecting all 300 of them every time you join on those CTEs.
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
--listing 4.6
WITH cte_lowercase_tags AS (
	SELECT
	    q.id AS post_id,
	    q.creation_date,
	    LOWER(q.tags) as tags
	FROM
	    posts_questions q
)
SELECT *
FROM cte_lowercase_tags
WHERE tags LIKE '%sql%'
LIMIT 10;
```
I mentioned earlier that this is not advisable but in this case, if you really need to lowercase tags it's another option. You can use this option with a tool like dbt where you can materialize the lowercase tags into a table to make downstream querying much easier.

Let's look at a few more examples.

Here's we're trying to filter by performing a math operation in the `WHERE` clause. Same thing applies. The database performs a full table scan before filtering.
```sql
--listing 4.7
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

We can do the same thing here:
```sql
--listing 4.8
WITH cte_lowercase_tags AS (
	SELECT
	    q.id AS post_id,
	    q.creation_date,
	    q.answer_count + q.comment_count as total_activity
	FROM
	    posts_questions q
)
SELECT *
FROM cte_lowercase_tags
WHERE total_activity >= 10
LIMIT 10;
```

Let's look at another common example with date functions where we can avoid CTEs altogether:
```sql
--listing 4.9
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

With dates we can be a little cleverer and avoid using CTEs. Since our date is from 2021, we can have to hard-code the start of the year and cast it to date (`2021-01-01::date`) in order calculate the start date and end date of the 50th week of 2021. You can use a function like `CURRENT_DATE()` instead to get the current year's date.
```sql
--listing 4.10
SELECT
    q.id AS post_id,
    q.creation_date,
    date_part('week', creation_date) as week_of_year
FROM
    posts_questions q
WHERE
    creation_date >= DATE_TRUNC('week', '2021-01-01'::date + INTERVAL 49 WEEK)
    AND creation_date < DATE_TRUNC('week', '2021-01-01'::date + INTERVAL 50 WEEK)
LIMIT 10;
```
What's clever about this pattern is that invoking the function calls on fixed data, like current date, does NOT cause full table scans. Only when the function is applied to a column does the query performance suffer.

## Avoid Using DISTINCT (if possible)
`SELECT DISTINCT` is a code smell for me. Whenever I see it, I suspect the programmer is trying to hide data problems without fixing them. It's so common as a catchall fix that this meme exploded both on Twitter/X and LinkedIn

![[select_distinct.jpeg]]

`SELECT DISTINCT` might fix your data problems but used liberally in your code will cause many performance degradations, especially when it's coded inside of views and those views are used multiple times downstream. So is there an alternative?

The most insidious application of `DISTINCT` I have personally dealt with is when combining multiple tables via the `UNION` operator. Not many SQL users know that there's a difference between `UNION` and `UNION ALL`

`UNION` will ensure there's no duplicates in the final result by performing `DISTINCT` behind the scenes while `UNION ALL` will simply append the two results without deduping. I had inadvertently used `UNION` and when I fixed it, query execution went from 15 minutes down to 1 minute while the result was identical!

Here's an example with our database. Suppose I'm trying to get the total user activity (i.e. posts created, edited and commented on) My original query looked like this.
```sql
--listing 4.11
WITH cte_user_activity_by_type AS (
    SELECT
        user_id,
        CASE WHEN post_history_type_id IN (1,2,3) THEN 'created'
             WHEN post_history_type_id IN (4,5,6) THEN 'edited' 
        END AS activity_type,
        COUNT(*) as total_activity
    FROM
        post_history
    GROUP BY
        1,2
    UNION
    SELECT
        user_id,
        'commented' AS activity_type,
        COUNT(*) as total_activity
    FROM
        comments
    GROUP BY
        1,2
)
SELECT
    user_id,
    sum(total_activity) as total_activity
FROM
    cte_user_activity_by_type
GROUP BY 1
LIMIT 10;
```

Notice how I'm using two CTEs for aggregation and how I append them using `UNION` vs `UNION ALL.` While the final result is correct because I sum the total activity, the aggregation inside the CTEs is unnecessary.

We could rewrite the query using `UNION ALL` while simultaneously avoiding expensive aggregation like this:
```sql
--listing 4.12
WITH cte_user_activity_by_type AS (
    SELECT
        user_id,
        CASE WHEN post_history_type_id IN (1,2,3) THEN 'created'
             WHEN post_history_type_id IN (4,5,6) THEN 'edited' 
        END AS activity_type
    FROM
        post_history
    UNION ALL
    SELECT
        user_id,
        'commented' AS activity_type
    FROM
        comments
)
SELECT
    user_id,
    COUNT(*) as total_activity
FROM
    cte_user_activity_by_type
LIMIT 10;
```
## Avoid using OR in the WHERE clause
Using `OR` in the `WHERE` clause can be quite natural based on the logic you're trying to implement but I bet you didn't know there are hidden, performance "gotchas" if you do. They're not very obvious either so pay careful attention.

If you use `OR` to search for multiple values of the same column, there will be no performance issues. In fact you already do this without realizing it. Let's see an example. This query will get all the created posts
```sql
--listing 4.13
    SELECT
        post_id,
        creation_date,
        user_id
    FROM
        post_history
    WHERE
	   post_history_type_id IN (1,2,3);
```

But did you know that the above is equivalent to this?
```sql
--listing 4.13
    SELECT
        post_id,
        creation_date,
        user_id
    FROM
        post_history
    WHERE
	   post_history_type_id = 1
	   OR post_history_type_id = 2
	   OR post_history_type_id = 3;
```

This is an example where using `OR` in the `WHERE` clause doesn't incur a performance penalty. You can even combine `OR` with `AND` (as long as you use parenthesis in the right place) and you'll still be ok because the `OR` is applying to a single column.
```sql
--listing 4.14
    SELECT
        post_id,
        creation_date,
        user_id
    FROM
        post_history
    WHERE
	    (
		   post_history_type_id = 1
		   OR post_history_type_id = 2
		   OR post_history_type_id = 3
		)
	   AND
	   (
		   user_id = 17335553
		   OR user_id = 17551873
		   OR user_id = 15137025
		);
```

However a query like would very likely be problematic:
```sql
--listing 4.15
SELECT
    ph.post_id,
    ph.creation_date,
    u.display_name
FROM
    post_history ph
    INNER JOIN users u 
        ON u.id = ph.user_id
WHERE
   ph.post_history_type_id = 1 OR u.up_votes >= 100;
```

When I see a query like this, I immediately know it will cause problems

That wraps up query performance. There's a lot more to learn about improving query performance but that's not the purpose of this book. In the next chapter we'll cover how to make your queries robust against unexpected changes in the underlying data.