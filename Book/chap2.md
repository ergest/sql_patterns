# Chapter 2: Core Concepts
In this chapter we're going to cover some of the core concepts of querying data and building tables for analysis and data science. We'll start with the most important but underrated concept in SQL, granularity.

## Granularity
Granularity (also known as the grain) is a measure of the level of detail that determines an individual row in a table or view. This is extremely important when it comes to joins or aggregating data. 

Granularity comes in two flavors: *fine grain* and *coarse grain*.

A finely grained table means a high level of detail, like one row per transaction. 

A coarse grained table means a low level of detail like count of all transactions in a day.

Granularity is usually expressed as the number of unique rows for each column or combination of columns. 

For example the `users` table has one row per user. That is the finest grain on it. The `post_history` table, on the other hand, contains a log of all the changes that a user performs on a post on a given date and time. Therefore the granularity is one row per user, per post, per timestamp.

The `comments` table contains a log of all the comments on a post by a user on a given date so its granularity is also one row per user, per post, per date.

The `votes` table contains a log of all the upvotes and downvotes on a post on a given date. It has separate rows for upvotes and downvotes so its granularity is one row per post, per vote type, per date.

To find a table's granularity you either read the documentation, or if that doesn't exist, you make an educated guess and check. Trust but verify. Real world data is messy

How do you check? It's easy.

For the `post_history` table we can run the following query:
```sql
SELECT 
	creation_date,
	post_id,
	post_history_type_id AS type_id,
	user_id,
	COUNT(*) AS total
FROM bigquery-public-data.stackoverflow.post_history
GROUP BY 1,2,3,4
HAVING COUNT(*) > 1;
```
So I'm aggregating by all the columns I expect to make up the unique row and filtering for any that invalidate my assumption. If my hunch is correct, I should get 0 rows from this query.

But we don't! We get a bunch of duplicate rows:
```sql
creation_date          |post_id |type_id|user_id |rows|
-----------------------+--------+-------+--------+----+
2020-07-20 05:00:26.413|62964197|     34|      -1|   2|
2020-08-05 16:31:15.220|63272171|      5|14038907|   2|
2018-10-08 09:54:40.990|40921767|      5| 4826457|   2|
2020-05-07 22:02:27.877|61637980|     34|      -1|   2|
2018-10-13 05:26:22.243|52784015|      5| 6599590|   2|
2021-01-03 10:35:35.693|65550662|      5|12833166|   2|
2018-12-02 14:28:12.947|53576317|      5|10732059|   2|
2018-09-05 04:16:26.440|52140985|      4| 3623424|   3|
2018-12-17 22:43:27.800|53826052|      8| 1863229|   2|
2018-09-13 17:13:31.490|52321596|      5| 5455640|   2|
```

This means we have to be careful when joining with this table on `post_id, user_id, creation_date, post_history_type_id` and we'd have to deal with the duplicate issue first. Let's see a couple of methods for doing that.

What does this mean for our project?

Our final table will have a grain of one row per user. Only the `users` table has that same granularity. In order to build it we'll have to manipulate the granularity of the source tables so that's what we focus on next.

## Granularity Manipulation
Now that you have a grasp of the concept of granularity the next thing to learn is how to manipulate it. What I mean by manipulation is specifically going from a fine grain to a coarser grain.

For example an e-commerce website might store each transaction it performs as a single row on a table. This gives us a very fine-grained table (i.e. a very high level of detail) If we wanted to know how much revenue you got on a given day, you have to reduce that level of detail to a single row. 

This is done via aggregation.

### Aggregation
Aggregation is a way of reducing the level of detail by grouping (aka rolling up) data to a coarser grain. You do that by reducing the number of columns in the output and applying `GROUP BY` to the remaining columns. The more columns you remove, the coarser the grain gets. 

I call this *collapsing the granularity.*

This is a very common pattern of storing data in a data warehouse. You keep the table at the finest possible grain (i.e. one transaction per row) and then aggregate it up to whatever level is needed for reporting. This way you can always look up the details when you need to.

