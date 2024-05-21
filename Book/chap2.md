# Chapter 2: Core Concepts and Patterns (TBD)
In this chapter we're going to cover some of the core concepts of querying data and building tables for analysis and data science. We'll start with the most important but underrated concept in SQL; granularity.

## Concept Granularity
Granularity (also known as the grain of the tqable) is a measure of the level of detail that determines an individual row in a table or view. This is extremely important when it comes to joins or aggregating data. 

Granularity comes in two flavors: *fine grain* and *coarse grain*.

A *finely grained* table means a high level of detail like one row per transaction at the millisecond level. A *coarse grained* table means a low level of detail like count of all transactions per day, week or month.

Granularity is usually expressed as the column (or combination of columns) that makes up a unique row.

For example the `users` table has one row per user id specified by the `id` column. This is also known as the primary key of the table. That is the finest grain on it.

The `post_history` table, on the other hand, contains a log of all the activities a user performs on a post on a given date and time. Therefore the granularity is one row per user, per post, per timestamp.

The `comments` table contains a log of all the comments on a post by a user on a given date so its granularity is also one row per user, per post, per timestamp.

The `votes` table contains a log of all the upvotes and downvotes on a post on a given date. It has separate rows for upvotes and downvotes so its granularity is one row per post, per vote type, per timestamp.

To find a table's granularity you either read the documentation, or if that doesn't exist, you make an educated guess and check. Trust but verify. Real world data is messy

How do you check? It's easy.

For the `post_history` table we can run the following query:
```sql
--listing 2.1
SELECT 
	creation_date,
	post_id,
	post_history_type_id AS type_id,
	user_id,
	COUNT(*) AS total
FROM post_history
GROUP BY 1,2,3,4
HAVING COUNT(*) > 1;

--output
creation_date          |post_id |type_id|user_id|total|
-----------------------+--------+-------+-------+-----+
2021-12-10 14:09:36.950|70276799|      5|       |    2|
```
So I'm aggregating by all the columns I expect to make up the unique row and filtering for any that invalidate my assumption. If my hunch is correct, I should get 0 rows from this query. But we don't! We get a duplicate row!

This means we have to be careful when joining with this table on `post_id, user_id, creation_date, post_history_type_id` We have to deal with the duplicate issue first otherwise we'll get incorrect results.

Let's see a couple of methods for doing that.

Our final table will have a grain of one row per user. Only the `users` table has that same granularity. In order to build it we'll have to manipulate the granularity of the source tables so that's what we focus on next.

## Concept 2: Granularity Manipulation
Now that you have a grasp of the concept of granularity the next thing to learn is how to manipulate it. What I mean by manipulation is specifically going from a fine grain to a coarser grain.

For example an e-commerce website might store each transaction it performs as a single row on a table with the millisecond timestamp when it ocurred. This gives us a very fine-grained table (i.e. a very high level of detail) 

But if we wanted to know how much revenue you got on a given day, you have to reduce that level of detail to a single row.  This is done via aggregation.

### Pattern 1: Aggregation
Aggregation is a way of reducing the level of detail by grouping (aka rolling up) data to a coarser grain. You do that by reducing the number of columns in the output and applying `GROUP BY` to the remaining columns. The more columns you remove, the coarser the grain gets. 

This is a very common pattern of storing data in a data warehouse. You keep the table at the finest possible grain (i.e. one transaction per row) and then aggregate it up to whatever level is needed for reporting. This way you can always look up the details when you need to debug issues.

Let's look at an example.

The `post_history` table has too many rows for each `post_history_type_id` and we only need the ones representing post creation and editing. To do this, we can "collapse" them into custom categories via a `CASE` statement as shown below:
```sql
--listing 2.2
SELECT
    ph.post_id,
    ph.user_id,
    ph.creation_date AS activity_date,
    CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
         WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
    END AS activity_type
FROM
    post_history ph
WHERE
    TRUE 
    AND ph.post_history_type_id BETWEEN 1 AND 6
    AND ph.user_id > 0 --exclude automated processes
    AND ph.user_id IS NOT NULL --exclude deleted accounts
    AND ph.creation_date >= '2021-12-01'
    AND ph.creation_date <= '2021-12-31'
    AND ph.post_id = 70182248
GROUP BY
    1,2,3,4;

-- output
post_id |user_id|activity_date          |activity_type|
--------+-------+-----------------------+-------------+
70182248|2230216|2021-12-01 13:07:56.327|edited       |
70182248|2230216|2021-12-01 12:59:48.113|edited       |
70182248|2230216|2021-12-02 07:46:22.630|edited       |
70182248|2230216|2021-12-01 10:03:18.350|created      |
70182248|2230216|2021-12-01 18:41:18.033|edited       |
70182248|2230216|2021-12-01 11:04:12.603|edited       |
70182248|2702894|2021-12-01 13:35:41.293|edited       |
```

