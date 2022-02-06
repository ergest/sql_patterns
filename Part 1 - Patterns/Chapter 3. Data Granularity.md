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

#### Recap
1. Granularity is a measure of the level of detail that determines an individual row in a table or view.
2. Granularity is usually expressed as the number of unique rows for each column or combination of columns. 
3. If you need to reduce granularity you can use one of two methods:
	1. Using `GROUP BY` Aggregation
	2. Using `DISTINCT`
4. Dates can be manipulated into many different granularities based on how you want to aggregate them

In the next chapter we'll learn how to approach writing this complex query by decomposing it into simpler components.