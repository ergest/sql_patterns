## Chapter 2: Core Concepts
### Granularity
Granularity (also known as the grain) is a measure of the level of detail that determines an individual row in a table or view. This is extremely important when it comes to joins or aggregating data. A low granularity table means a very low level of detail, like one row per transaction.

Granularity is usually expressed as the number of unique rows for each column or combination of columns. 

For example the `users` table has one row per user. That is the lowest grain on it. The `post_history` table, on the other hand, contains a log of all the changes that a user performs on a post on a given date and time. Therefore the granularity is one row per user, per post, per timestamp.

The `comments` table contains a log of all the comments on a post by a user on a given date so its granularity is also one row per user, per post, per date.

The `votes` table contains a log of all the upvotes and downvotes on a post on a given date. It has separate rows for upvotes and downvotes so its granularity is one row per post, per vote type, per date.

To find a table's granularity you either read the documentation, or if that doesn't exist, you make an educated guess and check. Trust but verify. Real world data is messy

How do you check? It's easy.

For the `post_history` table we can run the following query:
```
SELECT 
	creation_date,
	post_id,
	post_history_type_id,
	user_id,
	COUNT(*) AS total_rows
FROM `bigquery-public-data.stackoverflow.post_history`
GROUP BY 1,2,3,4
HAVING COUNT(*) > 1;
```
So I'm aggregating by all the columns I expect to make up the unique row and filtering for any that invalidate my assumption. If my hunch is correct, I should get 0 rows from this query.

But we don't! We get a bunch of duplicate rows:
```
creation_date          |post_id |post_history_type_id|user_id |total_rows|
-----------------------+--------+--------------------+--------+----------+
2020-07-20 05:00:26.413|62964197|                  34|      -1|         2|
2020-08-05 16:31:15.220|63272171|                   5|14038907|         2|
2018-10-08 09:54:40.990|40921767|                   5| 4826457|         2|
2020-05-07 22:02:27.877|61637980|                  34|      -1|         2|
2018-10-13 05:26:22.243|52784015|                   5| 6599590|         2|
2021-01-03 10:35:35.693|65550662|                   5|12833166|         2|
2018-12-02 14:28:12.947|53576317|                   5|10732059|         2|
2018-09-05 04:16:26.440|52140985|                   4| 3623424|         3|
2018-12-17 22:43:27.800|53826052|                   8| 1863229|         2|
2018-09-13 17:13:31.490|52321596|                   5| 5455640|         2|
```

This means we have to be careful when joining with this table on `post_id, user_id, creation_date, post_history_type_id` and we'd have to deal with the duplicate issue first. Let's see a couple of methods for doing that.

### Aggregating Data
When you aggregate data you're moving from a level of low granularity to a level of higher granularity. Please note that this is a "one-way street." By aggregating data you're reducing the level of detail and by definition removing information. But if you store data at this aggregated level, you lose the details.

That's why it's very common in data warehouses to store data at the lowest possible grain you have it and then aggregate it up to whatever level is needed for reporting. You can also use aggregating to deal with duplicate rows, and we have some so let's do it.

Let's refer again to the previous example. 

If I simply select the columns I want without aggregation, we get duplicates which as we mentioned earlier will mess up joins later. (Rows 2 and 3 are the same)
```
SELECT 
	creation_date,
	post_id,
	post_history_type_id,
	user_id
FROM 
	`bigquery-public-data.stackoverflow.post_history`
WHERE 
	post_id = 63272171 
	AND user_id = 14038907
	AND post_history_type_id = 5

creation_date          |post_id |post_history_type_id|user_id |
-----------------------+--------+--------------------+--------+
2020-08-05 15:42:25.130|63272171|                   5|14038907|
2020-08-05 16:31:15.220|63272171|                   5|14038907|
2020-08-05 16:31:15.220|63272171|                   5|14038907|
2020-08-05 16:37:23.983|63272171|                   5|14038907|
2020-08-05 15:34:38.187|63272171|                   5|14038907|
```