Notice that didn't use an aggregation function like `COUNT()` or `SUM()` when doing a `GROUP BY` and that's perfectly ok since we don't need it. You can see now how we're going to manipulate the granularity to get one row per user. We need the date in order to calculate all the date related metrics.

### Pattern 2: Date Granularity
The timestamp column `creation_date` is a rich field with both the date and time information (hour, minute, second, microsecond). Timestamp fields are special when it comes to aggregation because they have many levels of granularities built in.

Given a single timestamp, we can construct granularities for seconds, minutes, hours, days, weeks, months, quarters, years, decades, etc. We do that by using one of the many date manipulation functions like `CAST()`,  `DATE_TRUNC()`, `DATE_PART()`, etc. 

For example if I wanted to remove the time information, I could reduce all activities on a given date to a single row like this:
```sql
--listing 2.3
SELECT
    ph.post_id,
    ph.user_id,
    CAST(ph.creation_date AS DATE) AS activity_date,
    CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
         WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
    END AS activity_type,
    COUNT(*) AS total
FROM
    post_history ph
WHERE
    TRUE 
    AND ph.post_history_type_id BETWEEN 1 AND 6
    AND ph.user_id > 0 --exclude automated processes
    AND ph.user_id IS NOT NULL --exclude deleted accounts
    AND ph.creation_date >= '2021-12-01'
    AND ph.creation_date <= '2021-12-31'
    AND ph.post_id = 70182248
GROUP BY
    1,2,3,4;

--output
post_id |user_id|activity_date|activity_type|total|
--------+-------+-------------+-------------+-----+
70182248|2702894|   2021-12-01|edited       |    1|
70182248|2230216|   2021-12-01|edited       |    5|
70182248|2230216|   2021-12-02|edited       |    1|
70182248|2230216|   2021-12-01|created      |    3|
```

In our case we only need to aggregate up to the day level, so we remove the time components by using `CAST(AS DATE)` 

### Pattern 3: Pivoting Data
Pivoting is another form of granularity manipulation where you change the shape of aggregated data by "pivoting" rows into columns. Let's look at the above example and try to pivot the activity type into separate columns for `created` and `edited` 

Note that the counts here don't make sense since we already know that there are 3 different `post_history_type_id` for creation and editing. This is simply shown for demonstration purposes.

This is the query will take the above output and turn it into:
```sql
--listing 2.4
SELECT
    ph.post_id,
    ph.user_id,
    CAST(ph.creation_date AS DATE) AS activity_date,
    SUM(CASE WHEN ph.post_history_type_id IN (1,2,3)
		THEN 1 ELSE 0 END) AS created,
    SUM(CASE WHEN ph.post_history_type_id IN (4,5,6)
		THEN 1 ELSE 0 END) AS edited
FROM
    post_history ph
WHERE
    TRUE 
    AND ph.post_history_type_id BETWEEN 1 AND 6
    AND ph.user_id > 0 --exclude automated processes
    AND ph.user_id IS NOT NULL --exclude deleted accounts
    AND ph.creation_date >= '2021-12-01'
    AND ph.creation_date <= '2021-12-31'
    AND ph.post_id = 70182248
GROUP BY
    1,2,3;

--output
post_id |user_id|activity_date|created|edited|
--------+-------+-------------+-------+------+
70182248|2230216|   2021-12-01|      3|     5|
70182248|2702894|   2021-12-01|      0|     1|
70182248|2230216|   2021-12-02|      0|     1|
```

Pivoting is how we're going to calculate all the metrics for users, so this is an important concept to learn.