Let's look at an example.

The `post_history` table has too many rows for each `post_history_type_id` and we only need the ones representing post creation and editing. To do this, we can "collapse" them into custom categories via a `CASE` statement as shown below:
```sql
SELECT
    ph.post_id,
    ph.user_id,
    ph.creation_date AS activity_date,
    CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
         WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
    END AS activity_type
FROM
    bigquery-public-data.stackoverflow.post_history ph
WHERE
    TRUE 
    AND ph.post_history_type_id BETWEEN 1 AND 6
    AND ph.user_id > 0 --exclude automated processes
    AND ph.user_id IS NOT NULL --exclude deleted accounts
    AND ph.creation_date >= '2021-06-01'
    AND ph.creation_date <= '2021-09-30'
	AND ph.post_id = 69301792
GROUP BY
    1,2,3,4
```

Here's the output:
```sql
post_id |user_id |activity_date          |activity_type|
--------+--------+-----------------------+-------------+
69301792|  331024|2021-09-23 21:11:44.957|edited       |
69301792|   63550|2021-09-24 10:38:36.220|edited       |
69301792|  331024|2021-09-23 10:17:11.763|created      |
69301792|  331024|2021-09-23 18:48:31.387|edited       |
69301792|14251221|2021-09-23 22:38:04.863|edited       |
69301792|  331024|2021-09-23 20:13:05.727|edited       |
```

Notice that didn't use an aggregation function like `COUNT()` or `SUM()` and that's perfectly ok since we don't need it. 

You can see now how we're going to manipulate the granularity to get one row per user. We need the date in order o calculate all the date related metrics.

### Date Granularity
The timestamp column `creation_date` is a rich field with both the date and time information (hour, minute, second, microsecond). Timestamp fields are special when it comes to aggregation because they have many levels of granularities built in.

Given a single timestamp, we can construct granularities for seconds, minutes, hours, days, weeks, months, quarters, years, decades, etc. We do that by using one of the many date manipulation functions like `CAST()`,  `DATE_TRUNC()`, `DATE_PART()`, etc. 

For example if I wanted to remove the time information, I could reduce all activities on a given date to a single row like this:
```sql
SELECT
    ph.post_id,
    ph.user_id,
    CAST(ph.creation_date AS DATE) AS activity_date,
    CASE WHEN ph.post_history_type_id IN (1,2,3) THEN 'created'
         WHEN ph.post_history_type_id IN (4,5,6) THEN 'edited' 
    END AS activity_type,
    COUNT(*) AS total
FROM
    bigquery-public-data.stackoverflow.post_history ph
WHERE
    TRUE 
    AND ph.post_history_type_id BETWEEN 1 AND 6
    AND ph.user_id > 0 --exclude automated processes
    AND ph.user_id IS NOT NULL --exclude deleted accounts
    AND ph.creation_date >= '2021-06-01' 
    AND ph.creation_date <= '2021-09-30'
	AND ph.post_id = 69301792
GROUP BY
    1,2,3,4
```

Here's the output:
```sql

post_id |user_id |activity_date|activity_type|total|
--------+--------+-------------+-------------+-----+
69301792|  331024|   2021-09-24|edited       |    3|
69301792|14251221|   2021-09-24|edited       |    1|
69301792|  331024|   2021-09-23|created      |    3|
69301792|   63550|   2021-09-24|edited       |    2|
69301792|  331024|   2021-09-23|edited       |    1|
```

In our case we only need to aggregate up to the day level, so we remove the time components by using `CAST(AS DATE)` 

### Pivoting Data
Pivoting is another form of granularity manipulation where you change the shape of aggregated data by "pivoting" rows into columns. Let's look at the above example and try to pivot the activity type into separate columns for `created` and `edited` 

Note that the counts here don't make sense since we already know that there are 3 different `post_history_type_id` for creation and editing. This is simply shown for demonstration purposes.

