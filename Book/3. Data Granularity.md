Granularity is a measure of the level of detail that determines an individual row in a table or view. The reason it's the most important concept is because when you join two tables with different granularities the final number of rows gets multiplied. So if one of the tables contains duplicate rows you will duplicate the final result causing inaccuracies.

Granularity is usually expressed as the number of unique rows for each column or combination of columns. 

For example we'd say "This table has one row per `user_id`" if it's just one column or "This has table has one row per `user_id` per date" which means that there are multiple rows for the same user id in different dates but only one row per user on a given date.

Understanding a table's granularity lets us understand the purpose for which it was built and allows our queries against to be designed accurately from the start. If a table happens to be poorly designed or have messy data we might have to get creative with our queries to manipulate granularity.

For example the `post_history` table contains a log of all the changes that a user can perform on a post on a given date. Therefore the granularity is one row per user, per post, per date.

The `comments` table contains a log of all the comments on a post by a user on a given date so its granularity is also one row per user, per post, per date.

The `votes` table contains a log of all the upvotes and downvotes on a post on a given date. It has separate rows for upvotes and downvotes so its granularity is one row per post, per vote type, per date.

To find a table's granularity you either read the documentation, or if you're suspicious like me, you make an educated guess and check. Trust but verify. Real world data is messy

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

This means we have to be careful when joining with this table on `post_id, user_id, creation_date, post_history_type_id` and we'd have to deal with the duplicate issue first.

#### Pattern 1 - Reducing Granularity
We have finally reached our very first pattern. While we're not in the meat of the project yet, it's important to learn this pattern now. You use this pattern to go from a high level of granularity to a lower level of granularity. 

Please note that this is a "one-way street." By reducing granularity you're reducing the level of detail and by definition removing information. This is fine for reporting because as long as you have the low granularity table around you can still get it back.

You can use this pattern to deal with duplicate rows, as we have to do for the above data, but also when you want to transform the data to a lower granularity before joining.

##### Method 1 - Using Aggregation
The easiest way to reduce granularity is through aggregation grouping by only the columns you want. 

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

This is by far the most popular method that guarantees you'll have no duplicates

##### Method 2 - Using Distinct
By using the `DISTINCT`keyword in SQL and selecting the columns we want, we can directly get the unique ones without using any aggregation.

```
SELECT DISTINCT
	creation_date,
	post_id,
	post_history_type_id,
	user_id
FROM 
	`bigquery-public-data.stackoverflow.post_history`
WHERE 
	post_id = 63272171 
	AND user_id = 14038907
	AND post_history_type_id = 5;

creation_date          |post_id |post_history_type_id|user_id |
-----------------------+--------+--------------------+--------+
2020-08-05 16:37:23.983|63272171|                   5|14038907|
2020-08-05 16:31:15.220|63272171|                   5|14038907|
2020-08-05 15:34:38.187|63272171|                   5|14038907|
2020-08-05 15:42:25.130|63272171|                   5|14038907|
```

So which one should you use?

 `DISTINCT` only works to remove duplicates.
 `GROUP BY` can remove duplicates and lets you use aggregate functions.

#### Date Hierarchies
Given a single timestamp, we can construct granularities for seconds, minutes, hours, days, weeks, months, quarters, years, decades. We do that by using one of the many date manipulation functions. There's way too many of them to mention here and nobody remembers the exact syntax so everyone always look it up in the documents.

#### Granularity Multiplication
Joining tables is one of the most basic functions in SQL since the databases are designed to minimize redundancy of information and the only to do that is to spread information out into multiple tables. This is called normalization. Joins then allow us to get all the information back in a single piece by combining these tables together.

We've been already looking at joins, and I assume you're familiar with them if you're reading this book. What I wanted to show in this chapter are certain patterns involving joins that always creep up and burn analysts and data scientists.

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

So if the history table has 10 entries for the same user and the `users` table has 1, the final result will contain 10 x 1 entries for the same user. If for some reason the `users` contained 2 entries for the same user (messy real world data), we'd see 10 x 2 = 20 entries for that user in the final result.

This is extremely important when doing analysis because a single duplicate row will multiply all your results by a factor of n and all your numbers will be inflated.

#### Accidental Inner Join
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

#### Recap
1. Granularity is a measure of the level of detail that determines an individual row in a table or view.
2. Granularity is usually expressed as the number of unique rows for each column or combination of columns. 
3. If you need to reduce granularity you can use one of two methods:
	1. Using `GROUP BY` Aggregation
	2. Using `DISTINCT`
4. Dates can be manipulated into many different granularities based on how you want to aggregate them

In the next chapter we'll learn how to approach writing this complex query by decomposing it into simpler components.