## Concept 3: Granularity Multiplication
Granularity multiplication will happen if the tables you're joining have different levels of detail for the columns being joined on. This will cause the resulting number of rows to multiply.

### Pattern 1: Basic JOINs
Joining tables is one of the most basic functions in SQL. Databases are designed to minimize redundancy of information and they do that by a process known as normalization. Joins then allow us to get all the information back in a single piece by combining these tables together.

Let's look at an example:

The `users` table has a grain of one row per user:
```sql
--listing 2.5
SELECT
	id,
	display_name,
	creation_date,
	reputation
FROM users
WHERE id = 2702894;

--output
id     |display_name  |creation_date          |reputation|
-------+--------------+-----------------------+----------+
2702894|Graham Ritchie|2013-08-21 09:07:23.133|     20218|
```

Whereas the `post_history` table has multiple rows for the same user:
```sql
--listing 2.6
SELECT
	id,
	creation_date,
	post_id,
	post_history_type_id AS type_id,
	user_id 
FROM
	post_history ph
WHERE
	TRUE
	AND ph.user_id = 2702894
LIMIT 10;

--output
id       |creation_date          |post_id |type_id|user_id|
---------+-----------------------+--------+-------+-------+
260173419|2021-12-16 10:54:11.637|70377756|      2|2702894|
260541172|2021-12-22 07:51:17.123|70445771|      2|2702894|
260044378|2021-12-14 16:28:26.013|70352124|      6|2702894|
260548889|2021-12-22 10:04:40.227|70446634|      6|2702894|
259143984|2021-12-01 13:34:28.483|70185165|      2|2702894|
259145213|2021-12-01 13:50:18.883|70185401|      2|2702894|
259211259|2021-12-02 10:38:18.150|70197917|      2|2702894|
259212754|2021-12-02 10:59:39.880|70198204|      2|2702894|
259457154|2021-12-06 07:56:54.167|70242375|      2|2702894|
```

If we join them on `user_id` the granularity of the final result will be multiplied to have as many rows per user:
```sql
--listing 2.7
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date,
	post_history_type_id AS type_id
FROM
	post_history ph
	INNER JOIN users u 
		ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.user_id = 2702894;

--output
post_id |user_id|user_name     |activity_date          |type_id|
--------+-------+--------------+-----------------------+-------+
70377756|2702894|Graham Ritchie|2021-12-16 10:54:11.637|      2|
70445771|2702894|Graham Ritchie|2021-12-22 07:51:17.123|      2|
70352124|2702894|Graham Ritchie|2021-12-14 16:28:26.013|      6|
70446634|2702894|Graham Ritchie|2021-12-22 10:04:40.227|      6|
70185165|2702894|Graham Ritchie|2021-12-01 13:34:28.483|      2|
70185401|2702894|Graham Ritchie|2021-12-01 13:50:18.883|      2|
70197917|2702894|Graham Ritchie|2021-12-02 10:38:18.150|      2|
70198204|2702894|Graham Ritchie|2021-12-02 10:59:39.880|      2|
70242375|2702894|Graham Ritchie|2021-12-06 07:56:54.167|      2|
```

Notice how the `user_name` repeats for each row.

So if the history table has 10 entries for the same user and the `users` table has 1, the final result will contain 10 x 1 entries for the same user. If for some reason the `users` contained 2 entries for the same user (messy real world data), we'd see 10 x 2 = 20 entries for that user in the final result and each row would repeat twice.

### Pattern 2: Accidental INNER JOIN
Did you know that SQL will ignore a `LEFT JOIN` clause and perform an `INNER JOIN` instead if you make this one simple mistake? This is one of those SQL hidden secrets which sometimes gets asked as a trick question in interviews.

When doing a `LEFT JOIN` you're intending to show all the results on the table in the `FROM` clause but if you need to limit

Let's take a look at the example query from above:
```sql
--listing 2.8
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	post_history ph
	INNER JOIN users u 
		ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 70286266
ORDER BY
	activity_date;

--output
post_id |user_id |user_name        |activity_date          |
--------+--------+-----------------+-----------------------+
70286266|11693691|M.hussnain Gujjar|2021-12-09 07:45:41.700|
70286266|11693691|M.hussnain Gujjar|2021-12-09 07:45:41.700|
70286266|11693691|M.hussnain Gujjar|2021-12-09 07:45:41.700|
70286266|12221382|Aldin Bradaric   |2021-12-09 14:06:00.677|
70286266|12410533|Andrew Halil     |2021-12-13 09:02:26.593|
70286266|12410533|Andrew Halil     |2021-12-13 09:02:26.593|
```