By simply adding a `GROUP BY` we can easily solve this problem
```
SELECT 
	creation_date,
	post_id,
	post_history_type_id,
	user_id
FROM 
	`bigquery-public-data.stackoverflow.post_history`
WHERE 
	post_id = 63272171 
	AND user_id = 14038907
	AND post_history_type_id = 5
GROUP BY 1,2,3,4;

creation_date          |post_id |post_history_type_id|user_id |
-----------------------+--------+--------------------+--------+
2020-08-05 16:37:23.983|63272171|                   5|14038907|
2020-08-05 16:31:15.220|63272171|                   5|14038907|
2020-08-05 15:34:38.187|63272171|                   5|14038907|
2020-08-05 15:42:25.130|63272171|                   5|14038907|
```

Notice that for the purposes of removing duplicates we don't need to use an aggregate function like `COUNT()` or `MAX()`, `MIN()` You can achieve the same effect by using `DISTINCT`

Of course using aggregate functions is the most common way to aggregate data. Summing up or counting multiple rows are still the workhorse of aggregation. We'll use that a lot in our project.

Here's a traditional application of it:
```
SELECT
	user_id,
	CAST(creation_date AS DATE) AS activity_date,
	COUNT(*) as total_comments
FROM
	`bigquery-public-data.stackoverflow.comments`
WHERE
	TRUE
	AND creation_date >= CAST('2021-06-01' as TIMESTAMP) 
	AND creation_date <= CAST('2021-09-30' as TIMESTAMP)
GROUP BY
	1,2
```

### Pivoting Data
Here's another pattern that's very commonly used for aggregation:
```
SELECT
	post_id,
	CAST(v.creation_date AS DATE) AS activity_date,
	SUM(CASE WHEN vote_type_id = 2 THEN 1 ELSE 0 END) AS total_upvotes,
	SUM(CASE WHEN vote_type_id = 3 THEN 1 ELSE 0 END) AS total_downvotes,
FROM
	`bigquery-public-data.stackoverflow.votes` v
WHERE
	TRUE
	AND v.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
	AND v.creation_date <= CAST('2021-09-30' as TIMESTAMP)
GROUP BY
	1,2
```

This pattern is commonly known as **Pivoting** because we take data that looks like this
```
id       |creation_date          |post_id |vote_type_id|
---------+-----------------------+--------+------------+
239119706|2021-09-23 20:00:00.000|69301792|           2|
239123009|2021-09-23 20:00:00.000|69301792|           3|
239200936|2021-09-24 20:00:00.000|69301792|           2|
239087730|2021-09-22 20:00:00.000|69301792|           3|
239199214|2021-09-24 20:00:00.000|69301792|           2|
239118872|2021-09-23 20:00:00.000|69301792|           3|
239135887|2021-09-23 20:00:00.000|69301792|           2|
239127938|2021-09-23 20:00:00.000|69301792|           2|
239147153|2021-09-23 20:00:00.000|69301792|           3|
239153591|2021-09-23 20:00:00.000|69301792|           2|
239168079|2021-09-23 20:00:00.000|69301792|           2|
239121664|2021-09-23 20:00:00.000|69301792|           3|
239117803|2021-09-23 20:00:00.000|69301792|           2|
239117878|2021-09-23 20:00:00.000|69301792|           3|
239116194|2021-09-23 20:00:00.000|69301792|           2|
239130104|2021-09-23 20:00:00.000|69301792|           2|
239157135|2021-09-23 20:00:00.000|69301792|           2|
239142497|2021-09-23 20:00:00.000|69301792|           3|
239157729|2021-09-23 20:00:00.000|69301792|           2|
239129111|2021-09-23 20:00:00.000|69301792|           3|
```
and turn it into this
```
post_id |activity_date|total_upvotes|total_downvotes|
--------+-------------+-------------+---------------+
69301792|   2021-09-24|           10|              7|
69301792|   2021-09-25|            2|              0|
69301792|   2021-09-23|            0|              1|
```

by "pivoting" on the vote type 

You'll notice that I manipulate the timestamp column `creation_date` into just a date field without the time information. Date fields are special when it comes to aggregation because they have many layers of granularities built in.

Given a single timestamp, we can construct granularities for seconds, minutes, hours, days, weeks, months, quarters, years, decades. We do that by using one of the many date manipulation functions like `CAST()`,  `DATE_TRUNC()`, `DATE_PART()`, etc. There's way too many of them to mention here and nobody remembers the exact syntax so you just look it up in the documentation.

### Joining Data
Joining tables is one of the most basic functions in SQL since the databases are designed to minimize redundancy of information and the only to do that is to spread information out into multiple tables. This is called normalization. Joins then allow us to get all the information back in a single piece by combining these tables together.