This is the query:
```sql
SELECT
    ph.post_id,
    ph.user_id,
    CAST(ph.creation_date AS DATE) AS activity_date,
    SUM(CASE WHEN ph.post_history_type_id IN (1,2,3)
		THEN 1 ELSE 0 END) AS created,
    SUM(CASE WHEN ph.post_history_type_id IN (4,5,6)
		THEN 1 ELSE 0 END) AS edited
FROM
    bigquery-public-data.stackoverflow.post_history ph
WHERE
    TRUE 
    AND ph.post_history_type_id BETWEEN 1 AND 6
    AND ph.user_id > 0 --exclude automated processes
    AND ph.user_id IS NOT NULL --exclude deleted accounts
    AND ph.creation_date >= '2021-06-01' 
    AND ph.creation_date <= '2021-09-30'
    AND ph.post_id = 69301792
GROUP BY
    1,2,3
```

It will take this type of output
```sql
post_id |user_id |activity_date|activity_type|total|
--------+--------+-------------+-------------+-----+
69301792|  331024|   2021-09-24|edited       |    3|
69301792|14251221|   2021-09-24|edited       |    1|
69301792|  331024|   2021-09-23|created      |    3|
69301792|   63550|   2021-09-24|edited       |    2|
69301792|  331024|   2021-09-23|edited       |    1|
```

and turn it into this
```sql
post_id |user_id |activity_date|created|edited|
--------+--------+-------------+-------+------+
69301792|   63550|   2021-09-24|      0|     2|
69301792|  331024|   2021-09-24|      0|     3|
69301792|  331024|   2021-09-23|      3|     1|
69301792|14251221|   2021-09-24|      0|     1|
```

Pivoting is how we're going to calculate all the metrics for users, so this is an important concept to learn.

## Granularity Multiplication 
Joining tables is one of the most basic functions in SQL. Databases are designed to minimize redundancy of information and they do that by a process known as normalization. Joins then allow us to get all the information back in a single piece by combining these tables together.

Granularity multiplication will happen if the tables you're joining have different levels of detail for the columns being joined on. This will cause the resulting number of rows to multiply.

Let's look at an example:

The `users` table has a grain of one row per user:
```sql
SELECT
	id,
	display_name,
	creation_date,
	reputation
FROM bigquery-public-data.stackoverflow.users
WHERE id = 8974849;
```

Here's the output:
```sql
id     |user_name|creation_date          |reputation|
-------+---------+-----------------------+----------+
8974849|neutrino |2017-11-20 18:16:46.653|       790|
```

Whereas the `post_history` table has multiple rows for the same user:
```sql
SELECT
	id,
	creation_date,
	post_id,
	post_history_type_id AS type_id,
	user_id 
FROM
	bigquery-public-data.stackoverflow.post_history ph
WHERE
	TRUE
	AND ph.creation_date >= '2021-06-01' 
	AND ph.creation_date <= '2021-09-30'
	AND ph.user_id = 8974849;
```

Here's the output:
```sql
id       |creation_date      |post_id |type_id|user_id|
---------+-------------------+--------+-------+-------+
250199272|2021-07-14 00:54:58|68372251|      2|8974849|
250199273|2021-07-14 00:54:58|68372251|      1|8974849|
250199274|2021-07-14 00:54:58|68372251|      3|8974849|
250263915|2021-07-15 00:01:07|68387743|      2|8974849|
250263916|2021-07-15 00:01:07|68387743|      1|8974849|
250263917|2021-07-15 00:01:07|68387743|      3|8974849|
250316277|2021-07-15 16:32:44|68400451|      2|8974849|
```

If we join them on `user_id` the granularity of the final result will be multiplied to have as many rows per user:
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date,
	post_history_type_id AS type_id
FROM
	bigquery-public-data.stackoverflow.post_history ph
	INNER JOIN bigquery-public-data.stackoverflow.users u 
		ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.creation_date >= '2021-06-01' 
	AND ph.creation_date <= '2021-09-30'
	AND ph.user_id = 8974849;
```

Here's the output:
```sql