You'll see 6 rows. Now let's change the `INNER JOIN` to a `LEFT JOIN` and rerun the query:
```sql
--listing 2.9
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	post_history ph
	LEFT JOIN users u
		ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 70286266
ORDER BY
	activity_date;

--output
post_id |user_id |user_name        |activity_date          |
--------+--------+-----------------+-----------------------+
70286266|11693691|M.hussnain Gujjar|2021-12-09 07:45:41.700|
70286266|11693691|M.hussnain Gujjar|2021-12-09 07:45:41.700|
70286266|11693691|M.hussnain Gujjar|2021-12-09 07:45:41.700|
70286266|12221382|Aldin Bradaric   |2021-12-09 14:06:00.677|
70286266|        |                 |2021-12-09 14:06:00.677|
70286266|        |                 |2021-12-13 09:02:26.593|
70286266|12410533|Andrew Halil     |2021-12-13 09:02:26.593|
70286266|12410533|Andrew Halil     |2021-12-13 09:02:26.593|
```

Now we get 8 rows! What happened?

If you scan the results, you'll notice several where both the `user_name` and the `user_id` are `NULL` which means they're unknown. These could be people who made changes to that post and then deleted their accounts. Notice how the `INNER JOIN` was filtering them out? That's what I mean by data reduction which we discussed previously.

Suppose we only want to see users with a reputation of  500,000 or higher. That's seems pretty straightforward just add the condition to the where clause.
```sql
--listing 2.10
SELECT
	COUNT(*)
FROM
	post_history ph
	LEFT JOIN users u
		ON u.id = ph.user_id
WHERE
	TRUE
	AND u.reputation >= 500000;

--output
count_star()|
------------+
        7596|
```

We get 7,596 rows. Fine you might say, that looks right. But it's not! Adding filters on the `WHERE` clause for tables that are left joined will **ALWAYS** perform an `INNER JOIN.`

If we wanted to filter rows in the `users` table and still do a `LEFT JOIN` we have to add the filter in the join condition like so:
```sql
--listing 2.11
SELECT
	COUNT(*)
FROM
	post_history ph
	LEFT JOIN users u
		ON u.id = ph.user_id
		AND u.reputation >= 500000
WHERE
	TRUE;

--output
count_star()|
------------+
      806608|
```

Now we get 806,608 rows!

The ONLY time when putting a condition in the `WHERE` clause does NOT turn a `LEFT JOIN` into an `INNER JOIN` is when checking for `NULL.` 

This is very useful when you want to see the missing data on the table that's being left joined. Here's an example
```sql
--listing 2.12
SELECT
	COUNT(*)
FROM
	post_history ph
	LEFT JOIN users u
		ON u.id = ph.user_id
WHERE
	TRUE
	AND u.id IS NULL;

--output
count_star()|
------------+
       15704|
```


### Pattern 3: Start with a LEFT JOIN
Since we're on the subject of LEFT JOINS, one of my most used rules of thumb is to always use a `LEFT JOIN` when I'm not sure if one table is a subset of the other. For example in the query above, there's definitely users that have a valid `user_id` in the `users` table but have never had any activity.

This often happens in the real world when data is deleted from a table and there's no foreign key constraints to ensure referential integrity (i.e. the database ensures you can't delete a row if it's referenced in another table. These types of constraints don't exist in data warehouses hence my general rule of thumb of always starting with a `LEFT JOIN.`

Now that we have covered the basic concepts, it's time to dive into the patterns.

## Pattern 4: Talk about UNION vs UNION ALL
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
```

As a rule of thumb, when you append tables, it's a good idea to add a constant column to indicate the source table or some kind of type. This is helpful when appending say activity tables to create a long, time-series table and you want to identify each activity type in the final result set.

You'll notice in my query above I create a `post_type` column indicating where the data is coming from.

#### Talk about deduping rows via row_number() and qualify
#### Talk about rank() and dense_rank() applications

## Crosstab
## Deduping Data Deliberately
(by using row_number() with qualify())