I assume you're familiar with them if you're reading this book, so what I wanted to share with you are certain anti-patterns involving joins that always creep up and burn analysts and data scientists.

### Granularity Multiplication Antipattern
If any of tables has duplicates for the columns being joined on, the final result set will be multiplied by the number of duplicates.

For example in our case the `users` table has a grain of one row per user:
```
SELECT
	id,
	display_name,
	creation_date ,
	reputation,
	views
FROM `bigquery-public-data.stackoverflow.users`
WHERE id = 8974849;


id     |display_name|creation_date          |reputation|views|
-------+------------+-----------------------+----------+-----+
8974849|neutrino    |2017-11-20 18:16:46.653|       790|  107|
```

Whereas the `post_history` table has multiple rows for the same user:
```
SELECT
	id,
	creation_date,
	post_id,
	post_history_type_id,
	user_id 
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
WHERE
	TRUE
	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
	AND ph.user_id = 8974849;


id       |creation_date          |post_id |post_history_type_id|user_id|
---------+-----------------------+--------+--------------------+-------+
250199272|2021-07-14 00:54:58.127|68372251|                   2|8974849|
250199273|2021-07-14 00:54:58.127|68372251|                   1|8974849|
250199274|2021-07-14 00:54:58.127|68372251|                   3|8974849|
250263915|2021-07-15 00:01:07.497|68387743|                   2|8974849|
250263916|2021-07-15 00:01:07.497|68387743|                   1|8974849|
250263917|2021-07-15 00:01:07.497|68387743|                   3|8974849|
250316277|2021-07-15 16:32:44.163|68400451|                   2|8974849|
```

If we join them on `user_id` the granularity of the final result will be multiplied to have as many rows per user:
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date,
	post_history_type_id
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	INNER JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
	AND ph.creation_date <= CAST('2021-09-30' as TIMESTAMP)
	AND ph.user_id = 8974849;

post_id |user_id|user_name|activity_date          |post_history_type_id|
--------+-------+---------+-----------------------+--------------------+
68078326|8974849|neutrino |2021-06-22 02:03:45.830|                   2|
68078326|8974849|neutrino |2021-06-22 02:03:45.830|                   1|
68078326|8974849|neutrino |2021-06-22 02:03:45.830|                   3|
68273785|8974849|neutrino |2021-07-06 11:56:05.827|                   2|
68273785|8974849|neutrino |2021-07-06 11:56:05.827|                   1|
68273785|8974849|neutrino |2021-07-06 11:56:05.827|                   3|
68277148|8974849|neutrino |2021-07-06 16:40:53.003|                   2|
68277148|8974849|neutrino |2021-07-06 16:40:53.003|                   1|
68277148|8974849|neutrino |2021-07-06 16:40:53.003|                   3|
68273785|8974849|neutrino |2021-07-06 12:02:11.913|                   5|
```

Notice how the `user_name` repeats for each row.

So if the history table has 10 entries for the same user and the `users` table has 1, the final result will contain 10 x 1 entries for the same user. If for some reason the `users` contained 2 entries for the same user (messy real world data), we'd see 10 x 2 = 20 entries for that user in the final result.

This is extremely important when doing analysis because a single duplicate row will multiply all your results by a factor of n and all your numbers will be inflated.

### Accidental Inner Join Antipattern
Did you know that SQL will ignore a `LEFT JOIN` clause and perform an `INNER JOIN` instead if you make this one simple mistake? This is one of those SQL hidden secrets which sometimes gets asked as a trick question in interviews so strap in.

When doing a `LEFT JOIN` you're intending to show all the results on the table in the `FROM` clause but if you need to limit

Let's take a look at the example query from above:
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	INNER JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

This query will produce 58 rows. Now let's change the `INNER JOIN` to a `LEFT JOIN`and rerun the query:
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	LEFT JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

Now we get 72 rows!! If you scan the results, you'll notice several where both the `user_name` and the `user_id` are `NULL` which means they're unknown. These could be people who made changes to that post and then deleted their accounts. Notice how the `INNER JOIN` was filtering them out? That's what I mean by data reduction which we discussed previously.

Suppose we only want to see users with a reputation of higher than 50. That's seems pretty straightforward just add the condition to the where clause
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	LEFT JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
WHERE
	TRUE
	AND ph.post_id = 4
	AND u.reputation > 50
ORDER BY
	activity_date;
```