post_id |user_id|user_name|activity_date      |type_id|
--------+-------+---------+-------------------+-------+
68078326|8974849|neutrino |2021-06-22 02:03:45|      2|
68078326|8974849|neutrino |2021-06-22 02:03:45|      1|
68078326|8974849|neutrino |2021-06-22 02:03:45|      3|
68273785|8974849|neutrino |2021-07-06 11:56:05|      2|
68273785|8974849|neutrino |2021-07-06 11:56:05|      1|
68273785|8974849|neutrino |2021-07-06 11:56:05|      3|
68277148|8974849|neutrino |2021-07-06 16:40:53|      2|
68277148|8974849|neutrino |2021-07-06 16:40:53|      1|
68277148|8974849|neutrino |2021-07-06 16:40:53|      3|
68273785|8974849|neutrino |2021-07-06 12:02:11|      5|
```

Notice how the `user_name` repeats for each row.

So if the history table has 10 entries for the same user and the `users` table has 1, the final result will contain 10 x 1 entries for the same user. If for some reason the `users` contained 2 entries for the same user (messy real world data), we'd see 10 x 2 = 20 entries for that user in the final result and each row would repeat twice.

## Accidental INNER JOIN
Did you know that SQL will ignore a `LEFT JOIN` clause and perform an `INNER JOIN` instead if you make this one simple mistake? This is one of those SQL hidden secrets which sometimes gets asked as a trick question in interviews so strap in.

When doing a `LEFT JOIN` you're intending to show all the results on the table in the `FROM` clause but if you need to limit

Let's take a look at the example query from above:
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	INNER JOIN bigquery-public-data.stackoverflow.users u 
		ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

This query will produce 58 rows. Now let's change the `INNER JOIN` to a `LEFT JOIN`and rerun the query:
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	LEFT JOIN bigquery-public-data.stackoverflow.users u
		ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

Now we get 72 rows!! If you scan the results, you'll notice several where both the `user_name` and the `user_id` are `NULL` which means they're unknown. These could be people who made changes to that post and then deleted their accounts. Notice how the `INNER JOIN` was filtering them out? That's what I mean by data reduction which we discussed previously.

Suppose we only want to see users with a reputation of higher than 50. That's seems pretty straightforward just add the condition to the where clause
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	LEFT JOIN bigquery-public-data.stackoverflow.users u
		ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
	AND u.reputation > 50
ORDER BY
	activity_date;
```

We only get 56 rows! What happened?

Adding filters on the where clause for tables that are left joined will ALWAYS perform an `INNER JOIN` except for one single condition where the left join is preserved. If we wanted to filter rows in the `users` table and still do a `LEFT JOIN`  we have to add the filter in the join condition like so:
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	LEFT JOIN bigquery-public-data.stackoverflow.users u
		ON u.id = ph.user_id
	AND u.reputation > 50		
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

The ONLY time when putting a condition in the `WHERE` clause does NOT turn a `LEFT JOIN` into an `INNER JOIN` is when checking for `NULL`. This is very useful when you want to see the missing data on the table that's being left joined. Here's an example
```sql
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	bigquery-public-data.stackoverflow.post_history ph
	LEFT JOIN bigquery-public-data.stackoverflow.users u
		ON u.id = ph.user_id	
WHERE
	TRUE
	AND ph.post_id = 4
	AND u.id is NULL
ORDER BY
	activity_date;
```
This query gives us the 12 missing users

### Starting with a LEFT JOIN
Since we're on the subject of LEFT JOINS, one of my most used rules of thumb is to always use a `LEFT JOIN` when I'm not sure if one table is a subset of the other. For example in the query above, there's definitely users that have a valid `user_id` in the `users` table but have never had any activity.

This often happens in the real world when data is deleted from a table and there's no foreign key constraints to ensure referential integrity (i.e. the database ensures you can't delete a row if it's referenced in another table. These types of constraints don't exist in data warehouses hence my general rule of thumb of always starting with a `LEFT JOIN`

Now that we have covered the basic concepts, it's time to dive into the patterns.