We only get 56 rows! What happened?

Adding filters on the where clause for tables that are left joined will ALWAYS perform an `INNER JOIN` except for one single condition where the left join is preserved. If we wanted to filter rows in the `users` table and still do a `LEFT JOIN`  we have to add the filter in the join condition like so:
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	LEFT JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id
	AND u.reputation > 50		
WHERE
	TRUE
	AND ph.post_id = 4
ORDER BY
	activity_date;
```

The ONLY time when putting a condition in the `WHERE` clause does NOT turn a `LEFT JOIN` into an `INNER JOIN` is when checking for `NULL`. This is very useful when you want to see the missing data on the table that's being left joined. Here's an example
```
SELECT
	ph.post_id,
	ph.user_id,
	u.display_name AS user_name,
	ph.creation_date AS activity_date
FROM
	`bigquery-public-data.stackoverflow.post_history` ph
	LEFT JOIN `bigquery-public-data.stackoverflow.users` u ON u.id = ph.user_id	
WHERE
	TRUE
	AND ph.post_id = 4
	AND u.id is NULL
ORDER BY
	activity_date;
```
Now we only get the 12 missing users

### Appending Data
You can combine the rows from multiple tables in order to make a longer table by simply appending the rows from one table by using the `UNION` operator.

For example we can combine two of the posts tables like this:
```
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
 ```

There are two types of unions, `UNION ALL` and `UNION` (distinct) 

`UNION ALL` will append two tables without checking if they have the same exact row. This might cause duplicates but it's really fast. If you know for sure your tables don't contain duplicates, this is the preferred way to append them. 

`UNION` (distinct) will append the tables but remove all duplicates from the final result thus guaranteeing unique rows for the final result set. This of course is slower because of the extra operations to remove duplicates. Use this only when you're not sure if the tables contain duplicates or you cannot remove duplicates beforehand.

Most SQL flavors only use `UNION` keyword for the distinct version, but BigQuery forces you to use `UNION DISTINCT` in order to make the query far more explicit

Appending rows to a table also has two requirements:
1. The number of the columns from all tables has to be the same
2. The data types of the columns from all the tables has to line up 

One of the most annoying things when appending two or more tables with a lot of columns is lining up all the columns in the right order. There's been many a time when I've had to use Excel to line up the columns. There's no shame in admitting that.

As a rule of thumb, whenever you're appending tables, it's a good idea to add a constant column to indicate the source table or some kind of type. This is helpful when appending say activity tables to create a long, time-series table and you want to identify each activity type in the final result set.

You'll notice in my query above I create a `post_type` column indicating where the data is coming from.

### De-Pivoting Data Pattern
We saw how to pivot data above, but can you reverse the process? Well, sort of. As I said before, aggregation is a "one-way street" meaning that once you aggregate, you lose important information, however it is possible to "de-pivot" data using the `UNION` operator like this:

```
WITH votes_pivot AS (
	SELECT
		post_id,
		CAST(v.creation_date AS DATE) AS activity_date,
		SUM(CASE WHEN vote_type_id = 2 THEN 1 ELSE 0 END) AS total_upvotes,
		SUM(CASE WHEN vote_type_id = 3 THEN 1 ELSE 0 END) AS total_downvotes,
	FROM
		`bigquery-public-data.stackoverflow.votes` v
	WHERE
		TRUE
		AND v.creation_date >= CAST('2021-06-01' as TIMESTAMP) 
		AND v.creation_date <= CAST('2021-09-30' as TIMESTAMP)
		AND post_id = 69301792
	GROUP BY
		1,2
)
SELECT 
	activity_date,
	2 AS vote_type_id,
	total_upvotes AS votes
FROM
	votes_pivot

UNION ALL 

SELECT 
	activity_date,
	3 AS vote_type_id,
	total_downvotes AS votes
FROM 
	votes_pivot
ORDER BY
	activity_date;

activity_date|vote_type_id|votes|
-------------+------------+-----+
   2021-09-23|           2|    0|
   2021-09-23|           3|    1|
   2021-09-24|           3|    7|
   2021-09-24|           2|   10|
   2021-09-25|           3|    0|
   2021-09-25|           2|    2|
```

The above query uses a CTE (Common Table Expression) which will be covered in the next chapter in more detail. You can see how we've "de-pivoted" the data but not quite recovered the original 20 rows.